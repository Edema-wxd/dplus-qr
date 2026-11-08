import type { Instrumentation } from "next";

/**
 * Every uncaught server error (a page, a Route Handler, a Server Action, the
 * proxy) is counted and, at most once an hour per kind, emailed to staff:
 * `reportError` in `src/lib/error-alerts.ts` holds the rules.
 *
 * Next calls this after it has already answered the request, and awaits it,
 * so the work is bounded inside `reportError`, which never throws. Node only:
 * the alert path uses `node:crypto`, and nothing here runs at the edge.
 */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // `src/proxy.ts` reports its own failures: Next passes only an edge
  // proxy's here, and one report per failure is the point.
  if (context.routeType === "proxy") return;
  const { reportError } = await import("@/lib/error-alerts");
  await reportError(error, {
    where: `${context.routeType} ${context.routePath}`,
    method: request.method,
    path: request.path,
  });
};
