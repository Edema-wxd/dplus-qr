import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { resolveScope } from "@/lib/resolve-scope";
import { ensureProfile } from "@/lib/profile";
import { fileKind, formatBytes, listFileLibrary, type LibraryFile } from "@/lib/files";
import { isOptimisableImage } from "@/lib/upload-host";
import { getEntitlement } from "@/lib/entitlement";
import { storageQuotaBytes } from "@/lib/storage-quota";
import { primaryButtonClass } from "@/components/controls";
import { DashShell } from "../DashShell";
import { TypeIcon } from "../TypeIcon";

export const metadata: Metadata = { title: "Files" };

// The signed-in owner's own uploads; nothing static to stream around.
export const instant = false;

/**
 * Every file the account has uploaded for its pages, and the codes that show
 * each one.
 *
 * A map, not a second editor: a file is changed by opening the code that
 * shows it and pressing Replace, where it already works, so there is one way
 * to change a document and it always keeps the printed code the same. Each
 * "used by" entry links straight there.
 */
export default async function FilesPage() {
  // Before the session read; see the codes page for why.
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");
  await ensureProfile({ id: user.id, email: user.email, name: user.name });
  // Which account this page shows, and as whom. Its own unless the person
  // is working in a team they belong to; every read below proves access.
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");

  const [files, entitlement] = await Promise.all([listFileLibrary(scope), getEntitlement(scope.accountId)]);
  const unused = files.filter((file) => file.usedBy.length === 0).length;
  // Every file counts against the plan's page-file storage, used or not, so
  // the total is shown where the files are (DECISIONS.md, 11 November 2026).
  const used = files.reduce((total, file) => total + file.sizeBytes, 0);
  const quota = storageQuotaBytes(entitlement?.features);

  return (
    <DashShell
      heading="Files"
      meta={
        files.length > 0 ? (
          <span className="dash-num">
            {files.length} {files.length === 1 ? "file" : "files"}
            {unused > 0 ? ` · ${unused} not used by any code` : ""}
            {` · ${formatBytes(used)} of ${formatBytes(quota)} used`}
          </span>
        ) : undefined
      }
    >
      {files.length === 0 ? (
        <div className="max-w-[52ch] rounded-lg border border-dashed border-[var(--paper-rule)] bg-white px-5 py-6">
          <p className="text-sm leading-relaxed">
            No files yet. The PDFs, photos, videos and audio you upload for a code&apos;s page are kept here, with the
            codes that show them.
          </p>
          <Link href="/app/new" className={`${primaryButtonClass} mt-4 no-underline`}>
            New code
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-5 max-w-[62ch] text-sm leading-relaxed text-[var(--paper-soft)]">
            To change a file, open the code that shows it and press Replace. The printed code stays exactly the same,
            and the next person to scan it sees the new file.
          </p>
          <ul className="divide-y divide-[var(--paper-rule)] overflow-hidden rounded-lg border border-[var(--paper-rule)] bg-white">
            {files.map((file) => (
              <FileRow key={file.id} file={file} />
            ))}
          </ul>
          {unused > 0 ? (
            <p className="mt-4 max-w-[62ch] text-xs leading-relaxed text-[var(--paper-soft)]">
              A file no code uses may be cleared out a week after it was uploaded. Until then it counts towards your
              storage.
            </p>
          ) : null}
        </>
      )}
    </DashShell>
  );
}

function FileRow({ file }: { file: LibraryFile }) {
  const kind = fileKind(file.mime);
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-3 px-4 py-4 sm:flex-nowrap">
      <Preview file={file} kind={kind} />

      <div className="min-w-0 flex-1">
        {/* The owner's own file, opened in a new tab to check what it is. */}
        <a
          href={file.url}
          target="_blank"
          rel="noopener"
          className="block truncate text-sm font-medium text-[var(--paper-ink)] underline-offset-4 hover:underline"
        >
          {file.name}
        </a>
        <p className="dash-num mt-0.5 text-xs text-[var(--paper-soft)]">
          {kind} · {formatBytes(file.sizeBytes)} · uploaded{" "}
          <time dateTime={file.uploadedAt.toISOString()}>
            {file.uploadedAt.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
          </time>
        </p>
      </div>

      <div className="w-full pl-16 text-xs sm:w-56 sm:shrink-0 sm:pl-0">
        {file.usedBy.length === 0 ? (
          <span className="text-[var(--paper-soft)]">Not used by any code</span>
        ) : (
          <>
            <span className="text-[var(--paper-soft)]">Shown by</span>
            <ul className="mt-1 space-y-1">
              {file.usedBy.map((code) => (
                <li key={code.codeId} className="flex items-center gap-1.5">
                  <TypeIcon name={code.kind} className="h-3.5 w-3.5 shrink-0 text-[var(--paper-soft)]" />
                  <Link
                    href={`/app/${code.codeId}`}
                    className="truncate text-[var(--paper-ink)] underline underline-offset-4"
                  >
                    {code.name}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </li>
  );
}

/** A thumbnail for a photo, the type's icon for anything else. */
function Preview({ file, kind }: { file: LibraryFile; kind: ReturnType<typeof fileKind> }) {
  const box = "relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[var(--paper-rule)] bg-[var(--paper-raised)] text-[var(--paper-soft)]";
  if (kind === "Image") {
    return (
      <div className={box}>
        {isOptimisableImage(file.url) ? (
          <Image src={file.url} alt="" fill sizes="48px" className="object-cover" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={file.url} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
    );
  }
  const icon = { PDF: "pdf", Video: "video", Audio: "mp3", Image: "images", File: "pdf" }[kind];
  return (
    <div className={box}>
      <TypeIcon name={icon} />
    </div>
  );
}
