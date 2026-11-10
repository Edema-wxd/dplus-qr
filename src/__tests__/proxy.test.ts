import { NextRequest, NextResponse } from "next/server";
import { signSessionDataForTest } from "@/lib/session-cookie";

/**
 * `/admin` goes through the proxy so the session is refreshed before the page
 * reads it (a page cannot write the refreshed cookie), and so that nobody who
 * is not staff can tell it exists: they get the response any missing page
 * gets, never a redirect to sign-in and never the admin's own loading shell.
 * When the proxy cannot tell, the page's `requireStaff()` decides, as before.
 *
 * Neon Auth's middleware and the role lookup are stubbed.
 */
const middleware = jest.fn<Promise<Response>, [NextRequest]>();
jest.mock("@/lib/auth/server", () => ({
  auth: { middleware: () => middleware },
}));
const isAdmin = jest.fn<Promise<boolean>, [string]>();
jest.mock("@/lib/admin", () => ({ isAdmin: (id: string) => isAdmin(id) }));
const resolvePublicSlug = jest.fn<Promise<unknown>, [string]>();
jest.mock("@/lib/blog", () => ({ resolvePublicSlug: (slug: string) => resolvePublicSlug(slug) }));
const reportError = jest.fn(async (..._args: unknown[]) => {});
jest.mock("@/lib/error-alerts", () => ({ reportError: (...args: unknown[]) => reportError(...args) }));

import proxy, { config } from "@/proxy";

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const TOKEN = "__Secure-neon-auth.session_token";
const DATA = "__Secure-neon-auth.local.session_data";
const NOWHERE = "/_nowhere/404";

const sessionData = (userId: string, secret = SECRET, expiresAt = Date.now() + 300_000) =>
  signSessionDataForTest({ session: { userId }, user: { id: userId } }, secret, expiresAt);

const request = (path: string, cookies: Record<string, string> = {}) =>
  new NextRequest(new URL(path, "https://qriateplus.com"), {
    headers: Object.keys(cookies).length
      ? { cookie: Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join("; ") }
      : {},
  });

function signedOut(path: string, cookies: string[] = []) {
  const target = new URL(`/auth/sign-in?redirect=${encodeURIComponent(path)}`, "https://qriateplus.com");
  const response = NextResponse.redirect(target);
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  middleware.mockResolvedValueOnce(response);
}

function allowed(cookies: string[] = []) {
  const response = NextResponse.next();
  for (const cookie of cookies) response.headers.append("Set-Cookie", cookie);
  middleware.mockResolvedValueOnce(response);
  return response;
}

const rewrittenTo = (response: Response) => {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
};

beforeEach(() => {
  middleware.mockReset();
  isAdmin.mockReset();
  process.env.NEON_AUTH_COOKIE_SECRET = SECRET;
  jest.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe("the app", () => {
  it("still sends a signed-out visitor to sign-in", async () => {
    signedOut("/app");
    const response = await proxy(request("/app"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/auth/sign-in");
  });
});

describe("the admin, for someone who is not staff", () => {
  it.each(["/admin", "/admin/customers", "/admin/reports/abc"])(
    "answers a signed-out visitor at %s as a missing page, never a redirect",
    async (path) => {
      signedOut(path);
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(rewrittenTo(response)).toBe(NOWHERE);
      expect(isAdmin).not.toHaveBeenCalled();
    }
  );

  it("keeps cookies the middleware cleared", async () => {
    const cleared = `${DATA}=; Path=/; Max-Age=0`;
    signedOut("/admin", [cleared]);
    const response = await proxy(request("/admin"));
    expect(response.headers.getSetCookie()).toEqual([cleared]);
  });

  it("answers a signed-in customer as a missing page, keeping their refreshed session", async () => {
    isAdmin.mockResolvedValue(false);
    const fresh = `${DATA}=${sessionData("customer-1")}; Path=/; HttpOnly; Secure`;
    allowed([fresh]);

    const response = await proxy(request("/admin/customers", { [TOKEN]: "t" }));

    expect(isAdmin).toHaveBeenCalledWith("customer-1");
    expect(rewrittenTo(response)).toBe(NOWHERE);
    expect(response.headers.getSetCookie()).toEqual([fresh]);
  });
});

describe("the admin, for staff", () => {
  it("passes them through untouched, reading the session they already hold", async () => {
    isAdmin.mockResolvedValue(true);
    const refreshed = allowed();
    const response = await proxy(request("/admin", { [TOKEN]: "t", [DATA]: sessionData("staff-1") }));
    expect(isAdmin).toHaveBeenCalledWith("staff-1");
    expect(response).toBe(refreshed);
  });

  it("reads the copy the middleware has just refreshed over a stale one", async () => {
    isAdmin.mockImplementation(async (id) => id === "staff-1");
    const refreshed = allowed([`${DATA}=${sessionData("staff-1")}; Path=/`]);
    const stale = sessionData("someone-else", SECRET, Date.now() - 1000);

    const response = await proxy(request("/admin", { [TOKEN]: "t", [DATA]: stale }));
    expect(response).toBe(refreshed);
  });
});

describe("the admin, when the proxy cannot tell", () => {
  it.each([
    ["a forged signature", () => sessionData("staff-1", "another-secret-that-is-32-characters-long")],
    ["an expired copy", () => sessionData("staff-1", SECRET, Date.now() - 1000)],
    ["no copy at all", () => undefined],
  ])("leaves %s to the page's own staff check", async (_label, token) => {
    const refreshed = allowed();
    const value = token();
    const response = await proxy(request("/admin", value ? { [TOKEN]: "t", [DATA]: value } : { [TOKEN]: "t" }));

    expect(isAdmin).not.toHaveBeenCalled();
    expect(rewrittenTo(response)).toBeNull();
    expect(response).toBe(refreshed);
  });

  it("leaves it to the page when the role lookup fails", async () => {
    isAdmin.mockRejectedValue(new Error("database down"));
    const refreshed = allowed();
    const response = await proxy(request("/admin", { [TOKEN]: "t", [DATA]: sessionData("staff-1") }));
    expect(response).toBe(refreshed);
  });
});

describe("everything else", () => {
  it("leaves any other redirect to the middleware, such as finishing a social sign-in", async () => {
    const oauth = NextResponse.redirect(new URL("/admin?verified=1", "https://qriateplus.com"));
    middleware.mockResolvedValueOnce(oauth);
    expect(await proxy(request("/admin?neon_auth_session_verifier=x"))).toBe(oauth);
  });

  it("reports a failure, without the query string, and still fails the request", async () => {
    const failure = new Error("NEON_AUTH_BASE_URL is not set");
    middleware.mockRejectedValueOnce(failure);
    await expect(proxy(request("/app?token=secret"))).rejects.toBe(failure);
    expect(reportError).toHaveBeenCalledWith(failure, { where: "proxy", method: "GET", path: "/app" });
  });

  it("does not treat a route that merely starts with admin as the admin", async () => {
    signedOut("/administrator");
    const response = await proxy(request("/administrator"));
    expect(response.status).toBe(307);
  });

  it("sends non-staff somewhere that can never be a page or a short code", () => {
    // Two segments: a short code is one, and nothing is routed under `/_`.
    expect(NOWHERE.split("/").filter(Boolean)).toHaveLength(2);
  });

  it("covers the admin and keeps the redirect path out of the matcher", () => {
    expect(config.matcher).toContain("/admin/:path*");
    expect(config.matcher).not.toContain("/:path*");
    expect(config.matcher).not.toContain("/_/:path*");
  });
});

describe("blog posts", () => {
  beforeEach(() => {
    resolvePublicSlug.mockReset();
    reportError.mockClear();
  });

  it("passes a live post to the page without touching the session", async () => {
    resolvePublicSlug.mockResolvedValueOnce({ kind: "live" });
    const response = await proxy(request("/blog/minimum-qr-code-size"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(middleware).not.toHaveBeenCalled();
  });

  it("answers a draft, a scheduled post or an unknown address with the ordinary 404", async () => {
    resolvePublicSlug.mockResolvedValueOnce({ kind: "missing" });
    expect(rewrittenTo(await proxy(request("/blog/not-yet")))).toBe(NOWHERE);
  });

  it("sends an address a post used to have to where it lives now, permanently, keeping the query", async () => {
    resolvePublicSlug.mockResolvedValueOnce({ kind: "moved", slug: "new-name" });
    const response = await proxy(request("/blog/old-name?utm_source=x"));
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://qriateplus.com/blog/new-name?utm_source=x");
  });

  it("leaves it to the page when the database cannot answer", async () => {
    resolvePublicSlug.mockRejectedValueOnce(new Error("down"));
    const response = await proxy(request("/blog/anything"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(reportError).not.toHaveBeenCalled();
  });

  it("passes the feed and the Markdown copies on to their own routes", async () => {
    for (const path of ["/blog/rss.xml", "/blog/some-post.md"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("x-middleware-next")).toBe("1");
    }
    expect(resolvePublicSlug).not.toHaveBeenCalled();
  });

  it("answers an address that can never be a slug with a 404, without a lookup", async () => {
    expect(rewrittenTo(await proxy(request("/blog/under_score")))).toBe(NOWHERE);
    expect(resolvePublicSlug).not.toHaveBeenCalled();
  });

  it("sends an address typed with capitals to its lower-case form", async () => {
    resolvePublicSlug.mockResolvedValueOnce({ kind: "live" });
    const response = await proxy(request("/blog/Minimum-QR-Code-Size"));
    expect(resolvePublicSlug).toHaveBeenCalledWith("minimum-qr-code-size");
    expect(response.status).toBe(308);
    expect(response.headers.get("location")).toBe("https://qriateplus.com/blog/minimum-qr-code-size");
  });

  it("matches one segment under /blog, never the index or a post's card", () => {
    expect(config.matcher).toContain("/blog/:slug");
    expect(config.matcher).not.toContain("/blog/:path*");
  });
});
