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
import { canUploadVideo, getEntitlement } from "@/lib/entitlement";
import { UPLOAD_LIMITS, uploadRefusal, type UploadEndpoint } from "@/lib/upload-limits";
import { videoRefusal } from "@/lib/user-codes";

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
 *
 * **What a refusal can say.** A message thrown from `middleware` reaches the
 * browser, through `errorFormatter`, which also rewrites UploadThing's own
 * refusals ("Invalid config: FileSizeMismatch") into sentences. A throw from
 * `onUploadComplete` reaches no one: UploadThing logs it and never answers
 * the browser, so the form only learns that no file came back. Anything the
 * owner must be told is decided in `middleware`, before a file is stored.
 */
const f = createUploadthing({
  errorFormatter: (error) => ({ message: uploadRefusal(error.message, error.cause) }),
});

/** An endpoint's limits, from the table the dashboard checks against too. */
function limits(endpoint: UploadEndpoint) {
  const { maxFileSize, maxFileCount } = UPLOAD_LIMITS[endpoint];
  return { maxFileSize, maxFileCount };
}

const image = limits("logo");

/** The session check every page-file endpoint shares. */
async function pageFileOwner() {
  const { data: session } = await auth.getSession();
  if (!session?.user) throw new UploadThingError("Sign in to upload a file.");
  return { userId: session.user.id };
}

/**
 * Video files are the one real storage cost, so uploading them is a plan
 * feature (`video_uploads`). Checked here, before UploadThing hands out an
 * upload URL, so no file is stored for a plan that cannot use it.
 */
async function videoFileOwner() {
  const owner = await pageFileOwner();
  const entitlement = await getEntitlement(owner.userId);
  if (!canUploadVideo(entitlement)) throw new UploadThingError(await videoRefusal(entitlement));
  return owner;
}

/**
 * Recorded against the account so a page can only ever show a file its owner
 * uploaded; see `resolveFiles`. Sent back to the browser, which places the
 * file in the page being edited.
 *
 * A file that cannot be recorded is deleted again. Without a `qr_files` row
 * nothing refers to it, and the cleanup sweep, which finds orphans from those
 * rows, would never find it either.
 */
async function recordPageFile({
  metadata,
  file,
}: {
  metadata: { userId: string };
  file: { key: string; ufsUrl: string; name: string; type: string; size: number };
}) {
  let stored;
  try {
    stored = await recordFile(metadata.userId, {
      key: file.key,
      url: file.ufsUrl,
      name: file.name,
      type: file.type,
      size: file.size,
    });
  } catch (error) {
    console.error("[uploads] page file not recorded", error);
    await new UTApi().deleteFiles(file.key).catch(() => {});
    throw error;
  }
  return { fileId: stored.id, url: stored.url, name: stored.name, mime: stored.mime };
}

const photo = limits("pageImage");

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
      // in the library and fail every download that used it. The throw only
      // reaches the log (see the note at the top); `LogoPicker` tells the
      // owner when no logo comes back.
      let logo;
      try {
        await loadLogo(file.ufsUrl);
        logo = await recordLogo(metadata.userId, {
          key: file.key,
          url: file.ufsUrl,
          name: file.name,
          type: file.type,
          size: file.size,
        });
      } catch (error) {
        console.error("[uploads] logo not decoded or not recorded", error);
        await new UTApi().deleteFiles(file.key).catch(() => {});
        throw error;
      }
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

  pagePdf: f({ "application/pdf": limits("pagePdf") })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),

  pageVideo: f({
    "video/mp4": limits("pageVideo"),
    "video/webm": limits("pageVideo"),
    "video/quicktime": limits("pageVideo"),
  })
    .middleware(videoFileOwner)
    .onUploadComplete(recordPageFile),

  pageAudio: f({ audio: limits("pageAudio") })
    .middleware(pageFileOwner)
    .onUploadComplete(recordPageFile),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
