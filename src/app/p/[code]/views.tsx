import Image from "next/image";
import type { PageKind } from "@/lib/qr-types";
import { isOptimisableImage } from "@/lib/upload-host";
import { SOCIAL_NETWORKS, type FileRef, type PageContent } from "@/lib/page-content";
import { gs1ElementString, videoEmbedUrl } from "@/lib/page-helpers";
import { FeedbackForm } from "./FeedbackForm";
import { CopyText } from "./CopyText";

/**
 * One view per hosted page type. Server components throughout; the only
 * client pieces are the feedback form and the coupon's copy button.
 *
 * Built for a phone held at arm's length in a shop or a restaurant: one
 * column, large tap targets, the one action the page exists for first.
 * Every URL rendered here was screened when it was saved, and every file URL
 * came from this server's own record of an UploadThing upload.
 */

const button =
  "flex w-full items-center justify-center rounded-lg bg-foreground px-4 py-3 text-[15px] font-medium text-background no-underline transition-transform duration-150 active:scale-[0.98]";
const quiet =
  "flex w-full items-center justify-center rounded-lg border border-border bg-card px-4 py-3 text-[15px] text-foreground no-underline transition-colors duration-150 hover:border-foreground";

function Heading({ title, sub }: { title: string; sub?: string }) {
  return (
    <header>
      <h1 className="font-sarlotte text-[2rem] leading-tight">{title}</h1>
      {sub ? <p className="mt-1 text-muted-foreground">{sub}</p> : null}
    </header>
  );
}

function Prose({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{text}</p>;
}

/**
 * A customer's photo, sized for the phone looking at it.
 *
 * Uploads can be 4MB, and these pages are opened in shops and restaurants on
 * mobile data. Through `next/image` the phone gets a WebP at the width it
 * needs (`sizes`), so a full-width cover costs a few hundred KB, not the
 * original. The box (`frame`) sets the shape; the image fills it.
 *
 * A URL the optimiser is not configured for renders as a plain `<img>`
 * rather than failing: `next/image` throws on an unlisted host, and a page
 * that crashes because of one picture is worse than a heavy picture.
 */
function PageImage({
  url,
  alt,
  frame,
  sizes,
  fit = "cover",
  eager = false,
}: {
  url: string;
  alt: string;
  /** Classes for the box: its size, shape and border. */
  frame: string;
  /** The rendered width, for `srcset`. Must match `frame`. */
  sizes: string;
  fit?: "cover" | "contain";
  /** Above the fold: load now rather than lazily. */
  eager?: boolean;
}) {
  const fitClass = fit === "cover" ? "object-cover" : "object-contain";
  return (
    <div className={`relative overflow-hidden ${frame}`}>
      {isOptimisableImage(url) ? (
        <Image
          src={url}
          alt={alt}
          fill
          sizes={sizes}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : undefined}
          className={fitClass}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          className={`absolute inset-0 h-full w-full ${fitClass}`}
        />
      )}
    </div>
  );
}

/** The page column is at most 28rem (448px) wide inside a 16px gutter. */
const FULL_WIDTH = "(max-width: 480px) calc(100vw - 2rem), 448px";

function Cover({ file, alt, round }: { file: FileRef | null; alt: string; round?: boolean }) {
  if (!file) return null;
  // A cover is the first thing on its page, so it is the one picture worth
  // fetching before the rest of the page has been read.
  return round ? (
    <PageImage
      url={file.url}
      alt={alt}
      frame="h-28 w-28 shrink-0 rounded-full border border-border"
      sizes="112px"
      eager
    />
  ) : (
    <PageImage
      url={file.url}
      alt={alt}
      frame="aspect-[16/9] w-full rounded-xl border border-border"
      sizes={FULL_WIDTH}
      eager
    />
  );
}

function Stack({ children }: { children: React.ReactNode }) {
  return <article className="space-y-6">{children}</article>;
}

function Contact({
  phone,
  email,
  website,
  address,
}: {
  phone?: string;
  email?: string;
  website?: string;
  address?: string;
}) {
  if (!phone && !email && !website && !address) return null;
  return (
    <div className="space-y-2">
      {phone ? (
        <a href={`tel:${phone.replace(/[\s().-]/g, "")}`} className={quiet}>
          Call {phone}
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={quiet}>
          Email {email}
        </a>
      ) : null}
      {website ? (
        <a href={website} rel="noopener nofollow" className={quiet}>
          Visit website
        </a>
      ) : null}
      {address ? (
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
          rel="noopener nofollow"
          className={quiet}
        >
          <span className="whitespace-pre-line text-center">{address}</span>
        </a>
      ) : null}
    </div>
  );
}

function LinkList({ links }: { links: { label: string; url: string }[] }) {
  if (links.length === 0) return null;
  return (
    <ul className="space-y-2">
      {links.map((link, i) => (
        <li key={`${link.url}-${i}`}>
          <a href={link.url} rel="noopener nofollow" className={quiet}>
            {link.label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/**
 * A `datetime-local` string, formatted as written, in the event's own zone.
 * Read as UTC and formatted as UTC, so the server's own zone cannot shift it.
 * `timeOnly` is for an end on the same day as the start.
 */
function eventTime(local: string, timeOnly = false): string {
  const date = new Date(`${local}:00Z`);
  const time = { timeZone: "UTC", hour: "numeric", minute: "2-digit" } as const;
  if (timeOnly) return date.toLocaleTimeString("en-NG", time);
  return date.toLocaleString("en-NG", {
    ...time,
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function longDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-NG", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function PageView({
  kind,
  content,
  code,
}: {
  kind: PageKind;
  content: PageContent;
  code: string;
}) {
  switch (kind) {
    case "pdf": {
      const c = content as PageContent<"pdf">;
      return (
        <Stack>
          <Heading title={c.title} />
          <Prose text={c.description} />
          <a href={c.file.url} rel="noopener" className={button}>
            Open the PDF
          </a>
          <a href={c.file.url} download={c.file.name} className={quiet}>
            Download
          </a>
        </Stack>
      );
    }

    case "images": {
      const c = content as PageContent<"images">;
      return (
        <Stack>
          <Heading title={c.title} />
          <Prose text={c.description} />
          <ul className="grid grid-cols-2 gap-2">
            {c.images.map((image, i) => (
              <li key={image.fileId} className={i === 0 ? "col-span-2" : ""}>
                {/*
                  The thumbnail is resized; tapping it opens the original,
                  which is the one time a scanner has asked for full size.
                */}
                <a href={image.url} rel="noopener" className="block">
                  <PageImage
                    url={image.url}
                    alt={`${c.title}, image ${i + 1}`}
                    frame="aspect-square w-full rounded-lg border border-border"
                    sizes={
                      i === 0
                        ? FULL_WIDTH
                        : "(max-width: 480px) calc(50vw - 1.25rem), 220px"
                    }
                    eager={i < 3}
                  />
                </a>
              </li>
            ))}
          </ul>
        </Stack>
      );
    }

    case "video": {
      const c = content as PageContent<"video">;
      const embed = c.link ? videoEmbedUrl(c.link) : null;
      return (
        <Stack>
          <Heading title={c.title} />
          {c.file ? (
            <video
              src={c.file.url}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl border border-border bg-black"
            />
          ) : embed ? (
            <iframe
              src={embed}
              title={c.title}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              className="aspect-video w-full rounded-xl border border-border"
            />
          ) : c.link ? (
            <a href={c.link} rel="noopener nofollow" className={button}>
              Watch the video
            </a>
          ) : null}
          <Prose text={c.description} />
        </Stack>
      );
    }

    case "profile": {
      const c = content as PageContent<"profile">;
      const role = [c.title, c.company].filter(Boolean).join(", ");
      return (
        <Stack>
          <div className="flex flex-col items-center gap-4 text-center">
            <Cover file={c.photo} alt={c.name} round />
            <Heading title={c.name} sub={role || undefined} />
          </div>
          <a href={`/p/${code}/contact.vcf`} className={button}>
            Save contact
          </a>
          <Prose text={c.bio} />
          <Contact phone={c.mobile} email={c.email} website={c.website} address={c.address} />
          <LinkList links={c.links} />
        </Stack>
      );
    }

    case "links": {
      const c = content as PageContent<"links">;
      return (
        <Stack>
          <Cover file={c.image} alt="" />
          <Heading title={c.title} />
          <Prose text={c.description} />
          <LinkList links={c.links} />
        </Stack>
      );
    }

    case "social": {
      const c = content as PageContent<"social">;
      return (
        <Stack>
          <div className="flex flex-col items-center gap-4 text-center">
            <Cover file={c.image} alt={c.title} round />
            <Heading title={c.title} />
            <Prose text={c.description} />
          </div>
          <LinkList
            links={c.profiles.map((p) => ({ label: SOCIAL_NETWORKS[p.network], url: p.url }))}
          />
        </Stack>
      );
    }

    case "app": {
      const c = content as PageContent<"app">;
      return (
        <Stack>
          <div className="flex items-center gap-4">
            {c.icon ? (
              <PageImage
                url={c.icon.url}
                alt=""
                frame="h-20 w-20 shrink-0 rounded-2xl border border-border"
                sizes="80px"
                eager
              />
            ) : null}
            <Heading title={c.name} />
          </div>
          <Prose text={c.description} />
          <div className="space-y-2">
            {c.ios ? (
              <a href={c.ios} rel="noopener nofollow" className={button}>
                Download on the App Store
              </a>
            ) : null}
            {c.android ? (
              <a href={c.android} rel="noopener nofollow" className={button}>
                Get it on Google Play
              </a>
            ) : null}
            {c.website ? (
              <a href={c.website} rel="noopener nofollow" className={quiet}>
                Visit website
              </a>
            ) : null}
          </div>
        </Stack>
      );
    }

    case "mp3": {
      const c = content as PageContent<"mp3">;
      return (
        <Stack>
          <Cover file={c.cover} alt="" />
          <Heading title={c.title} sub={c.artist || undefined} />
          <audio src={c.file.url} controls preload="metadata" className="w-full" />
          <Prose text={c.description} />
        </Stack>
      );
    }

    case "business": {
      const c = content as PageContent<"business">;
      return (
        <Stack>
          <Cover file={c.cover} alt="" />
          <Heading title={c.name} sub={c.tagline || undefined} />
          <Prose text={c.description} />
          {c.hours ? (
            <section>
              <h2 className="mb-1 text-sm font-medium">Opening hours</h2>
              <Prose text={c.hours} />
            </section>
          ) : null}
          <Contact phone={c.phone} email={c.email} website={c.website} address={c.address} />
        </Stack>
      );
    }

    case "menu": {
      const c = content as PageContent<"menu">;
      return (
        <Stack>
          <Heading title={c.name} />
          <Prose text={c.description} />
          {c.sections.map((section, i) => (
            <section key={`${section.name}-${i}`}>
              <h2 className="border-b border-border pb-2 font-sarlotte text-xl">{section.name}</h2>
              <ul>
                {section.items.map((item, j) => (
                  <li key={`${item.name}-${j}`} className="border-b border-border py-3 last:border-b-0">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="font-medium">{item.name}</span>
                      {item.price ? (
                        <span className="shrink-0 tabular-nums">
                          {c.currency}
                          {item.price}
                        </span>
                      ) : null}
                    </div>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-muted-foreground">{item.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </Stack>
      );
    }

    case "feedback": {
      const c = content as PageContent<"feedback">;
      return (
        <Stack>
          <Heading title={c.name} />
          <FeedbackForm
            code={code}
            question={c.question}
            reviewUrl={c.reviewUrl || null}
            thanks={c.thanks || "Thank you, we read every answer."}
          />
        </Stack>
      );
    }

    case "event": {
      const c = content as PageContent<"event">;
      return (
        <Stack>
          <Cover file={c.cover} alt="" />
          <Heading title={c.title} sub={c.organiser ? `By ${c.organiser}` : undefined} />
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">When</dt>
              <dd>
                {eventTime(c.start)}
                {c.end ? ` to ${eventTime(c.end, c.end.slice(0, 10) === c.start.slice(0, 10))}` : ""}{" "}
                (UTC{c.utcOffset})
              </dd>
            </div>
            {c.location ? (
              <div>
                <dt className="text-muted-foreground">Where</dt>
                <dd className="whitespace-pre-line">{c.location}</dd>
              </div>
            ) : null}
          </dl>
          <a href={`/p/${code}/event.ics`} className={button}>
            Add to calendar
          </a>
          {c.link ? (
            <a href={c.link} rel="noopener nofollow" className={quiet}>
              Tickets and details
            </a>
          ) : null}
          <Prose text={c.description} />
        </Stack>
      );
    }

    case "coupon": {
      const c = content as PageContent<"coupon">;
      const expired = c.validUntil && c.validUntil < new Date().toISOString().slice(0, 10);
      return (
        <Stack>
          <Cover file={c.cover} alt="" />
          <p className="text-sm uppercase tracking-[0.12em] text-muted-foreground">{c.business}</p>
          <Heading title={c.headline} />
          <Prose text={c.description} />
          {expired ? (
            <p className="rounded-lg border border-border bg-card px-4 py-3 text-center">
              This offer ended on {longDate(c.validUntil)}.
            </p>
          ) : (
            <>
              {c.code ? <CopyText text={c.code} /> : null}
              {c.validUntil ? (
                <p className="text-center text-sm text-muted-foreground">
                  Valid until {longDate(c.validUntil)}
                </p>
              ) : null}
              {c.link ? (
                <a href={c.link} rel="noopener nofollow" className={button}>
                  Redeem
                </a>
              ) : null}
            </>
          )}
          {c.terms ? (
            <section>
              <h2 className="mb-1 text-sm font-medium">Terms</h2>
              <p className="whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
                {c.terms}
              </p>
            </section>
          ) : null}
        </Stack>
      );
    }

    case "playlist": {
      const c = content as PageContent<"playlist">;
      return (
        <Stack>
          <Cover file={c.cover} alt="" />
          <Heading title={c.title} />
          <Prose text={c.description} />
          <ol className="space-y-4">
            {c.tracks.map((track, i) => (
              <li key={track.file.fileId}>
                <p className="mb-1 text-sm">
                  <span className="tabular-nums text-muted-foreground">{i + 1}.</span> {track.title}
                </p>
                <audio src={track.file.url} controls preload="none" className="w-full" />
              </li>
            ))}
          </ol>
        </Stack>
      );
    }

    case "barcode": {
      const c = content as PageContent<"barcode">;
      const rows: [string, string][] = [
        ["GTIN", c.gtin],
        ...(c.batch ? [["Batch", c.batch] as [string, string]] : []),
        ...(c.expiry ? [["Best before", longDate(c.expiry)] as [string, string]] : []),
        ...(c.serial ? [["Serial", c.serial] as [string, string]] : []),
      ];
      return (
        <Stack>
          {c.image ? (
            <PageImage
              url={c.image.url}
              alt={c.name}
              frame="mx-auto aspect-square w-full max-w-[16rem] rounded-xl border border-border"
              sizes="256px"
              fit="contain"
              eager
            />
          ) : null}
          <Heading title={c.name} sub={c.brand || undefined} />
          <Prose text={c.description} />
          <dl className="divide-y divide-border rounded-lg border border-border bg-card text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="font-mono">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="break-all text-center font-mono text-xs text-muted-foreground">
            {gs1ElementString(c)}
          </p>
          {c.link ? (
            <a href={c.link} rel="noopener nofollow" className={button}>
              More about this product
            </a>
          ) : null}
        </Stack>
      );
    }
  }
}
