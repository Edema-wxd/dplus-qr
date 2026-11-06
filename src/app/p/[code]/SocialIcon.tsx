import type { SocialNetwork } from "@/lib/page-content";

/**
 * One small line icon per social network, beside its name on a social page.
 *
 * Drawn inline in the manner of the dashboard's `TypeIcon`: no icon package
 * (lucide dropped its brand marks), no request, stroke-only at 1.6 in
 * `currentColor`, so each icon takes the text colour of the button it sits
 * in and follows the page's brand theming. Simplified outlines rather than
 * the networks' own filled logos, so they sit together as one set and never
 * shout over the owner's content. The label is always shown beside it; the
 * icon only helps the eye find the right row.
 */
const PATHS: Record<SocialNetwork, React.ReactNode> = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
    </>
  ),
  facebook: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M13 21v-7.5h2.5l.4-3H13V9c0-.9.3-1.5 1.5-1.5H16V5a19 19 0 0 0-2.2-.1C11.6 4.9 10 6.2 10 8.7v1.8H7.5v3H10V21" />
    </>
  ),
  x: (
    <>
      <path d="M4 4h4.5L20 20h-4.5z" />
      <path d="M19.5 4l-6.4 7.1M10.9 12.9 4.5 20" />
    </>
  ),
  tiktok: (
    <>
      <path d="M14.5 3v11.8a4.2 4.2 0 1 1-4.2-4.2" />
      <path d="M14.5 3c.4 2.9 2.4 4.9 5.5 5.1" />
    </>
  ),
  youtube: (
    <>
      <path d="M21.4 8.2a2.6 2.6 0 0 0-1.8-1.9C18 5.8 12 5.8 12 5.8s-6 0-7.6.5a2.6 2.6 0 0 0-1.8 1.9C2.1 9.8 2.1 12 2.1 12s0 2.2.5 3.8a2.6 2.6 0 0 0 1.8 1.9c1.6.5 7.6.5 7.6.5s6 0 7.6-.5a2.6 2.6 0 0 0 1.8-1.9c.5-1.6.5-3.8.5-3.8s0-2.2-.5-3.8z" />
      <path d="m10 9.2 5 2.8-5 2.8z" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <path d="M8 10.5V16.5M12 16.5v-6M12 13.2c0-1.6 1-2.7 2.4-2.7s2.1.9 2.1 2.6v3.4" />
      <circle cx="8" cy="7.6" r=".6" fill="currentColor" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.2-4.2A8.5 8.5 0 1 1 8.4 19z" />
      <path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2.2-1-1 .9a4 4 0 0 1-2.6-2.6l.9-1-1-2.2z" />
    </>
  ),
  snapchat: (
    <path d="M12 3.5c-2.9 0-5 2.1-5 5.1v2.2l-1.7.4c-.6.2-.6.9 0 1.1l1.5.6c-.7 1.6-1.9 2.8-3.3 3.3.4.8 1.6 1.1 2.6 1.2.2.6.3 1.2.8 1.2.6 0 1.4-.4 2.5-.1 1 .3 1.6 1.5 2.6 1.5s1.6-1.2 2.6-1.5c1.1-.3 1.9.1 2.5.1.5 0 .6-.6.8-1.2 1-.1 2.2-.4 2.6-1.2-1.4-.5-2.6-1.7-3.3-3.3l1.5-.6c.6-.2.6-.9 0-1.1l-1.7-.4V8.6c0-3-2.1-5.1-5-5.1z" />
  ),
  threads: (
    <path d="M17.6 8.3C16.6 5.3 14.6 3.8 12 3.8 7.6 3.8 5 7.1 5 12s2.6 8.2 7 8.2c3.4 0 6-2 6-5 0-2.6-2-4.1-5-4.1-2.2 0-3.6 1.1-3.6 2.6 0 1.4 1.1 2.4 2.7 2.4 2.5 0 3.9-1.9 3.9-5.6" />
  ),
  pinterest: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M11 21l1.7-7.4" />
      <path d="M9.6 14.2a3.6 3.6 0 0 1-.9-2.4c0-2.3 1.8-4.1 4.2-4.1 2.1 0 3.6 1.4 3.6 3.4 0 2.4-1.3 4.3-3.2 4.3-1 0-1.7-.8-1.5-1.8l.6-2.4" />
    </>
  ),
  telegram: <path d="M21.5 4 2.5 11.3l6.2 2.2 9.8-6.6-7.4 7.8.4 5.3 3.1-3.4 4 3z" />,
  spotify: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7 9.6c3.5-1 7.3-.7 10.2.9M7.6 12.7c2.9-.8 5.9-.5 8.3.8M8.3 15.6c2.3-.6 4.5-.4 6.4.6" />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.4 2.5 3.6 5.5 3.6 9s-1.2 6.5-3.6 9c-2.4-2.5-3.6-5.5-3.6-9S9.6 5.5 12 3z" />
    </>
  ),
};

export function SocialIcon({ network, className }: { network: SocialNetwork; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      {PATHS[network] ?? PATHS.website}
    </svg>
  );
}
