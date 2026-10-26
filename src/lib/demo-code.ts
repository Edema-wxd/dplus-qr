/**
 * The one code reference the landing page prints, and the page it answers with.
 *
 * It lives in its own module for two reasons. The redirect path imports it, so
 * it must carry no React, no copy deck and no `node:` dependency -- importing
 * `landing.ts` would drag the whole page's prose onto the sacred path, and
 * importing `short-code.ts` would put `node:crypto` into the client bundle
 * through `CodeDemo`. And `short-code.ts` imports it to reserve it, which
 * cannot work the other way around without a cycle.
 *
 * `DEMO_CODE` is a valid code under the real generator -- 7 characters,
 * base-58, no `0 O I l` -- but it is deliberately not a code anyone owns, and
 * `RESERVED_CODES` makes sure it can never be issued to anyone. It is a real
 * printed thing on a public page, so scanning it has to land somewhere: the
 * redirect path answers it from this constant, before any lookup, so the
 * specimen resolves on every deployment with no database row behind it and
 * nothing that can fail.
 */
export const DEMO_CODE = "Ab3kQ9x";

/** Where a scan of the specimen lands. Relative, like every status redirect. */
export const DEMO_DESTINATION = "/demo";
