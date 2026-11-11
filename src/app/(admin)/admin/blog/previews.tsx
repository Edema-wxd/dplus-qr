"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/controls";
import { useUploadThing } from "@/app/(app)/app/uploadthing";
import { CODE_HOST, PRODUCT_NAME } from "@/lib/brand";
import { isHttpsUrl } from "@/lib/blog-schema";
import type { Check, CheckGroup } from "@/lib/blog-seo";
import { checkPicked, clientUploadMessage } from "@/lib/upload-limits";
import { help, label } from "./fields";

/**
 * How the post will look where it is found: a search result, a shared link,
 * and the checklist of what would help it be found and quoted.
 */

/** A search result, drawn the way Google draws one, cut where Google cuts. */
export function SerpPreview({ title, description, slug }: { title: string; description: string; slug: string }) {
  return (
    <figure aria-label="Search result preview" className="rounded-md border border-[var(--paper-rule)] bg-white px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid size-7 place-items-center rounded-full bg-[var(--paper-raised)] text-[11px] font-semibold">
          Q+
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-[13px] text-[#202124]">{PRODUCT_NAME}</span>
          <span className="block truncate text-[12px] text-[#4d5156]">
            https://{CODE_HOST} › blog › {slug || "…"}
          </span>
        </span>
      </div>
      <p className="mt-2 truncate text-[19px] leading-snug text-[#1a0dab]">{title || "Untitled post"}</p>
      <p className="mt-1 line-clamp-2 text-[13.5px] leading-[1.55] text-[#4d5156]">
        {description || "No description yet. Search engines will pick a line from the post instead."}
      </p>
    </figure>
  );
}

/**
 * A shared link. With a social image set, that image; otherwise the card the
 * site generates, drawn here in outline. The real card carries a scannable
 * code of the post's address, which is only drawn once the post is public,
 * so this shows where it goes rather than a symbol that would not scan.
 */
export function SocialPreview({
  title,
  description,
  image,
  category,
}: {
  title: string;
  description: string;
  image: string;
  category: string;
}) {
  return (
    <figure aria-label="Shared link preview" className="overflow-hidden rounded-md border border-[var(--paper-rule)] bg-white">
      <div className="aspect-[1.91/1] w-full">
        {image && isHttpsUrl(image) ? (
          // eslint-disable-next-line @next/next/no-img-element -- any https host staff paste
          <img src={image} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full grid-cols-[1fr_2fr]">
            <div className="flex flex-col items-center justify-center gap-2 bg-[#FBFAF6] p-2">
              <span className="grid aspect-square w-3/5 place-items-center border border-dashed border-[#9AA6AC] text-center text-[9px] leading-tight text-[#5E6B72]">
                Code of the post&rsquo;s address
              </span>
              <Image src="/brand/qriate-wordmark.svg" alt="" width={70} height={29} className="h-auto w-[56%]" />
            </div>
            <div className="flex flex-col justify-center bg-[#16191B] px-4">
              {category ? <span className="font-sarlotte text-[11px] text-[#7FD0EC]">{category}</span> : null}
              <span className="mt-1 line-clamp-4 font-sarlotte text-[17px] leading-[1.08] text-[#F7F9F8]">
                {title || "Untitled post"}
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--paper-rule)] px-3 py-2.5">
        <p className="text-[11px] uppercase tracking-[0.08em] text-[var(--paper-soft)]">{CODE_HOST}</p>
        <p className="mt-0.5 truncate text-[14px] font-medium">{title || "Untitled post"}</p>
        <p className="line-clamp-1 text-[13px] text-[var(--paper-soft)]">{description}</p>
      </div>
    </figure>
  );
}

const GROUPS: CheckGroup[] = ["Search", "Answer engines", "Readers"];

/** The checklist, grouped, with what was measured beside each item. */
export function Checklist({ checks }: { checks: Check[] }) {
  const passing = checks.filter((check) => check.pass).length;
  return (
    <div>
      <p className="text-sm">
        <span className="dash-num font-medium">
          {passing} of {checks.length}
        </span>{" "}
        <span className="text-[var(--paper-soft)]">checks pass</span>
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--paper-rule)]" aria-hidden>
        <div
          className="h-full origin-left rounded-full bg-[var(--paper-ink)] transition-transform duration-300 ease-[var(--ease-out)]"
          style={{ transform: `scaleX(${checks.length ? passing / checks.length : 0})` }}
        />
      </div>
      {GROUPS.map((group) => (
        <div key={group} className="mt-4">
          <p className="text-xs text-[var(--paper-soft)]">{group}</p>
          <ul className="mt-1.5 space-y-2">
            {checks
              .filter((check) => check.group === group)
              .map((check) => (
                <li key={check.id} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-x-2 text-[13px] leading-snug">
                  <span aria-hidden className="pt-0.5">
                    {check.pass ? (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3.5 8.5 6.5 11.5 12.5 4.5" stroke="var(--paper-ink)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="8" r="5" stroke="var(--pending-ink)" strokeWidth="1.6" />
                      </svg>
                    )}
                  </span>
                  <span>
                    <span className="sr-only">{check.pass ? "Passes: " : "Needs work: "}</span>
                    {check.label}
                    <span className="block text-xs text-[var(--paper-soft)]">{check.detail}</span>
                  </span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** An image address: pasted, or uploaded to UploadThing when uploads are set up. */
export function ImageField({
  id,
  name,
  value,
  onChange,
  uploads,
  hint,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  uploads: boolean;
  hint?: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const { startUpload, isUploading } = useUploadThing("blogImage", {
    onClientUploadComplete: (results) => {
      const data = results[0]?.serverData;
      if (!data) {
        setError("That image could not be saved. Check it is a PNG, JPEG or WebP, then try again.");
        return;
      }
      setError(null);
      onChange(data.url);
    },
    onUploadError: (uploadError) => setError(clientUploadMessage(uploadError)),
  });

  return (
    <div>
      <label htmlFor={id} className={label}>
        {name}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          type="url"
          inputMode="url"
          value={value}
          placeholder="https://"
          onChange={(event) => onChange(event.target.value)}
          className={`${inputClass} min-w-0 flex-1`}
        />
        {uploads ? (
          <>
            <button
              type="button"
              className={`${secondaryButtonClass} shrink-0`}
              onClick={() => input.current?.click()}
              disabled={isUploading}
            >
              {isUploading ? "Uploading…" : "Upload"}
            </button>
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                const { accepted, problem } = checkPicked("blogImage", [file], 1);
                setError(problem);
                if (accepted.length) startUpload(accepted);
              }}
            />
          </>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-[var(--struck-ink)]">
          {error}
        </p>
      ) : hint ? (
        <p className={help}>{hint}</p>
      ) : null}
      {value && isHttpsUrl(value) ? (
        // eslint-disable-next-line @next/next/no-img-element -- a thumbnail of any https host staff paste
        <img src={value} alt="" className="mt-2 aspect-video w-full rounded-md border border-[var(--paper-rule)] object-cover" />
      ) : null}
    </div>
  );
}
