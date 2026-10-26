import { createRouteHandler } from "uploadthing/next";
import { uploadRouter } from "./core";

/**
 * UploadThing's endpoint: the browser asks it for upload URLs, and
 * UploadThing's servers call it back when a file lands.
 *
 * Deliberately outside the `proxy.ts` matcher. The callback comes from
 * UploadThing, not from a signed-in browser, and is authenticated by the
 * SDK's signature check; the session check for the upload itself is in the
 * router's middleware.
 *
 * The token is read per request, so `next build` needs no UploadThing secret.
 */
export const { GET, POST } = createRouteHandler({ router: uploadRouter });
