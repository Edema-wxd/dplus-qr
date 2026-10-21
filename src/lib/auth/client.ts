"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/**
 * Browser client. Takes no arguments: it talks to the same-origin proxy mounted
 * at /api/auth, so the Auth URL never reaches the browser.
 */
export const authClient = createAuthClient();
