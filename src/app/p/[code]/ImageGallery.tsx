"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Full-size photos without leaving the page.
 *
 * The thumbnails are rendered on the server, each inside a link to the
 * original with a `data-gallery-index`. This wraps them: a tap opens that
 * photo in a full-screen dialog over the page instead of following the link,
 * so the scanner stays on the owner's page, footer and all. Without
 * JavaScript the links still open the original, as before.
 *
 * A native `<dialog>` opened with `showModal()`: the browser traps focus in
 * it, makes the page behind inert and closes it on Escape, and focus returns
 * to the thumbnail that opened it. Arrow keys and a sideways swipe move
 * between photos.
 */
export function ImageGallery({
  images,
  children,
}: {
  images: { url: string; alt: string }[];
  children: React.ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [index, setIndex] = useState<number | null>(null);
  const swipeStart = useRef<number | null>(null);
  // A swipe ends with a click wherever the finger lifted; set so that click
  // is not also read as a tap beside the photo, which would close it.
  const swiped = useRef(false);

  const count = images.length;
  const step = useCallback(
    (by: number) => setIndex((current) => (current === null ? null : (current + by + count) % count)),
    [count]
  );

  useEffect(() => {
    if (index !== null && !dialog.current?.open) dialog.current?.showModal();
  }, [index]);

  function open(event: React.MouseEvent<HTMLDivElement>) {
    // Let a modified click (new tab, save) do what the person asked for.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-gallery-index]");
    if (!link) return;
    const at = Number(link.dataset.galleryIndex);
    if (!Number.isInteger(at) || at < 0 || at >= count) return;
    event.preventDefault();
    setIndex(at);
  }

  function keys(event: React.KeyboardEvent<HTMLDialogElement>) {
    if (event.key === "ArrowRight") step(1);
    if (event.key === "ArrowLeft") step(-1);
  }

  const current = index === null ? null : images[index];

  return (
    <>
      <div onClick={open}>{children}</div>

      <dialog
        ref={dialog}
        aria-label={current ? current.alt : "Photo"}
        onClose={() => setIndex(null)}
        onKeyDown={keys}
        onPointerDown={(event) => (swipeStart.current = event.clientX)}
        onPointerUp={(event) => {
          if (swipeStart.current === null) return;
          const moved = event.clientX - swipeStart.current;
          swipeStart.current = null;
          swiped.current = Math.abs(moved) > 50;
          if (swiped.current) step(moved < 0 ? 1 : -1);
        }}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-white backdrop:bg-black"
      >
        {current ? (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="tabular-nums" aria-live="polite">
                {index! + 1} / {count}
              </span>
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className="rounded-md px-3 py-2 text-white/90 hover:text-white"
                autoFocus
              >
                Close
              </button>
            </div>
            {/* A tap beside the photo, not on it, closes. */}
            <div
              className="flex min-h-0 flex-1 items-center justify-center px-2"
              onClick={(event) => {
                if (swiped.current) {
                  swiped.current = false;
                  return;
                }
                if (event.target === event.currentTarget) dialog.current?.close();
              }}
            >
              {/* The original, which is what someone tapping a photo asked for. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={current.url}
                alt={current.alt}
                className="max-h-full max-w-full select-none object-contain"
                draggable={false}
              />
            </div>
            {count > 1 ? (
              <div className="flex justify-between px-4 py-4">
                <button type="button" onClick={() => step(-1)} className="rounded-md px-4 py-2 text-white/90 hover:text-white">
                  ← Previous
                </button>
                <button type="button" onClick={() => step(1)} className="rounded-md px-4 py-2 text-white/90 hover:text-white">
                  Next →
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </dialog>
    </>
  );
}
