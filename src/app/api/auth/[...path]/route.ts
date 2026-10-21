import { auth } from "@/lib/auth/server";

/**
 * Same-origin proxy to Managed Auth. The SDK handles the OAuth verifier and
 * popup flow through here, so this must not be reimplemented or narrowed.
 */
export const { GET, POST, PUT, DELETE, PATCH } = auth.handler();
