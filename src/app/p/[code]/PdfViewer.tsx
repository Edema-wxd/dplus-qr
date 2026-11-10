"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";

/**
 * A hosted PDF, drawn inside the page instead of handed to the phone.
 *
 * Sending scanners to the raw file took them off this site: no "Shared by",
 * no report link and no "Powered by" footer, and on Android no view at all,
 * because Chrome there downloads a PDF rather than showing it. PDF.js (the
 * viewer Firefox uses) draws each page onto a canvas here instead, so the
 * document reads the same on every phone and the page around it stays.
 *
 * - Loaded only on PDF pages, and only after the page has painted, so it
 *   costs nothing anywhere else.
 * - Reads `/p/{code}/document`, the file's permanent same-origin address,
 *   never the UploadThing URL.
 * - Draws a page only when it comes near the screen. A 60-page brochure
 *   costs a phone one or two canvases at a time, not sixty.
 * - Canvas only: no text, link or form layers. PDF.js 6 never evaluates code
 *   from a document, and with no annotation layer nothing in the file can
 *   put a link or a field on this page. Someone who needs to select text or
 *   follow a link has "Open full screen", the browser's own viewer.
 *
 * If PDF.js cannot open the file (an old browser, a damaged or
 * password-protected PDF), the page says so and the open and download
 * buttons beside it still work.
 */

type State =
  | { phase: "loading" }
  | { phase: "ready"; doc: PDFDocumentProxy; ratio: number }
  | { phase: "failed" };

export function PdfViewer({ src, title }: { src: string; title: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    // Held so leaving the page stops the download and the worker, whether
    // or not the document has finished opening.
    let task: PDFDocumentLoadingTask | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url
        ).toString();

        task = pdfjs.getDocument({
          url: src,
          // XFA forms are an interactive format of their own; draw the page.
          enableXfa: false,
          // The optional WebAssembly decoders are fetched from a URL this app
          // does not serve; the JavaScript ones read the same images.
          useWasm: false,
        });
        const doc = await task.promise;

        // Every page starts at the first page's shape, so the column does
        // not jump while the rest load; each corrects itself when drawn.
        const first = await doc.getPage(1);
        const { width, height } = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setState({ phase: "ready", doc, ratio: height / width });
      } catch (error) {
        if (cancelled) return;
        console.error("[pdf] could not open", error);
        setState({ phase: "failed" });
      }
    })();

    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [src]);

  if (state.phase === "failed") {
    return (
      <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        This PDF can&apos;t be shown here. Open it full screen or download it instead.
      </p>
    );
  }

  if (state.phase === "loading") {
    return (
      <div
        role="status"
        className="flex aspect-[1/1.414] w-full items-center justify-center rounded-lg border border-border bg-card text-sm text-muted-foreground"
      >
        Loading the PDF…
      </div>
    );
  }

  const pages = state.doc.numPages;
  return (
    <section aria-label={`${title}, ${pages} ${pages === 1 ? "page" : "pages"}`} className="space-y-3">
      {Array.from({ length: pages }, (_, i) => (
        <PdfPage key={i} doc={state.doc} number={i + 1} of={pages} ratio={state.ratio} title={title} />
      ))}
    </section>
  );
}

function PdfPage({
  doc,
  number,
  of,
  ratio: initialRatio,
  title,
}: {
  doc: PDFDocumentProxy;
  number: number;
  of: number;
  ratio: number;
  title: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ratio, setRatio] = useState(initialRatio);
  const [near, setNear] = useState(number <= 2);

  // Start drawing a little before the page scrolls into view.
  useEffect(() => {
    if (near || !box.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(box.current);
    return () => observer.disconnect();
  }, [near]);

  useEffect(() => {
    if (!near || !canvas.current || !box.current) return;
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const page = await doc.getPage(number);
        if (cancelled || !canvas.current || !box.current) return;

        const natural = page.getViewport({ scale: 1 });
        setRatio(natural.height / natural.width);

        // Sharp on a high-density screen without drawing a phone-sized page
        // at desktop-print resolution: at most twice the CSS width.
        const density = Math.min(window.devicePixelRatio || 1, 2);
        const scale = (box.current.clientWidth * density) / natural.width;
        const viewport = page.getViewport({ scale });

        canvas.current.width = Math.floor(viewport.width);
        canvas.current.height = Math.floor(viewport.height);
        task = page.render({ canvas: canvas.current, viewport });
        await task.promise;
      } catch (error) {
        // Cancelling a render on unmount rejects its promise; that is not a
        // failure worth reporting.
        if (!cancelled) console.error(`[pdf] page ${number} did not draw`, error);
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [near, doc, number]);

  return (
    <div
      ref={box}
      className="overflow-hidden rounded-lg border border-border bg-white"
      style={{ aspectRatio: `1 / ${ratio}` }}
    >
      <canvas
        ref={canvas}
        role="img"
        aria-label={`${title}, page ${number} of ${of}`}
        className="block h-full w-full"
      />
    </div>
  );
}
