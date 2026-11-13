import { UPLOADTHING_APP_HOST } from "./upload-host";

/**
 * The security headers every response carries, and the Content Security
 * Policy among them (security audit M6, 13 November 2026).
 *
 * Imported by `next.config.ts` at build time, so it must stay plain: no `env()`,
 * no `@/` imports, nothing that needs a secret.
 *
 * **An allow-list policy, not a nonce one.** A nonce has to be new on every
 * request, which makes every page render per request, and Next says outright
 * that Partial Prerendering cannot carry one: the static shells of the status
 * pages, the landing page and the blog would all be lost. So inline scripts
 * (Next's own RSC payload among them) stay allowed, and the policy does the
 * rest: scripts only from this origin, no plugins, no `<base>` or form
 * hijacking, connections and frames only to the hosts listed here. Injected
 * inline script is still stopped by React's escaping and by never rendering
 * raw HTML (decided 13 Nov 2026).
 *
 * **Report-only for now.** It ships as `Content-Security-Policy-Report-Only`,
 * so a host missed here costs a report, not a broken upload or PDF. Reports
 * are counted (`src/lib/csp-reports.ts`) and appear in the Monday summary;
 * after a clean week, switching the header name enforces it. The enforced
 * `frame-ancestors 'self'` (PR #60) stays enforced throughout.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

/** The `Reporting-Endpoints` name `report-to` refers to. */
const REPORT_GROUP = "csp";

/** Where page videos may be embedded from: `videoEmbedUrl` in page-helpers. */
export const VIDEO_FRAME_HOSTS = ["https://www.youtube-nocookie.com", "https://player.vimeo.com"];

/** Where this account's uploads are served from. `utfs.io` for files from before v7. */
const UPLOAD_FILE_HOSTS = [`https://${UPLOADTHING_APP_HOST}`, "https://utfs.io"];

/** Where the browser sends an upload: UploadThing v7's regional ingest servers. */
const UPLOAD_INGEST = "https://*.ingest.uploadthing.com";

/** Paystack's hosted checkout, which a plan purchase is redirected to after a form post. */
const CHECKOUT = "https://checkout.paystack.com";

/** Vercel's preview toolbar, injected into preview deployments only. */
const VERCEL_TOOLBAR = "https://vercel.live";

export type PolicyOptions = {
  /** `next dev`: React needs `eval` for its error overlays. */
  dev: boolean;
  /** A Vercel preview deployment, which carries the toolbar. */
  preview: boolean;
};

export function cspDirectives({ dev, preview }: PolicyOptions): Record<string, string[]> {
  const toolbar = preview ? [VERCEL_TOOLBAR] : [];
  return {
    "default-src": ["'self'"],
    // 'unsafe-inline' because nonces cannot coexist with PPR (above).
    // 'wasm-unsafe-eval' for pdf.js, whose image decoders are WebAssembly.
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(dev ? ["'unsafe-eval'"] : []), ...toolbar],
    // Components set `style={…}` attributes, which only 'unsafe-inline' allows.
    "style-src": ["'self'", "'unsafe-inline'"],
    // Images are the one place outside hosts are expected: a hosted page or a
    // blog cover can point at any https image, shown unoptimised.
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "font-src": ["'self'", "data:"],
    "media-src": ["'self'", "blob:", ...UPLOAD_FILE_HOSTS],
    "connect-src": ["'self'", "data:", "blob:", UPLOAD_INGEST, ...UPLOAD_FILE_HOSTS, ...toolbar],
    "frame-src": [...VIDEO_FRAME_HOSTS, ...toolbar],
    // The pdf.js worker is bundled and served from this origin.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'", CHECKOUT],
    "frame-ancestors": ["'self'"],
    "report-uri": [CSP_REPORT_PATH],
    "report-to": [REPORT_GROUP],
  };
}

export function contentSecurityPolicy(options: PolicyOptions): string {
  return Object.entries(cspDirectives(options))
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

/**
 * Two years, every subdomain, and no `preload` (decided 13 Nov 2026): getting
 * off the browsers' preload list takes months, so that stays a separate,
 * deliberate step. `mail.qriateplus.com` only sends mail and serves no pages,
 * so `includeSubDomains` touches nothing that speaks plain HTTP.
 */
export const HSTS = "max-age=63072000; includeSubDomains";

export function securityHeaders(options: PolicyOptions): { key: string; value: string }[] {
  return [
    { key: "Strict-Transport-Security", value: HSTS },
    // No page here is meant to be framed by another site (the hosted pages
    // embed YouTube/Vimeo, never the reverse), so framing is limited to this
    // origin; that stops clickjacking of dashboard and admin buttons.
    { key: "X-Frame-Options", value: "SAMEORIGIN" },
    { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
    { key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy(options) },
    { key: "Reporting-Endpoints", value: `${REPORT_GROUP}="${CSP_REPORT_PATH}"` },
    // nosniff stops a served file being read as another type.
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  ];
}
