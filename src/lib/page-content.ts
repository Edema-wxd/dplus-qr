import { z } from "zod";
import { screenUrl, type ScreenResult } from "@/lib/screening";
import { EVENT_OFFSETS, isValidGtin } from "@/lib/page-helpers";
import type { LinkKind, PageKind } from "@/lib/qr-types";

/**
 * What each hosted page type holds, and the rules it is held to.
 *
 * One zod schema per page kind. The server parses every save through these --
 * the editor runs the same parse for its error line, but a Server Action is
 * an endpoint anyone can post to, so the server's parse is the one that
 * counts. Every link inside a page goes through `screenUrl`, the same
 * screener a destination does: a hosted page must not become a way around it.
 *
 * Files are referenced by `fileId`. The `url`, `name` and `mime` beside it are
 * overwritten from `qr_files` before parsing (see `resolveFiles` in
 * `files.ts`), so a client cannot point a page at a file it does not own or
 * at an arbitrary address dressed as one.
 */

const MAX_TEXT = 2000;

function required(label: string, max = 120) {
  return z
    .string({ error: `Enter ${label}.` })
    .trim()
    .min(1, `Enter ${label}.`)
    .max(max, `That ${label.replace(/^(a|an|the) /, "")} is too long.`);
}

function optional(label: string, max = 120) {
  return z
    .string()
    .trim()
    .max(max, `That ${label} is too long.`)
    .default("");
}

function screened(value: string, ctx: z.RefinementCtx): string {
  const result = screenUrl(value);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.reason });
    return z.NEVER;
  }
  return result.normalised;
}

const link = z.string().trim().max(2048, "That link is too long.").transform(screened);

const optionalLink = z
  .string()
  .trim()
  .max(2048, "That link is too long.")
  .default("")
  .transform((value, ctx) => (value ? screened(value, ctx) : ""));

/** A link that must be on one of the given hosts, such as an app store. */
function hostLink(hosts: string[], message: string) {
  return optionalLink.refine((value) => {
    if (!value) return true;
    const host = new URL(value).hostname.replace(/^www\./, "");
    return hosts.includes(host);
  }, message);
}

const optionalPhone = z
  .string()
  .trim()
  .default("")
  .refine(
    (value) => !value || /^\+?[\d\s().-]{5,20}$/.test(value),
    "Enter the phone number with its country code: +234…"
  );

const optionalEmail = z
  .string()
  .trim()
  .max(254)
  .default("")
  .refine(
    (value) => !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address."
  );

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const localDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export type FileAccept = "image" | "pdf" | "video" | "audio";

export const FILE_ACCEPT: Record<FileAccept, { mime: (m: string) => boolean; noun: string }> = {
  image: { mime: (m) => /^image\/(png|jpeg|webp|gif)$/.test(m), noun: "an image" },
  pdf: { mime: (m) => m === "application/pdf", noun: "a PDF" },
  video: { mime: (m) => /^video\/(mp4|webm|quicktime)$/.test(m), noun: "a video" },
  audio: { mime: (m) => /^audio\//.test(m), noun: "an audio file" },
};

export type FileRef = { fileId: string; url: string; name: string; mime: string };

function file(accept: FileAccept, missing: string) {
  return z.object(
    {
      fileId: z.string().regex(/^[1-9]\d{0,18}$/, "That file could not be found."),
      url: z.string(),
      name: z.string(),
      mime: z.string(),
    },
    { error: missing }
  ).refine((ref) => FILE_ACCEPT[accept].mime(ref.mime), {
    message: `That file is not ${FILE_ACCEPT[accept].noun}.`,
  });
}

function optionalFile(accept: FileAccept) {
  return file(accept, "That file could not be found.").nullable().default(null);
}

const labelledLinks = (min: number, max: number) =>
  z
    .array(
      z.object({
        label: required("a label for each link", 60),
        url: link,
      })
    )
    .min(min, "Add at least one link.")
    .max(max, `Keep it to ${max} links.`);

export const SOCIAL_NETWORKS = {
  instagram: "Instagram",
  facebook: "Facebook",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  snapchat: "Snapchat",
  threads: "Threads",
  pinterest: "Pinterest",
  telegram: "Telegram",
  spotify: "Spotify",
  website: "Website",
} as const;
export type SocialNetwork = keyof typeof SOCIAL_NETWORKS;

export const PAGE_SCHEMAS = {
  pdf: z.object({
    title: required("a title"),
    description: optional("description", MAX_TEXT),
    file: file("pdf", "Upload the PDF."),
  }),

  images: z.object({
    title: required("a title"),
    description: optional("description", MAX_TEXT),
    images: z
      .array(file("image", "Upload an image."))
      .min(1, "Upload at least one image.")
      .max(20, "Keep it to 20 images."),
  }),

  video: z
    .object({
      title: required("a title"),
      description: optional("description", MAX_TEXT),
      file: optionalFile("video"),
      link: optionalLink,
    })
    .refine((v) => v.file || v.link, {
      message: "Upload a video, or paste a YouTube or Vimeo link.",
    }),

  profile: z.object({
    name: required("your name"),
    title: optional("job title"),
    company: optional("company name"),
    photo: optionalFile("image"),
    bio: optional("bio", MAX_TEXT),
    mobile: optionalPhone,
    email: optionalEmail,
    website: optionalLink,
    address: optional("address", 300),
    links: labelledLinks(0, 10),
  }),

  links: z.object({
    title: required("a title"),
    description: optional("description", MAX_TEXT),
    image: optionalFile("image"),
    links: labelledLinks(1, 20),
  }),

  social: z.object({
    title: required("a title"),
    description: optional("description", MAX_TEXT),
    image: optionalFile("image"),
    profiles: z
      .array(
        z.object({
          network: z.enum(Object.keys(SOCIAL_NETWORKS) as [SocialNetwork, ...SocialNetwork[]], {
            error: "Choose a network for each profile.",
          }),
          url: link,
        })
      )
      .min(1, "Add at least one profile.")
      .max(15, "Keep it to 15 profiles."),
  }),

  app: z
    .object({
      name: required("the app's name"),
      description: optional("description", MAX_TEXT),
      icon: optionalFile("image"),
      ios: hostLink(["apps.apple.com", "itunes.apple.com"], "The iOS link must be on apps.apple.com."),
      android: hostLink(["play.google.com"], "The Android link must be on play.google.com."),
      website: optionalLink,
    })
    .refine((v) => v.ios || v.android, {
      message: "Add an App Store link, a Google Play link, or both.",
    }),

  mp3: z.object({
    title: required("a title"),
    artist: optional("artist name"),
    description: optional("description", MAX_TEXT),
    cover: optionalFile("image"),
    file: file("audio", "Upload the audio file."),
  }),

  business: z.object({
    name: required("the business name"),
    tagline: optional("tagline", 160),
    description: optional("description", MAX_TEXT),
    cover: optionalFile("image"),
    phone: optionalPhone,
    email: optionalEmail,
    website: optionalLink,
    address: optional("address", 300),
    hours: optional("opening hours", 600),
  }),

  menu: z.object({
    name: required("the restaurant name"),
    description: optional("description", MAX_TEXT),
    currency: optional("currency", 4).transform((value) => value || "₦"),
    sections: z
      .array(
        z.object({
          name: required("a name for each section", 60),
          items: z
            .array(
              z.object({
                name: required("a name for each dish", 80),
                description: optional("dish description", 300),
                price: optional("price", 20),
              })
            )
            .min(1, "Each section needs at least one item.")
            .max(60, "Keep each section to 60 items."),
        })
      )
      .min(1, "Add at least one section.")
      .max(20, "Keep it to 20 sections."),
  }),

  feedback: z.object({
    name: required("the business name"),
    question: required("the question to ask", 200),
    reviewUrl: optionalLink,
    thanks: optional("thank-you message", 300),
  }),

  event: z
    .object({
      title: required("the event name"),
      organiser: optional("organiser"),
      description: optional("description", MAX_TEXT),
      cover: optionalFile("image"),
      start: z.string().regex(localDateTime, "Enter when the event starts."),
      end: z
        .string()
        .default("")
        .refine((v) => !v || localDateTime.test(v), "Enter a valid end time."),
      utcOffset: z.enum(EVENT_OFFSETS).default("+01:00"),
      location: optional("location", 300),
      link: optionalLink,
    })
    .refine((v) => !v.end || v.end > v.start, {
      message: "The event has to end after it starts.",
    }),

  coupon: z.object({
    business: required("the business name"),
    headline: required("the offer", 120),
    description: optional("description", MAX_TEXT),
    cover: optionalFile("image"),
    code: optional("coupon code", 40),
    validUntil: z
      .string()
      .default("")
      .refine((v) => !v || isoDate.test(v), "Enter a valid date."),
    terms: optional("terms", MAX_TEXT),
    link: optionalLink,
  }),

  playlist: z.object({
    title: required("a title"),
    description: optional("description", MAX_TEXT),
    cover: optionalFile("image"),
    tracks: z
      .array(
        z.object({
          title: required("a title for each track"),
          file: file("audio", "Upload an audio file for each track."),
        })
      )
      .min(1, "Add at least one track.")
      .max(30, "Keep it to 30 tracks."),
  }),

  barcode: z.object({
    gtin: z
      .string()
      .trim()
      .refine(isValidGtin, "Enter a GTIN of 8, 12, 13 or 14 digits with a valid check digit."),
    name: required("the product name"),
    brand: optional("brand"),
    description: optional("description", MAX_TEXT),
    image: optionalFile("image"),
    // GS1 AI (10) and (21): up to 20 characters from the GS1 82-character set.
    batch: optional("batch number", 20).refine(
      (v) => /^[!-"%-?A-Z_a-z]*$/.test(v),
      "The batch number has a character GS1 does not allow."
    ),
    expiry: z
      .string()
      .default("")
      .refine((v) => !v || isoDate.test(v), "Enter a valid expiry date."),
    serial: optional("serial number", 20).refine(
      (v) => /^[!-"%-?A-Z_a-z]*$/.test(v),
      "The serial number has a character GS1 does not allow."
    ),
    link: optionalLink,
  }),
} satisfies Record<PageKind, z.ZodType>;

export type PageContent<K extends PageKind = PageKind> = z.output<(typeof PAGE_SCHEMAS)[K]>;

export type ContentResult<K extends PageKind = PageKind> =
  | { ok: true; content: PageContent<K> }
  | { ok: false; reason: string };

export function parsePageContent<K extends PageKind>(kind: K, raw: unknown): ContentResult<K> {
  const parsed = PAGE_SCHEMAS[kind].safeParse(raw);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues[0]?.message ?? "Check the form." };
  }
  return { ok: true, content: parsed.data as PageContent<K> };
}

/**
 * Read stored content for display. Content is validated on every write, so a
 * failure here means the schema has since tightened; the page then shows what
 * it can rather than nothing, and the owner's next save brings it in line.
 */
export function readPageContent<K extends PageKind>(kind: K, raw: unknown): PageContent<K> | null {
  const parsed = PAGE_SCHEMAS[kind].safeParse(raw);
  return parsed.success ? (parsed.data as PageContent<K>) : null;
}

const INSTAGRAM_HOSTS = ["instagram.com", "instagr.am"];
const FACEBOOK_HOSTS = ["facebook.com", "m.facebook.com", "web.facebook.com", "fb.com"];

function onHosts(result: ScreenResult, hosts: string[], message: string): ScreenResult {
  if (!result.ok) return result;
  const host = new URL(result.normalised).hostname.replace(/^www\./, "");
  return hosts.includes(host) ? result : { ok: false, reason: message };
}

/**
 * The destination for a link-type code, from what the owner typed.
 *
 * Instagram and Facebook take either a handle or a full link, because people
 * know their handle better than their profile URL. Either way the result is
 * screened and must land on that network, so an "Instagram" code cannot be a
 * disguise for some other site.
 */
export function linkDestination(kind: LinkKind, input: string): ScreenResult {
  const raw = input.trim();
  switch (kind) {
    case "url":
      return screenUrl(raw);
    case "instagram": {
      const handle = raw.replace(/^@/, "");
      if (/^[A-Za-z0-9._]{1,30}$/.test(handle) && !handle.includes("..")) {
        return { ok: true, normalised: `https://www.instagram.com/${handle}/` };
      }
      return onHosts(screenUrl(raw), INSTAGRAM_HOSTS, "Enter an Instagram handle or an instagram.com link.");
    }
    case "facebook": {
      if (/^[A-Za-z0-9.]{5,50}$/.test(raw) && !raw.includes(".com")) {
        return { ok: true, normalised: `https://www.facebook.com/${raw}` };
      }
      return onHosts(screenUrl(raw), FACEBOOK_HOSTS, "Enter a Facebook page name or a facebook.com link.");
    }
  }
}

/**
 * Every file a stored page references, for ownership checks. Walks the whole
 * value rather than knowing each schema's shape, so a new file field is
 * covered without touching this.
 */
export function collectFileIds(value: unknown, into: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectFileIds(item, into);
  } else if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.fileId === "string") into.add(record.fileId);
    for (const child of Object.values(record)) collectFileIds(child, into);
  }
  return into;
}
