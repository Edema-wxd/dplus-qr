"use client";

import { useSearchParams } from "next/navigation";
import { INVITE_PARAM } from "@/lib/team-invite-param";

/**
 * Carries a team invitation through sign-in or sign-up, so the person lands
 * back on it afterwards. Read from the URL, never stored. The action checks
 * the token's shape before redirecting to it. Render inside a Suspense
 * boundary: reading search params suspends the prerender.
 */
export function InviteField() {
  const invite = useSearchParams().get(INVITE_PARAM);
  return invite ? <input type="hidden" name={INVITE_PARAM} value={invite} /> : null;
}
