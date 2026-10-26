import Link from "next/link";
import type { TypeInfo } from "@/lib/qr-types";
import { TypeIcon } from "../TypeIcon";

/**
 * Page types that cannot be filled in without an upload. On a deployment with
 * no UploadThing token they are shown but not offered, with the reason.
 */
export const UPLOAD_ONLY = new Set(["pdf", "images", "mp3", "playlist"]);

export function TypeSection<K extends string>({
  id,
  heading,
  note,
  types,
  href,
  disabled,
  needsUpload,
}: {
  id: string;
  heading: string;
  note: string;
  types: readonly TypeInfo<K>[];
  href: (kind: K) => string;
  disabled?: boolean;
  needsUpload?: (kind: K) => boolean;
}) {
  const card =
    "flex h-full items-start gap-3 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3.5 text-left";

  return (
    <section aria-labelledby={id} className="mb-12">
      <h2 id={id} className="font-sarlotte text-2xl leading-none">
        {heading}
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[var(--paper-soft)]">
        {note}
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((type) => {
          const body = (
            <>
              <TypeIcon name={type.kind} className="mt-0.5 shrink-0 text-[var(--paper-ink)]" />
              <span className="min-w-0">
                <span className="block text-[15px] font-medium text-[var(--paper-ink)]">
                  {type.label}
                </span>
                <span className="block text-sm text-[var(--paper-soft)]">
                  {needsUpload?.(type.kind) ? "Needs file uploads, not available yet" : type.blurb}
                </span>
              </span>
            </>
          );
          const off = disabled || needsUpload?.(type.kind);
          return (
            <li key={type.kind}>
              {off ? (
                <div aria-disabled className={`${card} opacity-55`}>
                  {body}
                </div>
              ) : (
                <Link
                  href={href(type.kind)}
                  className={`${card} no-underline transition-colors duration-150 hover:border-[var(--paper-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
                >
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
