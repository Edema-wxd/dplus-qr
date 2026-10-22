import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * Shown while an account page resolves its session. `account/page.tsx` sets
 * `instant = false` because it has no useful static shell to stream, which is
 * exactly the case this boundary exists to cover: without it a signed-in
 * client would stare at the previous page until the session check settled.
 */
export default function Loading() {
  return <LoadingScreen label="Loading your account…" />;
}
