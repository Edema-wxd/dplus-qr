import { createUploadthing, type FileRouter } from "uploadthing/next";
import { UploadThingError, UTApi } from "uploadthing/server";
import { auth } from "@/lib/auth/server";
import {
  countLogos,
  loadLogo,
  MAX_LOGOS,
  recordLogo,
} from "@/lib/logos";
import { recordFile } from "@/lib/files";

/**
 * Every customer upload goes through here: logos, and the files hosted pages
 * show (PDFs, photos, video, audio).
 *
 * `middleware` runs on our server before UploadThing hands the browser an
 * upload URL, so it is where the session is checked: the user id attached to
 * the file comes from the session, never from the client. `onUploadComplete`
 * runs when UploadThing calls back to confirm the file landed, and is where
 * the logo joins the account's library.
 *
 * SVG is not accepted. It can carry script, and logos are drawn inside the
 * dashboard's own page.
 */
const f = createUploadthing();

const image = { maxFileSize: "1MB", maxFileCount: 1 } as const;

/** The session check every page-file endpoint shares. */
async function pageFileOwner() {
  const { data: session } = await auth.getSession();
  if (!session?.user) throw new UploadThingError("Sign in to upload a file.");
  return { userId: session.user.id };
}

/**
 * Recorded against the account so a page can only ever show a file its owner
 * uploaded; see `resolveFiles`. Sent back to the browser, which places the
 * file in the page being edited.
 */
async function recordPageFile({
  metadata,
  file,
}: {
  metadata: { userId: string };
  file: { key: string; ufsUrl: string; name: string; type: string; size: number };
}) {
  const stored = await recordFile(metadata.userId, {
    key: file.key,
    url: file.ufsUrl,
    name: file.name,
    type: file.type,
    size: file.size,
  });
  return { fileId: stored.id, url: stored.url, name: stored.name, mime: stored.mime };
}

const photo = { maxFileSize: "4MB", maxFileCount: 10 } as const;

export const uploadRouter = {
  logo: f({ "image/png": image, "image/jpeg": image, "image/webp": image })
    .middleware(async () => {
      const { data: session } = await auth.getSession();
      if (!session?.user) throw new UploadThingError("Sign in to upload a logo.");

      if ((await countLogos(session.user.id)) >= MAX_LOGOS) {
        throw new UploadThingError(
          `Your library already holds ${MAX_LOGOS} logos. Remove one you no longer use, then upload again.`
        );
      }
      return { userId: session.user.id };
    })
    .onUploadComplete(async ({ metadata, file }) => {
      // Decoded before it is recorded: UploadThing accepts a file by its
      // declared type, and a "logo" that is not an image would otherwise sit
      // in the library and fail every download that used it.
      try {
        await loadLogo(file.ufsUrl);
      } catch (error) {
        console.error("[uploads] logo did not decode", error);
        await new UTApi().deleteFiles(file.key).catch(() => {});
        throw new UploadThingError("That file could not be read as an image.");
      }

      const logo = await recordLogo(metadata.userId, {
        key: file.key,
        url: file.ufsUrl,
        name: file.name,
        type: file.type,
        size: file.size,
      });
      // Sent back to the browser, which selects the new logo straight away.
      return { logoId: logo.id, url: logo.url, name: logo.name };
    }),

  // Page files. SVG is refused for the reason logos refuse it: a hosted page
  // is on our own origin.
  pageImage: f({
    "image/png": photo,
    "image/jpeg": photo,
    "image/webp": photo,
    "image/gif": photo,
  })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),

  pagePdf: f({ "application/pdf": { maxFileSize: "16MB", maxFileCount: 1 } })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),

  pageVideo: f({
    "video/mp4": { maxFileSize: "64MB", maxFileCount: 1 },
    "video/webm": { maxFileSize: "64MB", maxFileCount: 1 },
    "video/quicktime": { maxFileSize: "64MB", maxFileCount: 1 },
  })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),

  pageAudio: f({ audio: { maxFileSize: "16MB", maxFileCount: 10 } })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
