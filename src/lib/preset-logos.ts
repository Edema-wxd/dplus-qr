import { PRESET_LOGO_DATA } from "@/lib/design-assets.generated";

/**
 * Ready-made logo marks an owner can put in the middle of a code instead of
 * uploading their own: the platforms in the reference design (Francis, 27 Oct
 * 2026), drawn from Simple Icons. X stands in for the Twitter bird and a
 * plain envelope for Outlook, because both owners had their marks withdrawn
 * from Simple Icons.
 *
 * The marks are their owners' trademarks. They are offered as a convenience
 * for linking to an owner's own presence on that platform; misuse of one on a
 * phishing code is handled like any other abuse, by blocking the code.
 *
 * Stored as `presetLogo` inside `qr_codes.style`, but read separately from
 * the design: the logo form owns it, so saving the design panel can never
 * change a logo choice, nor the logo form a design.
 */

export type PresetLogoId = keyof typeof PRESET_LOGO_DATA;

/** In the order the picker shows them, as in the reference design. */
export const PRESET_LOGOS: readonly PresetLogoId[] = [
  "x",
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "pinterest",
  "email",
  "apple",
  "gmail",
  "whatsapp",
  "facebook",
  "netflix",
];

export function isPresetLogo(value: unknown): value is PresetLogoId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PRESET_LOGO_DATA, value);
}

export function presetLogo(id: PresetLogoId): { label: string; hex: string; path: string } {
  return PRESET_LOGO_DATA[id];
}

/** The preset a stored style names, or null. Anything unknown reads as none. */
export function readPresetLogo(stored: unknown): PresetLogoId | null {
  if (!stored || typeof stored !== "object") return null;
  const value = (stored as Record<string, unknown>).presetLogo;
  return isPresetLogo(value) ? value : null;
}

/**
 * How the logo picker posts a choice in one field: "" for none, a numeric id
 * for an uploaded logo, or `preset:<id>`.
 */
export type LogoChoice = { kind: "none" } | { kind: "upload"; id: string } | { kind: "preset"; id: PresetLogoId };

export const PRESET_PREFIX = "preset:";

export function parseLogoChoice(raw: string): LogoChoice | null {
  if (raw === "") return { kind: "none" };
  if (raw.startsWith(PRESET_PREFIX)) {
    const id = raw.slice(PRESET_PREFIX.length);
    return isPresetLogo(id) ? { kind: "preset", id } : null;
  }
  return /^[1-9]\d{0,18}$/.test(raw) ? { kind: "upload", id: raw } : null;
}
