import { STAGING_HOST, isStagingDeploy } from "@/lib/staging";

/**
 * A strip across the top of every page on staging (every preview
 * deployment), so nobody mistakes it for the live service or prints its
 * artwork. Decided at build time from `VERCEL_ENV`; renders nothing in
 * production or locally.
 */
export function StagingBanner() {
  if (!isStagingDeploy()) return null;
  return (
    <div
      role="note"
      className="bg-amber-300 px-4 py-1.5 text-center text-xs font-medium text-black"
    >
      Staging, with test data only. Nothing here reaches customers or takes payment. Artwork made
      here does not scan: open {STAGING_HOST}/&lt;code&gt; instead.
    </div>
  );
}
