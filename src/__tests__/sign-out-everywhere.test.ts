import { NextRequest, NextResponse } from "next/server";
import { sessionIdOf, signSessionDataForTest, verifiedSession } from "@/lib/session-cookie";

/**
 * Signing out ends every session on every device, at once (DECISIONS.md,
 * 11 November 2026). Three parts make that true, and each is tested here:
 *
 * - the action revokes them all and clears this device's cookies;
 * - `auth.getSession()` refuses a session whose row is gone, however fresh
 *   the device's cached copy;
 * - the proxy's staff check does the same, so the admin goes too.
 *
 * Neon Auth, the database and Next's request APIs are stubbed.
 */

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const SESSION = "6f1c2a9e-3b4d-4e5f-8a7b-9c0d1e2f3a4b";
const OTHER = "0a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d";

// ---- Stubs ---------------------------------------------------------------

const sdkGetSession = jest.fn();
const revokeSessions = jest.fn();
jest.mock("@neondatabase/auth/next/server", () => ({
  createNeonAuth: () => ({
    getSession: (...args: unknown[]) => sdkGetSession(...args),
    revokeSessions: (...args: unknown[]) => revokeSessions(...args),
    middleware: () => middleware,
  }),
}));

const sessionIsLive = jest.fn<Promise<boolean>, [string]>();
const endAllSessions = jest.fn<Promise<number>, [string]>();
jest.mock("@/lib/auth/sessions", () => ({
  sessionIdOf: jest.requireActual("@/lib/session-cookie").sessionIdOf,
  sessionIsLive: (id: string) => sessionIsLive(id),
  endAllSessions: (id: string) => endAllSessions(id),
}));

const isAdmin = jest.fn<Promise<boolean>, [string]>();
jest.mock("@/lib/admin", () => ({ isAdmin: (id: string) => isAdmin(id) }));
const reportError = jest.fn(async (..._args: unknown[]) => {});
jest.mock("@/lib/error-alerts", () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

type Jar = Map<string, { value: string; maxAge?: number }>;
let jar: Jar;
jest.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...jar.entries()].map(([name, c]) => ({ name, value: c.value })),
    set: (name: string, value: string, options: { maxAge?: number }) =>
      jar.set(name, { value, maxAge: options.maxAge }),
  }),
}));
const flash = jest.fn(async (_key: string) => {});
jest.mock("@/lib/flash", () => ({ flash: (key: string) => flash(key) }));
class Redirected extends Error {
  constructor(public url: string) {
    super(url);
  }
}
jest.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));

const middleware = jest.fn<Promise<Response>, [NextRequest]>();

import { auth } from "@/lib/auth/server";
import { signOutAction } from "@/app/(app)/auth/sign-in/actions";
import proxy from "@/proxy";

const sessionFor = (id: string | undefined) => ({
  data: { session: { id, userId: "u1" }, user: { id: "u1", email: "a@example.test" } },
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEON_AUTH_BASE_URL = "https://auth.example.test";
  process.env.NEON_AUTH_COOKIE_SECRET = SECRET;
  jar = new Map();
  revokeSessions.mockResolvedValue({ data: { status: true }, error: null });
  endAllSessions.mockResolvedValue(2);
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

// ---- The session id ------------------------------------------------------

describe("the session id", () => {
  it("is read from a session, and only when it is a uuid the table can be asked about", () => {
    expect(sessionIdOf({ session: { id: SESSION } })).toBe(SESSION);
    expect(sessionIdOf({ session: { id: "s1" } })).toBeNull();
    expect(sessionIdOf({ session: {} })).toBeNull();
    expect(sessionIdOf(null)).toBeNull();
  });

  it("comes with the user from a signed session_data cookie", () => {
    const token = signSessionDataForTest({ session: { id: SESSION }, user: { id: "u1" } }, SECRET, Date.now() + 60_000);
    expect(verifiedSession(token, SECRET)).toEqual({ userId: "u1", sessionId: SESSION });
  });
});

// ---- getSession ----------------------------------------------------------

describe("auth.getSession()", () => {
  it("returns a session whose row still exists", async () => {
    sdkGetSession.mockResolvedValue(sessionFor(SESSION));
    sessionIsLive.mockResolvedValue(true);
    expect((await auth.getSession()).data?.user?.id).toBe("u1");
    expect(sessionIsLive).toHaveBeenCalledWith(SESSION);
  });

  it("refuses a session signed out elsewhere, though the device's cached copy is still fresh", async () => {
    sdkGetSession.mockResolvedValue(sessionFor(OTHER));
    sessionIsLive.mockResolvedValue(false);
    expect(await auth.getSession()).toEqual({ data: null, error: null });
  });

  it("trusts the SDK when the database cannot be asked, rather than signing everyone out", async () => {
    sdkGetSession.mockResolvedValue(sessionFor("1b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e"));
    sessionIsLive.mockRejectedValue(new Error("database down"));
    expect((await auth.getSession()).data?.user?.id).toBe("u1");
  });

  it("asks nothing when there is no session", async () => {
    sdkGetSession.mockResolvedValue({ data: null, error: null });
    expect(await auth.getSession()).toEqual({ data: null, error: null });
    expect(sessionIsLive).not.toHaveBeenCalled();
  });
});

// ---- The sign-out action -------------------------------------------------

describe("signing out", () => {
  const signOut = async () => {
    const thrown = await signOutAction().catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Redirected);
    return (thrown as Redirected).url;
  };

  beforeEach(() => {
    sdkGetSession.mockResolvedValue(sessionFor(SESSION));
    sessionIsLive.mockResolvedValue(true);
    jar.set("__Secure-neon-auth.session_token", { value: "t" });
    jar.set("__Secure-neon-auth.local.session_data", { value: "d" });
    jar.set("qr_flash", { value: "x" });
  });

  it("ends every session the person has, through Neon Auth and in the table", async () => {
    expect(await signOut()).toBe("/auth/sign-in");
    expect(revokeSessions).toHaveBeenCalled();
    expect(endAllSessions).toHaveBeenCalledWith("u1");
    expect(flash).toHaveBeenCalledWith("signed-out");
  });

  it("clears this device's auth cookies and nothing else", async () => {
    await signOut();
    expect(jar.get("__Secure-neon-auth.session_token")).toEqual({ value: "", maxAge: 0 });
    expect(jar.get("__Secure-neon-auth.local.session_data")).toEqual({ value: "", maxAge: 0 });
    expect(jar.get("qr_flash")).toEqual({ value: "x" });
  });

  it("still ends them all when Neon Auth's revoke fails, because the rows go anyway", async () => {
    revokeSessions.mockResolvedValue({ data: null, error: { message: "upstream" } });
    await signOut();
    expect(endAllSessions).toHaveBeenCalledWith("u1");
    expect(flash).toHaveBeenCalledWith("signed-out");
  });

  it("says so when neither could end the other devices, and still signs this one out", async () => {
    revokeSessions.mockResolvedValue({ data: null, error: { message: "upstream" } });
    endAllSessions.mockRejectedValue(new Error("database down"));
    expect(await signOut()).toBe("/auth/sign-in");
    expect(flash).toHaveBeenCalledWith("signed-out-here-only");
    expect(reportError).toHaveBeenCalled();
    expect(jar.get("__Secure-neon-auth.session_token")?.maxAge).toBe(0);
  });

  it("clears the cookies of a session that has already ended", async () => {
    sessionIsLive.mockResolvedValue(false);
    expect(await signOut()).toBe("/auth/sign-in");
    expect(revokeSessions).not.toHaveBeenCalled();
    expect(jar.get("__Secure-neon-auth.session_token")?.maxAge).toBe(0);
  });
});

// ---- The proxy's staff check ---------------------------------------------

describe("the admin, after signing out everywhere", () => {
  const adminRequest = (sessionId: string) =>
    new NextRequest(new URL("/admin", "https://qriateplus.com"), {
      headers: {
        cookie: [
          "__Secure-neon-auth.session_token=t",
          `__Secure-neon-auth.local.session_data=${signSessionDataForTest(
            { session: { id: sessionId, userId: "staff-1" }, user: { id: "staff-1" } },
            SECRET,
            Date.now() + 300_000
          )}`,
        ].join("; "),
      },
    });

  it("is the missing page for a staff session whose row is gone", async () => {
    middleware.mockResolvedValueOnce(NextResponse.next());
    sessionIsLive.mockResolvedValue(false);
    const response = await proxy(adminRequest(OTHER));
    expect(new URL(response.headers.get("x-middleware-rewrite")!).pathname).toBe("/_nowhere/404");
    expect(isAdmin).not.toHaveBeenCalled();
  });

  it("still opens for a live staff session", async () => {
    const next = NextResponse.next();
    middleware.mockResolvedValueOnce(next);
    sessionIsLive.mockResolvedValue(true);
    isAdmin.mockResolvedValue(true);
    expect(await proxy(adminRequest(SESSION))).toBe(next);
  });
});
