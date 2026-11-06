import { createHmac } from "node:crypto";
import { signSessionDataForTest, verifiedSessionUserId } from "@/lib/session-cookie";

/**
 * The proxy decides who is staff from this. A token it accepts must be one
 * this deployment signed, unexpired, with HS256 and nothing else.
 */

const SECRET = "a-test-secret-that-is-at-least-32-characters";
const NOW = Date.UTC(2026, 10, 6, 12, 0, 0);
const sign = (claims: Record<string, unknown>, expiresAt = NOW + 300_000, secret = SECRET) =>
  signSessionDataForTest(claims, secret, expiresAt);

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

/**
 * Minted by `@neondatabase/auth` 0.6.0-beta itself (its middleware, with
 * Neon's servers stubbed), for user 1111…, with the secret above. Verified at
 * the moment it was issued, so its five-minute expiry never fails the suite.
 * If a library upgrade changes the cookie's format, this is the test that says
 * so; the proxy then falls back to the page's own staff check.
 */
const LIBRARY_MINTED = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzZXNzaW9uIjp7ImlkIjoiczEiLCJ1c2VySWQiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEiLCJ0b2tlbiI6InQiLCJjcmVhdGVkQXQiOiIyMDI2LTExLTA2VDE4OjQyOjE1LjU0NloiLCJ1cGRhdGVkQXQiOiIyMDI2LTExLTA2VDE4OjQyOjE1LjU0NloiLCJleHBpcmVzQXQiOiIyMDI2LTExLTA3VDE4OjQyOjE1Ljg2NVoifSwidXNlciI6eyJpZCI6IjExMTExMTExLTExMTEtMTExMS0xMTExLTExMTExMTExMTExMSIsImVtYWlsIjoic3RhZmZAZXhhbXBsZS50ZXN0IiwibmFtZSI6IlN0YWZmIiwiZW1haWxWZXJpZmllZCI6dHJ1ZSwiY3JlYXRlZEF0IjoiMjAyNi0xMS0wNlQxODo0MjoxNS41NDZaIiwidXBkYXRlZEF0IjoiMjAyNi0xMS0wNlQxODo0MjoxNS41NDZaIn0sImlhdCI6MTc5Mzk5MDUzNSwiZXhwIjoxNzkzOTkwODM1LCJzdWIiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEifQ.DHzGFfWLWjw1G2gECyWz0GqTWLVMuBcBid3xncNLjh4";

describe("a token Neon Auth minted", () => {
  const [, payload] = LIBRARY_MINTED.split(".");
  const { iat } = JSON.parse(Buffer.from(payload, "base64url").toString()) as { iat: number };

  it("is read as the user it was minted for", () => {
    expect(verifiedSessionUserId(LIBRARY_MINTED, SECRET, iat * 1000)).toBe("11111111-1111-1111-1111-111111111111");
  });

  it("is refused once it has expired", () => {
    expect(verifiedSessionUserId(LIBRARY_MINTED, SECRET, (iat + 3600) * 1000)).toBeNull();
  });
});

describe("verifiedSessionUserId", () => {
  it("reads the user id from a token we signed", () => {
    expect(verifiedSessionUserId(sign({ user: { id: "u1" }, sub: "u1" }), SECRET, NOW)).toBe("u1");
  });

  it("falls back to the subject", () => {
    expect(verifiedSessionUserId(sign({ sub: "u2" }), SECRET, NOW)).toBe("u2");
  });

  it("refuses a token signed with another secret", () => {
    const token = sign({ user: { id: "u1" } }, NOW + 300_000, "some-other-secret-that-is-32-characters");
    expect(verifiedSessionUserId(token, SECRET, NOW)).toBeNull();
  });

  it("refuses a token whose payload was changed after signing", () => {
    const [header, , signature] = sign({ user: { id: "customer" } }).split(".");
    const forged = `${header}.${b64({ user: { id: "staff" }, exp: NOW / 1000 + 300 })}.${signature}`;
    expect(verifiedSessionUserId(forged, SECRET, NOW)).toBeNull();
  });

  it("refuses an unsigned token, whatever it claims", () => {
    const none = `${b64({ alg: "none", typ: "JWT" })}.${b64({ user: { id: "staff" }, exp: NOW / 1000 + 300 })}.`;
    expect(verifiedSessionUserId(none, SECRET, NOW)).toBeNull();
  });

  it("refuses a token for another algorithm even when the HMAC matches", () => {
    const header = b64({ alg: "HS512", typ: "JWT" });
    const payload = b64({ user: { id: "staff" }, exp: NOW / 1000 + 300 });
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    expect(verifiedSessionUserId(`${header}.${payload}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it("refuses an expired token, and one with no expiry", () => {
    expect(verifiedSessionUserId(sign({ user: { id: "u1" } }, NOW - 1), SECRET, NOW)).toBeNull();
    const header = b64({ alg: "HS256", typ: "JWT" });
    const payload = b64({ user: { id: "u1" } });
    const signature = createHmac("sha256", SECRET).update(`${header}.${payload}`).digest("base64url");
    expect(verifiedSessionUserId(`${header}.${payload}.${signature}`, SECRET, NOW)).toBeNull();
  });

  it.each(["", "abc", "a.b", "a.b.c.d", "...."])("refuses %j", (token) => {
    expect(verifiedSessionUserId(token, SECRET, NOW)).toBeNull();
  });

  it("refuses everything when no secret is configured", () => {
    expect(verifiedSessionUserId(sign({ user: { id: "u1" } }), "", NOW)).toBeNull();
  });

  it("refuses Neon Auth's anonymous subject", () => {
    expect(verifiedSessionUserId(sign({ sub: "anonymous" }), SECRET, NOW)).toBeNull();
  });
});
