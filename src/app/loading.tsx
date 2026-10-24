import { LoadingScreen } from "@/components/LoadingScreen";

/**
 * Fallback for anything below the root that has not got a closer
 * `loading.tsx`. The copy is neutral because this boundary covers both
 * audiences on the host.
 */
export default function Loading() {
  return <LoadingScreen />;
}
