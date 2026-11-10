/** @jest-environment node */

/**
 * Sign-in, sign-up and reset are limited here, before Managed Auth, because
 * Managed Auth never sees the visitor's IP (security audit, 10 November 2026).
 * What each action spends, and that a refused attempt never reaches the
 * service.
 */

const signInEmail = jest.fn();
const signUpEmail = jest.fn();
const requestPasswordReset = jest.fn();
const handlerGet = jest.fn(async () => new Response("ok"));
const redirect = jest.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

jest.mock("@/lib/auth/server", () => ({
  auth: {
    signIn: { email: (...a: unknown[]) => signInEmail(...a) },
    signUp: { email: (...a: unknown[]) => signUpEmail(...a) },
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    handler: () => ({ GET: handlerGet }),
  },
}));
jest.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
jest.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "qriateplus.com", "x-forwarded-for": "203.0.113.9" }),
}));
jest.mock("@/lib/flash", () => ({ flash: async () => {} }));
jest.mock("@/lib/profile", () => ({ ensureProfile: async () => {} }));
jest.mock("@/lib/onboarding", () => ({ startOnboardingAtSignUp: async () => {} }));
jest.mock("@/lib/signup-source", () => ({
  SIGNUP_REF_PARAM: "ref",
  parseSignupRef: () => null,
  recordSignupSource: async () => {},
}));

/** Which limits are spent or checked, and what each answers. */
const spent: { kind: string; key: string | null }[] = [];
const checked: { kind: string; key: string | null }[] = [];
let refuse = new Set<string>();
jest.mock("@/lib/ratelimit", () => {
  const actual = jest.requireActual("@/lib/ratelimit");
  return {
    emailRateKey: actual.emailRateKey,
    allowAuth: async (kind: string, key: string | null) => {
      spent.push({ kind, key });
      return !refuse.has(kind);
    },
    authBudgetLeft: async (kind: string, key: string | null) => {
      checked.push({ kind, key });
      return !refuse.has(kind);
    },
  };
});

import { signInAction } from "@/app/(app)/auth/sign-in/actions";
import { signUpAction } from "@/app/(app)/auth/sign-up/actions";
import { forgotPasswordAction } from "@/app/(app)/auth/forgot-password/actions";
import { DELETE, GET, PATCH, POST, PUT } from "@/app/api/auth/[...path]/route";
import { emailRateKey } from "@/lib/ratelimit";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

const kinds = (list: { kind: string }[]) => list.map((x) => x.kind);

beforeEach(() => {
  jest.clearAllMocks();
  spent.length = 0;
  checked.length = 0;
  refuse = new Set();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("emailRateKey", () => {
  it("never contains the address, and treats case and spaces as the same address", () => {
    const key = emailRateKey("Ada@Example.com");
    expect(key).not.toContain("ada");
    expect(key).toHaveLength(32);
    expect(emailRateKey(" ada@example.COM ")).toBe(key);
  });
});

describe("signInAction", () => {
  const attempt = () => signInAction({}, form({ email: "ada@example.com", password: "wrong" }));

  it("refuses a visitor over the limit without asking Managed Auth", async () => {
    refuse.add("sign-in-visitor");
    const r = await attempt();
    expect(r.error).toMatch(/too many/i);
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("refuses an account with no failures left, without naming whether it exists", async () => {
    refuse.add("sign-in-account");
    const r = await attempt();
    expect(r.error).toMatch(/too many failed attempts for that email/i);
    expect(signInEmail).not.toHaveBeenCalled();
  });

  it("spends the account's budget on a failure, keyed on a hash of the address", async () => {
    signInEmail.mockResolvedValue({ error: { message: "Invalid" } });
    await attempt();
    expect(kinds(spent)).toEqual(["sign-in-visitor", "sign-in-account"]);
    expect(spent[1].key).toBe(emailRateKey("ada@example.com"));
    expect(spent[0].key).not.toContain("203.0.113.9");
  });

  it("does not spend the account's budget on a success", async () => {
    signInEmail.mockResolvedValue({ error: null });
    await expect(attempt()).rejects.toThrow("REDIRECT:/app");
    expect(kinds(spent)).toEqual(["sign-in-visitor"]);
  });
});

describe("signUpAction", () => {
  it("refuses a visitor over the limit without creating anything", async () => {
    refuse.add("sign-up-visitor");
    const r = await signUpAction(
      {},
      form({ name: "Ada Stores", email: "ada@example.com", password: "long enough" })
    );
    expect(r.error).toMatch(/too many/i);
    expect(signUpEmail).not.toHaveBeenCalled();
  });
});

describe("forgotPasswordAction", () => {
  it("over the limit, sends nothing and answers exactly as if it had", async () => {
    refuse.add("reset-account");
    const r = await forgotPasswordAction({}, form({ email: "ada@example.com" }));
    expect(r.sentTo).toBe("ada@example.com");
    expect(r.error).toBeUndefined();
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("spends the visitor's and the address's budgets when it sends", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    await forgotPasswordAction({}, form({ email: "ada@example.com" }));
    expect(kinds(spent)).toEqual(["reset-visitor", "reset-account"]);
    expect(requestPasswordReset).toHaveBeenCalledTimes(1);
  });
});

describe("the /api/auth proxy", () => {
  it("answers every write with a 404, so the auth API cannot be called around the limits", async () => {
    for (const write of [POST, PUT, DELETE, PATCH]) {
      const response = await write();
      expect(response.status).toBe(404);
    }
    expect(handlerGet).not.toHaveBeenCalled();
  });

  it("passes GETs through, for the verification and reset links", async () => {
    const request = new Request("https://qriateplus.com/api/auth/verify-email?token=x");
    const response = await GET(request, {});
    expect(response.status).toBe(200);
    expect(handlerGet).toHaveBeenCalledWith(request, {});
  });
});
