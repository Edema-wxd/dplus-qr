/**
 * One small line icon per code type, drawn inline so the picker needs no icon
 * package and no network request. Stroke-only at 1.6, in `currentColor`, so
 * each icon takes the text colour of the card it sits in.
 */
const PATHS: Record<string, React.ReactNode> = {
  url: (
    <>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
    </>
  ),
  pdf: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5" />
      <path d="M8.5 16.5v-4h1.2a1.2 1.2 0 0 1 0 2.4H8.5M12.5 16.5v-4h.8a2 2 0 0 1 0 4zM16.5 12.5h-1.5v4M15 14.5h1.2" />
    </>
  ),
  images: (
    <>
      <rect x="3" y="6" width="15" height="13" rx="2" />
      <path d="M6 3h13a2 2 0 0 1 2 2v11" />
      <circle cx="8" cy="10.5" r="1.5" />
      <path d="m3 17 4.5-4 3.5 3 2.5-2 4.5 4" />
    </>
  ),
  video: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 5.5 3.5-5.5 3.5z" />
    </>
  ),
  profile: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.5 16a3.5 3.5 0 0 1 7 0M14.5 10h4M14.5 13.5h3" />
    </>
  ),
  links: (
    <>
      <path d="M8 13a3.5 3.5 0 0 0 5 0l2.5-2.5a3.5 3.5 0 0 0-5-5l-.8.8" />
      <path d="M12 9a3.5 3.5 0 0 0-5 0l-2.5 2.5a3.5 3.5 0 0 0 5 5l.8-.8" />
      <path d="M16 15h5M16 18.5h5" />
    </>
  ),
  social: (
    <>
      <circle cx="18" cy="5.5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18.5" r="2.5" />
      <path d="m8.2 10.8 7.6-4M8.2 13.2l7.6 4" />
    </>
  ),
  app: (
    <>
      <rect x="6.5" y="2.5" width="11" height="19" rx="2.5" />
      <path d="M10.5 18.5h3" />
    </>
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="3.8" />
      <circle cx="17.2" cy="6.8" r=".6" fill="currentColor" />
    </>
  ),
  mp3: (
    <>
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  business: (
    <>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5v2M3 12.5h18M11 12.5v2h2v-2" />
    </>
  ),
  menu: (
    <>
      <path d="M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10" />
      <path d="M17 21V3c-2.2 1.4-3 4-3 7v4h3" />
    </>
  ),
  feedback: (
    <>
      <path d="M4 5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 15H9l-4 3.5V15H4a1.5 1.5 0 0 1-1.5-1.5v-7A1.5 1.5 0 0 1 4 5z" />
      <path d="M17.5 9H20a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 20 18h-.5v3l-3.5-3h-5" />
    </>
  ),
  event: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4M8 13.5h1M11.5 13.5h1M15 13.5h1M8 17h1M11.5 17h1" />
    </>
  ),
  facebook: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M13 21v-7.5h2.5l.4-3H13V9c0-.9.3-1.5 1.5-1.5H16V5a19 19 0 0 0-2.2-.1C11.6 4.9 10 6.2 10 8.7v1.8H7.5v3H10V21" />
    </>
  ),
  coupon: (
    <>
      <path d="M3 4.5h7.5L20.5 14.5 14.5 20.5 4.5 10.5 3 4.5z" />
      <circle cx="7.5" cy="8.5" r="1.3" />
    </>
  ),
  playlist: (
    <>
      <path d="M3.5 6h11M3.5 10.5h11M3.5 15h6" />
      <path d="M18 17.5V7l3-1" />
      <circle cx="15.5" cy="17.5" r="2.5" />
    </>
  ),
  barcode: <path d="M3.5 5v14M6.5 5v14M8.5 5v14M11.5 5v14M14 5v14M15.5 5v14M18 5v14M20.5 5v14" />,
  email: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6.5L20.5 7" />
    </>
  ),
  text: <path d="M4 6h16M4 10h16M4 14h16M4 18h10" />,
  phone: (
    <path d="M6.5 3.5h2.8l1.4 4-2 1.3a11 11 0 0 0 6.5 6.5l1.3-2 4 1.4v2.8A2 2 0 0 1 18.5 19.5 15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2z" />
  ),
  sms: (
    <>
      <path d="M12 4c5 0 9 3.3 9 7.3s-4 7.3-9 7.3c-1 0-2-.1-2.9-.4L4 20l1.4-3.8A6.8 6.8 0 0 1 3 11.3C3 7.3 7 4 12 4z" />
      <path d="M8 11.3h.01M12 11.3h.01M16 11.3h.01" strokeWidth="2.4" />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4 20l1.2-4.2A8.5 8.5 0 1 1 8.4 19z" />
      <path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-2.2-1-1 .9a4 4 0 0 1-2.6-2.6l.9-1-1-2.2z" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0M5.5 12.5a9.5 9.5 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0" />
      <circle cx="12" cy="19" r=".9" fill="currentColor" />
    </>
  ),
  vcard: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="9" cy="11" r="2" />
      <path d="M5.5 16a3.5 3.5 0 0 1 7 0M15 9.5h3.5M15 12.5h3.5M15 15.5h2" />
    </>
  ),
  paypal: (
    <path d="M7.5 20.5l2.4-15h5.4c2.6 0 4.2 1.5 3.7 4-.5 2.8-2.6 4.2-5.3 4.2h-2.4l-1 6.8zM9.2 9.8h4" />
  ),
  bitcoin: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 7.5v9M9.5 7.5h3.2a2 2 0 0 1 0 4.2H9.5h3.7a2.1 2.1 0 0 1 0 4.3H9.5M11 6v1.5M11 16.5V18M13 6v1.5M13 16.5V18" />
    </>
  ),
};

export function TypeIcon({ name, className }: { name: string; className?: string }) {
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
      {PATHS[name] ?? PATHS.url}
    </svg>
  );
}
