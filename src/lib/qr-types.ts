import { STATIC_KINDS, type StaticKind } from "@/lib/static-payload";

/**
 * Every kind of code the create flow offers, and how each one is delivered.
 *
 * Two families, because the answer to "can this change after printing?" splits
 * them:
 *
 *   - **Dynamic** codes encode our short link. The row behind it decides where
 *     a scan goes, so the owner can edit, pause and count it.
 *       - `link` types are a destination URL and nothing more: the redirect
 *         path sends the scanner straight there.
 *       - `page` types carry content we host at `/p/{short_code}`. The
 *         redirect path sends the scanner there, and that page renders the
 *         content. Pausing still works, because the hop goes through the
 *         redirect path first.
 *   - **Static** codes encode their content in the pattern itself. They are
 *     built in the browser and never stored; see `static-payload.ts`.
 *
 * Pure data with no server imports, so the picker can render from it on the
 * client and the tests can hold it against the migration's check constraint.
 */

export type Delivery = "link" | "page";

export const DYNAMIC_KINDS = [
  "url",
  "pdf",
  "images",
  "video",
  "profile",
  "links",
  "social",
  "app",
  "instagram",
  "mp3",
  "business",
  "menu",
  "feedback",
  "event",
  "facebook",
  "coupon",
  "playlist",
  "barcode",
] as const;
export type DynamicKind = (typeof DYNAMIC_KINDS)[number];

export const LINK_KINDS = ["url", "instagram", "facebook"] as const;
export type LinkKind = (typeof LINK_KINDS)[number];

export type PageKind = Exclude<DynamicKind, LinkKind>;

export type TypeInfo<K extends string> = {
  kind: K;
  label: string;
  blurb: string;
};

/** In the order the picker shows them: the common ones first. */
export const DYNAMIC_TYPES: readonly TypeInfo<DynamicKind>[] = [
  { kind: "url", label: "Website URL", blurb: "Link to any website" },
  { kind: "pdf", label: "PDF", blurb: "Share a PDF document" },
  { kind: "images", label: "Images", blurb: "Share a set of photos" },
  { kind: "video", label: "Video", blurb: "Share a video" },
  { kind: "profile", label: "Profile Card", blurb: "Your own contact page" },
  { kind: "links", label: "Multiple Links", blurb: "Share several links" },
  { kind: "social", label: "Social Media", blurb: "All your socials in one place" },
  { kind: "app", label: "App", blurb: "Download on Android and iOS" },
  { kind: "instagram", label: "Instagram", blurb: "Share your Instagram profile" },
  { kind: "mp3", label: "MP3", blurb: "Share an audio file" },
  { kind: "business", label: "Business Page", blurb: "Information about your business" },
  { kind: "menu", label: "Menu", blurb: "Share a digital menu" },
  { kind: "feedback", label: "Feedback", blurb: "Ask for ratings and reviews" },
  { kind: "event", label: "Event", blurb: "Promote any event" },
  { kind: "facebook", label: "Facebook", blurb: "Share your Facebook page" },
  { kind: "coupon", label: "Coupon", blurb: "Discounts and offers" },
  { kind: "playlist", label: "Playlist", blurb: "Share your own music" },
  { kind: "barcode", label: "2D Barcode", blurb: "GS1 product information" },
];

export const STATIC_TYPES: readonly TypeInfo<StaticKind>[] = [
  { kind: "url", label: "Website URL", blurb: "Link to any website" },
  { kind: "email", label: "Email", blurb: "Send an email" },
  { kind: "text", label: "Text", blurb: "Share text" },
  { kind: "phone", label: "Call", blurb: "Make a call" },
  { kind: "sms", label: "SMS", blurb: "Send an SMS" },
  { kind: "whatsapp", label: "WhatsApp", blurb: "Send a WhatsApp message" },
  { kind: "wifi", label: "Wi-Fi", blurb: "Join a Wi-Fi network" },
  { kind: "vcard", label: "vCard", blurb: "Save a contact to the phone" },
  { kind: "paypal", label: "PayPal", blurb: "Start a PayPal payment" },
  { kind: "bitcoin", label: "Bitcoin", blurb: "Request a Bitcoin payment" },
];

export function isDynamicKind(value: string): value is DynamicKind {
  return (DYNAMIC_KINDS as readonly string[]).includes(value);
}

export function isLinkKind(value: string): value is LinkKind {
  return (LINK_KINDS as readonly string[]).includes(value);
}

export function isPageKind(value: string): value is PageKind {
  return isDynamicKind(value) && !isLinkKind(value);
}

export function isStaticKind(value: string): value is StaticKind {
  return (STATIC_KINDS as readonly string[]).includes(value);
}

export function dynamicType(kind: DynamicKind): TypeInfo<DynamicKind> {
  return DYNAMIC_TYPES.find((type) => type.kind === kind)!;
}

export function staticType(kind: StaticKind): TypeInfo<StaticKind> {
  return STATIC_TYPES.find((type) => type.kind === kind)!;
}

/**
 * Where a page-type code points. Relative on purpose: the client resolves it
 * against the host the scanner actually used, exactly as the status pages'
 * redirects do, so it cannot be wrong on a preview deploy or a LAN demo.
 */
export function pagePath(shortCode: string): string {
  return `/p/${shortCode}`;
}
