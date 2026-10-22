import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * The person here scanned a printed code and was redirected, so they have no
 * idea what this site is yet. The label says a code is being checked rather
 * than "Loading", which tells them the scan worked and something is coming.
 */
export default function Loading() {
  return <LoadingScreen label="Checking this code…" />;
}
