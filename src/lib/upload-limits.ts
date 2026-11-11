/**
 * What each upload endpoint accepts, and what an owner is told when a file
 * is refused.
 *
 * One table for both sides. The UploadThing router reads its size and count
 * limits from here, and the dashboard checks a picked file against the same
 * numbers before it asks for an upload URL, so the two cannot drift and an
 * oversized photo is named before any of it is sent. Pure, with no imports,
 * so it is safe in a client component and tested without a network.
 */

export type UploadEndpoint = "logo" | "pageImage" | "pagePdf" | "pageVideo" | "pageAudio" | "blogImage";

type Limit = {
  /** In UploadThing's notation, which it parses with 1024-byte units. */
  maxFileSize: "1MB" | "4MB" | "16MB" | "64MB";
  /** Files per upload request. A larger pick is sent in several. */
  maxFileCount: number;
  /** What one file is called in a message. */
  noun: string;
};

export const UPLOAD_LIMITS: Record<UploadEndpoint, Limit> = {
  logo: { maxFileSize: "1MB", maxFileCount: 1, noun: "logo" },
  pageImage: { maxFileSize: "4MB", maxFileCount: 10, noun: "photo" },
  pagePdf: { maxFileSize: "16MB", maxFileCount: 1, noun: "PDF" },
  pageVideo: { maxFileSize: "64MB", maxFileCount: 1, noun: "video" },
  pageAudio: { maxFileSize: "16MB", maxFileCount: 10, noun: "track" },
  // Staff only: covers and figures for blog posts.
  blogImage: { maxFileSize: "4MB", maxFileCount: 1, noun: "image" },
};

/** Bytes in a limit, counted as UploadThing counts them (1MB = 1024 × 1024). */
export function limitBytes(endpoint: UploadEndpoint): number {
  return parseInt(UPLOAD_LIMITS[endpoint].maxFileSize, 10) * 1024 * 1024;
}

/** A file size the way a person would say it: "840 KB", "3.2 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  const mb = bytes / (1024 * 1024);
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

export type PickCheck<F> = { accepted: F[]; problem: string | null };

/**
 * Sort a pick into the files that can be sent and a sentence about the rest.
 *
 * `room` is how many more the field holds (a gallery's 20, less what it
 * shows). Files that fit are sent even when others are refused, so one large
 * photo no longer costs the owner the five small ones picked with it.
 */
export function checkPicked<F extends { name: string; size: number }>(
  endpoint: UploadEndpoint,
  files: F[],
  room: number
): PickCheck<F> {
  const { noun, maxFileSize } = UPLOAD_LIMITS[endpoint];
  const max = limitBytes(endpoint);
  const tooBig = files.filter((file) => file.size > max);
  const fits = files.filter((file) => file.size <= max);
  const accepted = fits.slice(0, Math.max(0, room));
  const overflow = fits.length - accepted.length;

  const problems: string[] = [];
  if (tooBig.length === 1) {
    const [file] = tooBig;
    problems.push(
      `${file.name} is ${formatBytes(file.size)}, over the ${maxFileSize} limit for a ${noun}. Choose a smaller one.`
    );
  } else if (tooBig.length > 1) {
    problems.push(
      `${plural(tooBig.length, noun)} are over the ${maxFileSize} limit and were not uploaded: ${tooBig
        .map((file) => file.name)
        .join(", ")}.`
    );
  }
  if (overflow > 0) {
    problems.push(
      room > 0
        ? `There is room for ${plural(room, `more ${noun}`)}, so the last ${overflow} were not uploaded.`
        : `This page is full. Remove a ${noun} to add another.`
    );
  }
  return { accepted, problem: problems.length ? problems.join(" ") : null };
}

/** Split a list into runs of at most `size`, for the per-request file limit. */
export function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += Math.max(1, size)) out.push(items.slice(i, i + size));
  return out;
}

/**
 * The sentence an UploadThing refusal becomes before it reaches the browser.
 *
 * UploadThing names a size or count failure by its internal tag ("Invalid
 * config: FileSizeMismatch") and puts the readable reason in `cause`, which
 * its default formatter does not send. Its other internal failures read just
 * as badly. Messages this app throws itself (signed out, the logo library is
 * full) pass through unchanged.
 */
export function uploadRefusal(message: string, cause: unknown): string {
  const detail = typeof cause === "string" ? cause : "";
  if (message === "Invalid config: FileSizeMismatch") {
    const limit = /limit for that type is (\S+)$/.exec(detail)?.[1];
    return limit
      ? `That file is over the ${limit} limit. Choose a smaller one and try again.`
      : "That file is too large. Choose a smaller one and try again.";
  }
  if (message === "Invalid config: FileCountMismatch") {
    const max = /maximum for that type is (\d+)/.exec(detail)?.[1];
    return max
      ? `Upload up to ${max} at a time.`
      : "That is too many files at once. Upload fewer at a time.";
  }
  if (message.startsWith("Invalid config") || message === "Invalid route config") {
    return "That kind of file cannot be uploaded here.";
  }
  if (message === "Invalid input" || message.startsWith("Failed to run")) {
    return "That upload could not start. Please try again.";
  }
  return message;
}

/**
 * What the browser shows for a failure it caught itself: a dropped
 * connection reports an XHR status, which means nothing to an owner.
 */
export function clientUploadMessage(error: { code?: string; message?: string }): string {
  const message = error.message ?? "";
  if (!message || error.code === "UPLOAD_FAILED" || error.code === "INTERNAL_CLIENT_ERROR") {
    return "That upload did not finish. Check your connection and try again.";
  }
  return message;
}

/** Said when UploadThing took a file but this server did not record it. */
export function unsavedUploadMessage(count: number, noun: string): string {
  return count === 1
    ? `A ${noun} uploaded but could not be saved. Please try it again.`
    : `${plural(count, noun)} uploaded but could not be saved. Please try them again.`;
}
