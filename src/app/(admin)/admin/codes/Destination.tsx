import { isPageKind } from "@/lib/qr-types";
import { splitDestination } from "@/lib/moderation";

/**
 * Where a code sends people, with the host set apart from the rest: the host
 * is what tells staff whether `paystack.com.verify-login.ng/...` is Paystack.
 *
 * Opened with no referrer and no opener, so a staff click on a suspect link
 * hands the destination nothing about this admin.
 */
export function Destination({
  url,
  shortCode,
  kind,
  compact = false,
}: {
  url: string;
  shortCode: string;
  kind: string;
  compact?: boolean;
}) {
  if (isPageKind(kind)) {
    return (
      <span className="text-sm">
        <span className="text-[var(--paper-soft)]">Hosted page </span>
        <a href={`/p/${shortCode}`} target="_blank" rel="noopener noreferrer" className="font-mono text-xs">
          /p/{shortCode}
        </a>
      </span>
    );
  }
  if (!url) return <span className="text-sm text-[var(--paper-soft)]">Erased</span>;

  // Destinations are screened to http(s) when saved; anything else that got
  // in some other way is shown, never made clickable.
  if (!/^https?:\/\//i.test(url)) return <span className="break-all font-mono text-xs">{url}</span>;

  const { before, host, rest } = splitDestination(url);
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      title={url}
      className={`block break-all no-underline ${compact ? "line-clamp-2 text-xs" : "text-sm"}`}
    >
      <span className="text-[var(--paper-soft)]">{before}</span>
      {host ? <span className="font-semibold text-[var(--paper-ink)]">{host}</span> : null}
      <span className="text-[var(--paper-soft)]">{rest}</span>
    </a>
  );
}
