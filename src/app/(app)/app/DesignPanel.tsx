"use client";

import { useState } from "react";
import {
  CORNER_DOTS,
  CORNER_FRAMES,
  QR_PATTERNS,
  QR_FRAMES,
  MAX_FRAME_TEXT,
  frameTextDrawable,
  type QrFrame,
  checkQrStyle,
  weakestContrast,
  type CornerDot,
  type CornerFrame,
  type QrPattern,
  type QrStyle,
} from "@/lib/qr-style";
import { QUIET_ZONE, composeArtwork, inksFor, qrArtwork, type QrMatrix } from "@/lib/qr-artwork";
import type { PresetLogoId } from "@/lib/preset-logos";
import { QrArtworkSvg } from "@/components/QrArtworkSvg";

/**
 * Designing a code's artwork: its pattern, its corner squares and its
 * colours, with a live preview.
 *
 * Shared by code creation and a code's own page, so both offer the same
 * choices with the same checks. The preview draws from a module matrix the
 * server encoded, with the same `qrArtwork` the download uses, so the browser
 * runs no QR encoder and the preview cannot differ from the file.
 *
 * Every combination offered here is decoded by a real QR reader in the test
 * suite. The colour check below is the one the server runs again on save.
 */

const PATTERN_LABELS: Record<QrPattern, string> = {
  square: "Square",
  dots: "Dots",
  rounded: "Rounded",
  "extra-rounded": "Extra rounded",
  classy: "Classy",
  "classy-rounded": "Classy rounded",
};

const FRAME_LABELS: Record<CornerFrame, string> = {
  auto: "Match the pattern",
  square: "Square",
  rounded: "Rounded",
  circle: "Circle",
};

const FRAME_NAMES: Record<QrFrame, string> = {
  none: "No frame",
  box: "Box",
  "banner-below": "Banner below",
  "banner-above": "Banner above",
  bubble: "Speech bubble",
  tag: "Tag",
  corners: "Corners",
  pill: "Pill",
};

const DOT_LABELS: Record<CornerDot, string> = {
  auto: "Match the pattern",
  square: "Square",
  dot: "Dot",
};

/** The code as it will print, frame and logo included. */
export function DesignPreview({
  matrix,
  style,
  logoUrl,
  presetLogo,
  px,
  title,
  className,
}: {
  matrix: QrMatrix;
  style: QrStyle;
  logoUrl?: string | null;
  presetLogo?: PresetLogoId | null;
  px: number;
  title: string;
  className?: string;
}) {
  const art = qrArtwork(matrix, style, inksFor(style), presetLogo ?? Boolean(logoUrl));
  const { frame } = composeArtwork(art, style);
  return (
    <div
      className={`rounded-lg border border-[var(--paper-rule)] p-6 ${style.transparent ? "qr-checker" : "bg-white"}`}
    >
      <QrArtworkSvg art={art} frame={frame} px={px} title={title} logoUrl={logoUrl} className={className} />
    </div>
  );
}

const tileClass = (selected: boolean) =>
  `flex h-16 w-16 items-center justify-center rounded-md border bg-white transition-colors duration-150 ${
    selected
      ? "border-[var(--pin-ink)] ring-2 ring-[var(--pin-ink)]/30"
      : "border-[var(--paper-rule)] hover:border-[var(--paper-ink)]"
  }`;

/**
 * The pickers and colour fields. Controlled: the owner of `style` decides
 * whether a change is saved at once, posted with a create form, or previewed.
 */
export function DesignFields({
  style,
  onChange,
  matrix,
  idPrefix,
}: {
  style: QrStyle;
  onChange: (style: QrStyle) => void;
  matrix: QrMatrix;
  /** Keeps field ids unique if two panels share a page. */
  idPrefix: string;
}) {
  const set = (change: Partial<QrStyle>) => onChange({ ...style, ...change });
  const check = checkQrStyle(style);
  const swapped = { ...style, dark: style.light, light: style.dark };
  const canSwap = checkQrStyle(swapped).ok;
  const message = check.ok
    ? `Lowest contrast ${weakestContrast(style).toFixed(1)}:1. This will scan once printed.`
    : check.reason;

  // The picker tiles are drawn in the owner's colours, so each shows exactly
  // what choosing it would print.
  const tileInks = inksFor({ ...style, transparent: false });
  const corner = `${QUIET_ZONE - 0.5} ${QUIET_ZONE - 0.5} 8 8`;

  const textOk = frameTextDrawable(style.frameText) && style.frameText.trim().length > 0;

  return (
    <div className="space-y-7">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Frame</legend>
        <div className="flex flex-wrap gap-2">
          {QR_FRAMES.map((frame) => {
            const tileStyle = { ...style, frame, transparent: false };
            const art = qrArtwork(matrix, tileStyle, tileInks);
            return (
              <button
                key={frame}
                type="button"
                aria-pressed={style.frame === frame}
                title={FRAME_NAMES[frame]}
                onClick={() => set({ frame })}
                className={tileClass(style.frame === frame)}
              >
                {frame === "none" ? (
                  <span className="px-1 text-center text-[11px] leading-tight text-[var(--paper-soft)]">None</span>
                ) : (
                  <QrArtworkSvg
                    art={art}
                    frame={composeArtwork(art, tileStyle).frame}
                    px={40}
                    title={FRAME_NAMES[frame]}
                    className="max-h-14 w-auto"
                  />
                )}
              </button>
            );
          })}
        </div>
        {style.frame !== "none" ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${idPrefix}-frame-text`} className="mb-1 block text-sm">
                Frame text
              </label>
              <input
                id={`${idPrefix}-frame-text`}
                type="text"
                value={style.frameText}
                maxLength={MAX_FRAME_TEXT}
                onChange={(event) => set({ frameText: event.target.value })}
                className="w-full rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm"
              />
              <p className={`mt-1 text-xs ${textOk ? "text-[var(--paper-soft)]" : "text-[var(--struck-ink)]"}`}>
                {textOk
                  ? `${style.frameText.length} of ${MAX_FRAME_TEXT}. A short call to action reads best, like “See our menu”.`
                  : "Letters, numbers and common punctuation only, and not empty."}
              </p>
            </div>
            <ColourField
              id={`${idPrefix}-frame-colour`}
              label="Frame colour"
              value={style.frameColor ?? style.dark}
              inherited={style.frameColor === null}
              onChange={(frameColor) => set({ frameColor })}
              onReset={() => set({ frameColor: null })}
            />
          </div>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Pattern</legend>
        <div className="flex flex-wrap gap-2">
          {QR_PATTERNS.map((pattern) => (
            <button
              key={pattern}
              type="button"
              aria-pressed={style.pattern === pattern}
              title={PATTERN_LABELS[pattern]}
              onClick={() => set({ pattern })}
              className={tileClass(style.pattern === pattern)}
            >
              <QrArtworkSvg
                art={qrArtwork(matrix, { ...style, pattern }, tileInks)}
                px={48}
                title={PATTERN_LABELS[pattern]}
                viewBox={`${QUIET_ZONE + 8} ${QUIET_ZONE + 8} 8 8`}
              />
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Corner frames</legend>
          <div className="flex flex-wrap gap-2">
            {CORNER_FRAMES.map((cornerFrame) => (
              <button
                key={cornerFrame}
                type="button"
                aria-pressed={style.cornerFrame === cornerFrame}
                title={FRAME_LABELS[cornerFrame]}
                onClick={() => set({ cornerFrame })}
                className={tileClass(style.cornerFrame === cornerFrame)}
              >
                {cornerFrame === "auto" ? (
                  <span className="px-1 text-center text-[11px] leading-tight text-[var(--paper-soft)]">Match</span>
                ) : (
                  <QrArtworkSvg
                    art={qrArtwork(matrix, { ...style, cornerFrame }, tileInks)}
                    px={36}
                    title={FRAME_LABELS[cornerFrame]}
                    viewBox={corner}
                  />
                )}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Corner dots</legend>
          <div className="flex flex-wrap gap-2">
            {CORNER_DOTS.map((cornerDot) => (
              <button
                key={cornerDot}
                type="button"
                aria-pressed={style.cornerDot === cornerDot}
                title={DOT_LABELS[cornerDot]}
                onClick={() => set({ cornerDot })}
                className={tileClass(style.cornerDot === cornerDot)}
              >
                {cornerDot === "auto" ? (
                  <span className="px-1 text-center text-[11px] leading-tight text-[var(--paper-soft)]">Match</span>
                ) : (
                  <QrArtworkSvg
                    art={qrArtwork(matrix, { ...style, cornerDot }, tileInks)}
                    px={36}
                    title={DOT_LABELS[cornerDot]}
                    viewBox={corner}
                  />
                )}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <fieldset className="rounded-lg border border-[var(--paper-rule)] bg-[var(--paper-raised)] p-4">
        <legend className="sr-only">Colours</legend>
        <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <ColourField id={`${idPrefix}-dark`} label="Dot colour" value={style.dark} onChange={(dark) => set({ dark })} />
          <SwapButton
            disabled={!canSwap}
            title={canSwap ? "Swap dot and background colours" : "Swapped, the code would be light on dark, which many scanners cannot read"}
            onClick={() => onChange(swapped)}
          />
          <ColourField
            id={`${idPrefix}-light`}
            label="Background colour"
            value={style.light}
            onChange={(light) => set({ light })}
          />
        </div>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={style.transparent}
            onChange={(event) => set({ transparent: event.target.checked })}
            className="mt-0.5"
          />
          <span>
            Transparent background
            {style.transparent ? (
              <span className="block text-xs leading-relaxed text-[var(--pending-ink)]">
                Downloads leave the background out. Only print it on a surface as light as the background colour
                above: the contrast check assumes that colour, and a code on a dark or busy surface will not scan.
              </span>
            ) : null}
          </span>
        </label>

        <div className="mt-5 grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <ColourField
            id={`${idPrefix}-frame`}
            label="Corner frame colour"
            value={style.cornerFrameColor ?? style.dark}
            inherited={style.cornerFrameColor === null}
            onChange={(cornerFrameColor) => set({ cornerFrameColor })}
            onReset={() => set({ cornerFrameColor: null })}
          />
          <SwapButton
            title="Swap corner frame and corner dot colours"
            onClick={() => set({ cornerFrameColor: style.cornerDotColor, cornerDotColor: style.cornerFrameColor })}
          />
          <ColourField
            id={`${idPrefix}-eye`}
            label="Corner dot colour"
            value={style.cornerDotColor ?? style.dark}
            inherited={style.cornerDotColor === null}
            onChange={(cornerDotColor) => set({ cornerDotColor })}
            onReset={() => set({ cornerDotColor: null })}
          />
        </div>
      </fieldset>

      {/*
        The live region persists so screen readers keep announcing it; the
        line inside is keyed on its text, so each change inserts a new node
        rather than editing one in place. Safari, with its colour panel open,
        repainted the recoloured preview but left an edited text node showing
        the old message.
      */}
      <div aria-live="polite">
        <p
          key={message}
          className={`text-xs leading-relaxed ${check.ok ? "text-[var(--paper-soft)]" : "text-[var(--struck-ink)]"}`}
        >
          {message}
        </p>
      </div>
    </div>
  );
}

function SwapButton({ title, disabled, onClick }: { title: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className="mb-1 inline-flex h-9 w-9 items-center justify-center self-end justify-self-center rounded-md text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)] disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M4 7h11l-3-3M16 13H5l3 3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * A colour as a swatch and as hex, kept in step. Typing commits as soon as
 * the text is a full six-digit colour, so a half-typed value never reaches
 * the preview or the contrast check.
 */
function ColourField({
  id,
  label,
  value,
  onChange,
  inherited = false,
  onReset,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Drawn in the code colour because nothing else was chosen. */
  inherited?: boolean;
  onReset?: () => void;
}) {
  // The text follows the colour whenever it changes from outside (the swatch,
  // a swap, a reset), adjusted during render as React recommends rather than
  // in an effect, which would paint the stale text for a frame first.
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    setText(value);
  }

  return (
    <div>
      <label htmlFor={id} className="mb-1 flex items-baseline justify-between gap-2 text-sm">
        <span>{label}</span>
        {onReset && !inherited ? (
          <button type="button" onClick={onReset} className="text-xs text-[var(--paper-soft)] hover:text-[var(--paper-ink)]">
            Use dot colour
          </button>
        ) : inherited ? (
          <span className="text-xs text-[var(--paper-soft)]">same as dots</span>
        ) : null}
      </label>
      <div className="flex items-center gap-2 rounded-md border border-[var(--paper-rule)] bg-white px-2 py-1.5">
        <input
          id={id}
          type="text"
          value={text}
          maxLength={7}
          spellCheck={false}
          autoCapitalize="characters"
          onChange={(event) => {
            setText(event.target.value);
            const match = HEX.exec(event.target.value.trim());
            if (match) onChange(`#${match[1].toUpperCase()}`);
          }}
          onBlur={() => setText(value)}
          className="dash-num min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
        />
        <input
          type="color"
          aria-label={`${label} picker`}
          value={value.toLowerCase()}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          className="h-7 w-8 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0"
        />
      </div>
    </div>
  );
}

