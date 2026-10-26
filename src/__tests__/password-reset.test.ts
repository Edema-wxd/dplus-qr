/** @jest-environment node */

const requestPasswordReset = jest.fn();
const resetPassword = jest.fn();
const redirect = jest.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});

jest.mock("@/lib/auth/server", () => ({
  auth: {
    requestPasswordReset: (...a: unknown[]) => requestPasswordReset(...a),
    resetPassword: (...a: unknown[]) => resetPassword(...a),
  },
}));
jest.mock("next/navigation", () => ({ redirect: (u: string) => redirect(u) }));
jest.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ host: "qr.example.com", "x-forwarded-proto": "https" }),
}));

import { forgotPasswordAction } from "@/app/(app)/auth/forgot-password/actions";
import { resetPasswordAction } from "@/app/(app)/auth/reset-password/actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, "error").mockImplementation(() => {});
});

describe("forgotPasswordAction", () => {
  it("rejects a malformed address without calling the service", async () => {
    const r = await forgotPasswordAction({}, form({ email: "nope" }));
    expect(r.error).toMatch(/valid email/i);
    expect(requestPasswordReset).not.toHaveBeenCalled();
  });

  it("sends an absolute redirect on this origin, lower-cased email", async () => {
    requestPasswordReset.mockResolvedValue({ error: null });
    await forgotPasswordAction({}, form({ email: "  Me@Example.COM " }));
    expect(requestPasswordReset).toHaveBeenCalledWith({
      email: "me@example.com",
      redirectTo: "https://qr.example.com/auth/reset-password",
    });
  });

  it("answers the same whether or not the account exists", async () => {
    requestPasswordReset.mockResolvedValueOnce({ error: null });
    const found = await forgotPasswordAction({}, form({ email: "a@b.co" }));
    requestPasswordReset.mockResolvedValueOnce({ error: { code: "USER_NOT_FOUND" } });
    const missing = await forgotPasswordAction({}, form({ email: "a@b.co" }));
    expect({ ...found, sentAt: 0 }).toEqual({ ...missing, sentAt: 0 });
    expect(missing.error).toBeUndefined();
  });
});

describe("resetPasswordAction", () => {
  it("treats a missing token as a bad link", async () => {
    const r = await resetPasswordAction({}, form({ token: "", password: "longenough1" }));
    expect(r.invalidLink).toBe(true);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("enforces the length rule before calling the service", async () => {
    const r = await resetPasswordAction({}, form({ token: "t", password: "short" }));
    expect(r.error).toMatch(/at least 8/i);
    expect(resetPassword).not.toHaveBeenCalled();
  });

  it("maps an invalid or expired token to the fresh-link state", async () => {
    resetPassword.mockResolvedValue({ error: { code: "INVALID_TOKEN", message: "Invalid token" } });
    const r = await resetPasswordAction({}, form({ token: "t", password: "longenough1" }));
    expect(r.invalidLink).toBe(true);
  });

  it("does not leak a provider message on an unknown failure", async () => {
    resetPassword.mockResolvedValue({ error: { message: "db connection refused at 10.0.0.4" } });
    const r = await resetPasswordAction({}, form({ token: "t", password: "longenough1" }));
    expect(r.error).not.toMatch(/10\.0\.0\.4/);
  });

  it("returns to sign-in with the success flag", async () => {
    resetPassword.mockResolvedValue({ error: null });
    await expect(
      resetPasswordAction({}, form({ token: "t", password: "longenough1" }))
    ).rejects.toThrow("REDIRECT:/auth/sign-in?reset=1");
  });
});
