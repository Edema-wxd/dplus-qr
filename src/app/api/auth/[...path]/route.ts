import { auth } from "@/lib/auth/server";

/**
 * Same-origin proxy to Managed Auth. The SDK handles the OAuth verifier and
 * popup flow through here, so this must not be reimplemented or narrowed.
 *
 * Each method defers to `auth.handler()` at request time rather than
 * destructuring it at module scope. Destructuring would construct the auth
 * client while Next collects route config during the build, which has no
 * auth secrets -- see src/lib/auth/server.ts.
 */
type Handlers = ReturnType<typeof auth.handler>;
type Method = keyof Handlers;

function route(method: Method) {
  return (request: Request, context: unknown) =>
    (auth.handler()[method] as (r: Request, c: unknown) => Promise<Response>)(
      request,
      context
    );
}

export const GET = route("GET");
export const POST = route("POST");
export const PUT = route("PUT");
export const DELETE = route("DELETE");
export const PATCH = route("PATCH");
