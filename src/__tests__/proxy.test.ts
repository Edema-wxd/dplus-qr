import { NextRequest, NextResponse } from "next/server";

/**
 * `/admin` goes through the proxy so the session is refreshed before the page
 * reads it (a page cannot write the refreshed cookie), but it must never be
 * redirected to sign-in: a signed-out visitor gets the ordinary 404 from
 * `requireStaff()`, so the admin is not discoverable by probing it.
 */
const middleware = jest.fn<Promise<Response>, [NextRequest]>();
jest.mock("@/lib/auth/server", () => ({
  auth: { middleware: () => middleware },
}));

import proxy, { config } from "@/proxy";

const request = (path: string) => new NextRequest(new URL(path, "https://qriateplus.com"));

function signedOut(path: string, cookies: string[] = []) {
  const target = new URL(`/auth/sign-in?redirect=${encodeURIComponent(path)}`, "https://qriateplus.com");
  const response = NextResponse.redirect(target);
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  middleware.mockResolvedValueOnce(response);
}

beforeEach(() => middleware.mockReset());

describe("proxy", () => {
  it("still sends a signed-out visitor on the app to sign-in", async () => {
    signedOut("/app");
    const response = await proxy(request("/app"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });

  it.each(["/admin", "/admin/customers", "/admin/reports/abc"])(
    "never redirects %s to sign-in",
    async (path) => {
      signedOut(path);
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
  );

  it("keeps cookies the middleware cleared when it passes the admin through", async () => {
    const cleared = "__Secure-neon-auth.local.session_data=; Path=/; Max-Age=0";
    signedOut("/admin", [cleared]);
    const response = await proxy(request("/admin"));
    expect(response.headers.getSetCookie()).toEqual([cleared]);
  });

  it("passes a refreshed admin session through untouched", async () => {
    const refreshed = NextResponse.next();
    refreshed.headers.append("Set-Cookie", "__Secure-neon-auth.session_token=new; Path=/");
    middleware.mockResolvedValueOnce(refreshed);
    expect(await proxy(request("/admin"))).toBe(refreshed);
  });

  it("does not treat a route that merely starts with admin as the admin", async () => {
    signedOut("/administrator");
    const response = await proxy(request("/administrator"));
    expect(response.status).toBe(307);
  });

  it("covers the admin and keeps the redirect path out of the matcher", () => {
    expect(config.matcher).toContain("/admin/:path*");
    expect(config.matcher).not.toContain("/:path*");
  });
});
