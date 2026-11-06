/** @jest-environment node */

/**
 * `/admin` goes through the proxy for one reason: Neon Auth occasionally
 * rotates the session cookie on a session read, and a page cannot write a
 * cookie, so an admin page that did the read itself threw. The proxy does
 * the read first, as it does for `/app`.
 *
 * What it must never do for `/admin` is send a signed-out visitor to
 * sign-in: that redirect says there is something here. These hold both.
 *
 * Neon Auth's middleware is stubbed: the package ships only as ES modules,
 * which this suite cannot load. Each stub answers the way the real one does
 * (a sign-in redirect for no session, or "carry on" with refreshed cookies).
 */

import { NextRequest, NextResponse } from "next/server";

const middleware = jest.fn<Promise<Response>, [NextRequest]>();
const middlewareFactory = jest.fn((options: { loginUrl: string }) => {
  void options;
  return middleware;
});
jest.mock("@/lib/auth/server", () => ({
  auth: { middleware: (options: { loginUrl: string }) => middlewareFactory(options) },
}));

import proxy, { config } from "@/proxy";

const ORIGIN = "https://qriateplus.com";

function request(path: string) {
  return new NextRequest(new URL(path, ORIGIN));
}

/** What Neon Auth's middleware answers when there is no session. */
function toSignIn(path: string) {
  const login = new URL("/auth/sign-in", ORIGIN);
  login.searchParams.set("from", path);
  return NextResponse.redirect(login);
}

/** What it answers for a live session it has just refreshed. */
function refreshed() {
  const response = NextResponse.next();
  response.headers.append("Set-Cookie", "__Secure-neon-auth.local.session_data=fresh; Path=/; HttpOnly; Secure");
  return response;
}

beforeEach(() => {
  middleware.mockReset();
  middlewareFactory.mockClear();
});

describe("/admin", () => {
  it.each(["/admin", "/admin/customers", "/admin/codes/12"])(
    "never sends a signed-out visitor at %s to sign-in",
    async (path) => {
      middleware.mockResolvedValue(toSignIn(path));
      const response = await proxy(request(path));

      expect(response.headers.get("location")).toBeNull();
      // Carry on to the page, whose staff check answers with the 404.
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("passes a refreshed session through, so the page never writes the cookie", async () => {
    middleware.mockResolvedValue(refreshed());
    const response = await proxy(request("/admin/customers"));

    expect(response.headers.getSetCookie().join("\n")).toContain("session_data=fresh");
  });

  it("leaves any other redirect alone, such as finishing a social sign-in", async () => {
    middleware.mockResolvedValue(NextResponse.redirect(new URL("/admin/customers?verified=1", ORIGIN)));
    const response = await proxy(request("/admin/customers?neon_auth_session_verifier=x"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/admin/customers?verified=1`);
  });

  it("does not mistake a path that only starts with the same letters", async () => {
    // Not in the matcher, but the check must not lean on that.
    middleware.mockResolvedValue(toSignIn("/administrator"));
    const response = await proxy(request("/administrator"));
    expect(response.headers.get("location")).toContain("/auth/sign-in");
  });
});

describe("the signed-in areas", () => {
  it.each(["/app", "/app/files", "/account", "/billing"])("still send a signed-out visitor at %s to sign-in", async (path) => {
    middleware.mockResolvedValue(toSignIn(path));
    const response = await proxy(request(path));

    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });

  it("ask the middleware for the site's sign-in page", async () => {
    middleware.mockResolvedValue(refreshed());
    await proxy(request("/app"));
    expect(middlewareFactory).toHaveBeenCalledWith({ loginUrl: "/auth/sign-in" });
  });
});

describe("the matcher", () => {
  it("lists only the signed-in areas: never a catch-all, never a code path", () => {
    expect(config.matcher).toEqual(["/account/:path*", "/admin/:path*", "/app/:path*", "/billing/:path*"]);
  });
});
