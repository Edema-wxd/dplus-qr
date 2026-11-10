/**
 * The first-code onboarding: its screens, in order, and the rules for moving
 * between them.
 *
 * Pure, and safe for browser code. Reads and writes are in `onboarding.ts`,
 * which imports the database driver; keeping the two apart is what keeps
 * `pg` out of the screens' client bundles, the same split as
 * `pricing-content.ts` and `site-content.ts`.
 *
 * **Seven steps at most, from sign-up to a first code.** That is a product
 * rule (Francis, 6 Nov 2026), and `onboarding.test.ts` fails if this list
 * grows past it. Every screen added costs people; one that cannot justify
 * itself against that does not go in.
 */

/** What each step records the first time an account reaches it. */
export const ONBOARDING_EVENTS = [
  "account_created",
  "purpose_chosen",
  "destination_set",
  "code_created",
  "artwork_downloaded",
  "test_scanned",
  "completed",
] as const;

export type OnboardingEvent = (typeof ONBOARDING_EVENTS)[number];

export const MAX_ONBOARDING_STEPS = 7;

/**
 * The steps a person sees. `event` is what finishing the step records.
 *
 * Step 1 is the sign-up form itself, so `/app/start` begins at step 2 and its
 * counter says so: the person has already done one.
 */
export const ONBOARDING_STEPS = [
  { screen: "account", event: "account_created", label: "Create an account" },
  { screen: "purpose", event: "purpose_chosen", label: "What it is for" },
  { screen: "link", event: "destination_set", label: "Where it leads" },
  { screen: "create", event: "code_created", label: "Name and create" },
  { screen: "download", event: "artwork_downloaded", label: "Download" },
  { screen: "scan", event: "test_scanned", label: "Test scan" },
] as const satisfies readonly { screen: string; event: OnboardingEvent; label: string }[];

export type OnboardingScreen = (typeof ONBOARDING_STEPS)[number]["screen"];

/** The screens `/app/start` can show; the sign-up form is not one of them. */
export type StartScreen = Exclude<OnboardingScreen, "account">;

export const ONBOARDING_TOTAL = ONBOARDING_STEPS.length;

export function stepNumber(screen: OnboardingScreen): number {
  return ONBOARDING_STEPS.findIndex((step) => step.screen === screen) + 1;
}

export function isStartScreen(value: unknown): value is StartScreen {
  return (
    typeof value === "string" &&
    value !== "account" &&
    ONBOARDING_STEPS.some((step) => step.screen === value)
  );
}

/**
 * What the person said the code is for. Asked once, in one tap; it names the
 * code and tells staff what people make codes for.
 */
export const PURPOSES = {
  packaging: { label: "Packaging or a label", codeName: "Packaging label" },
  print: { label: "A flyer or poster", codeName: "Flyer" },
  card: { label: "A business card", codeName: "Business card" },
  venue: { label: "A shop, table or counter", codeName: "Counter sign" },
  event: { label: "An event", codeName: "Event" },
  other: { label: "Something else", codeName: "My first code" },
} as const;

export type Purpose = keyof typeof PURPOSES;

/**
 * Colours a first code can take in one tap. Each is dark enough on white to
 * pass the 4.5:1 floor every saved style must meet (`onboarding.test.ts`
 * checks them against `checkQrStyle`); any other colour is on the code's own
 * page, with the contrast check beside it. The first is `DEFAULT_QR_STYLE`'s.
 */
export const FIRST_CODE_INKS = [
  { name: "Black", dark: "#1A1A1A" },
  { name: "Navy", dark: "#1B3A6B" },
  { name: "Forest", dark: "#1E5A3A" },
  { name: "Plum", dark: "#5B2A5E" },
  { name: "Oxblood", dark: "#7A1F2B" },
  { name: "Cocoa", dark: "#4A3426" },
] as const;

export function isPurpose(value: unknown): value is Purpose {
  return typeof value === "string" && Object.hasOwn(PURPOSES, value);
}

export type OnboardingProgress = {
  reached: ReadonlySet<OnboardingEvent>;
  /** Present once the code has been made, so later screens can show it. */
  hasCode: boolean;
  hasDraft: boolean;
};

/**
 * Where someone picks up: the first screen they have not finished.
 *
 * Downloading is optional, so once a code exists the next screen is the scan
 * whether or not they downloaded.
 */
export function resumeScreen(progress: OnboardingProgress): StartScreen {
  if (progress.hasCode) {
    return progress.reached.has("artwork_downloaded") || progress.reached.has("test_scanned")
      ? "scan"
      : "download";
  }
  if (progress.hasDraft && progress.reached.has("destination_set")) return "create";
  if (progress.reached.has("purpose_chosen")) return "link";
  return "purpose";
}

/**
 * The screen to show for a request, given how far the person has got.
 *
 * Going back is allowed up to the code: once it exists, the screens before it
 * would make a second one, so they lead forward instead. Skipping ahead past
 * what has been filled in is not, because the screen would have nothing to
 * work with.
 */
export function screenFor(requested: unknown, progress: OnboardingProgress): StartScreen {
  const resume = resumeScreen(progress);
  if (!isStartScreen(requested)) return resume;

  if (progress.hasCode) {
    return requested === "download" || requested === "scan" ? requested : resume;
  }
  return stepNumber(requested) <= stepNumber(resume) ? requested : resume;
}

/** The screen before this one, for the back link, or null on the first. */
export function previousScreen(screen: StartScreen, progress: OnboardingProgress): StartScreen | null {
  if (screen === "purpose") return null;
  // After the code exists there is no going back to the screens that make it.
  if (progress.hasCode && (screen === "download" || screen === "scan")) {
    return screen === "scan" ? "download" : null;
  }
  const index = stepNumber(screen) - 1;
  const previous = ONBOARDING_STEPS[index - 1]?.screen;
  return isStartScreen(previous) ? previous : null;
}

/**
 * Whether opening the dashboard should send someone to the onboarding.
 *
 * Only an account with no codes that has neither finished nor skipped. Once
 * someone skips they are never sent back; the empty dashboard offers a link
 * instead. An account with codes never sees it, however it got them, and
 * nor does one whose onboarding code has since gone.
 */
export function shouldOnboard(
  codeCount: number,
  state: { skippedAt: Date | null; completedAt: Date | null; codeId: string | null } | null
): boolean {
  if (codeCount > 0) return false;
  if (!state) return true;
  // The onboarding already made its code and the account now has none: that
  // code is gone (archived by staff, say). `/app/start` sends anyone whose
  // code is gone back to `/app`, so sending them there again would loop.
  if (state.codeId !== null) return false;
  return state.skippedAt === null && state.completedAt === null;
}

export type FunnelStep = {
  event: OnboardingEvent;
  label: string;
  reached: number;
  /** Of everyone who signed up in the window, 0 to 1. */
  ofStart: number;
  /**
   * Of those who reached the step it follows from, 0 to 1. Null on the
   * first. Scanning and finishing follow from making the code, because the
   * download between them is optional.
   */
  ofPrevious: number | null;
  /** Median seconds from the previous step reached to this one. */
  medianSeconds: number | null;
  /** Who skipped to the dashboard from this step's screen. */
  skippedHere: number;
};

/** Labels for the funnel, including `completed`, which has no screen. */
export const EVENT_LABELS: Record<OnboardingEvent, string> = {
  account_created: "Created an account",
  purpose_chosen: "Said what it is for",
  destination_set: "Chose where it leads",
  code_created: "Made the code",
  artwork_downloaded: "Downloaded the artwork",
  test_scanned: "Scanned it",
  completed: "Finished",
};

/**
 * The step each step is measured against. Downloading is optional, so
 * scanning and finishing are measured against making the code, not against
 * the download that came before them on screen.
 */
const MEASURED_FROM: Partial<Record<OnboardingEvent, OnboardingEvent>> = {
  purpose_chosen: "account_created",
  destination_set: "purpose_chosen",
  code_created: "destination_set",
  artwork_downloaded: "code_created",
  test_scanned: "code_created",
  completed: "code_created",
};

/**
 * Fold per-step counts into the funnel table. Every event is listed, reached
 * or not, so a step nobody reached shows as zero rather than vanishing.
 */
export function buildFunnel(
  counts: Partial<Record<OnboardingEvent, { reached: number; medianSeconds: number | null }>>,
  skips: Partial<Record<string, number>>
): FunnelStep[] {
  const start = counts.account_created?.reached ?? 0;

  return ONBOARDING_EVENTS.map((event) => {
    const reached = counts[event]?.reached ?? 0;
    const from = MEASURED_FROM[event];
    const previous = from ? (counts[from]?.reached ?? 0) : null;
    const screen = ONBOARDING_STEPS.find((step) => step.event === event)?.screen;
    return {
      event,
      label: EVENT_LABELS[event],
      reached,
      ofStart: start > 0 ? reached / start : 0,
      ofPrevious: previous === null ? null : previous > 0 ? reached / previous : 0,
      medianSeconds: event === "account_created" ? null : (counts[event]?.medianSeconds ?? null),
      skippedHere: screen ? (skips[screen] ?? 0) : 0,
    };
  });
}

/** "40 s", "3 min", "2 h", "4 days": a duration a person reads at a glance. */
export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "–";
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))} s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400 * 2) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} days`;
}

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/**
 * A scan as a phrase for the test-scan screen: "on an iPhone in Ikeja,
 * Nigeria". Built only from what a scan already records (device, OS, city,
 * country), and each part is left out when it was not recorded, so the
 * sentence is never padded with "unknown".
 */
export function describeScan(scan: {
  deviceType: string | null;
  os: string | null;
  city: string | null;
  country: string | null;
}): string {
  const os = scan.os?.toLowerCase() ?? "";
  const type = scan.deviceType ?? "";
  let device = "";
  if (os === "ios") device = type === "tablet" ? "an iPad" : "an iPhone";
  else if (os === "android") device = type === "tablet" ? "an Android tablet" : "an Android phone";
  else if (type === "desktop") device = "a computer";
  else if (scan.os) device = scan.os;
  else if (type === "mobile") device = "a phone";

  let country: string | null = null;
  if (scan.country && /^[A-Z]{2}$/.test(scan.country)) {
    try {
      country = regionNames?.of(scan.country) ?? scan.country;
    } catch {
      country = scan.country;
    }
  }
  const place = [scan.city, country].filter(Boolean).join(", ");

  return [device ? `on ${device}` : "", place ? `in ${place}` : ""].filter(Boolean).join(" ");
}

/**
 * The path every finished onboarding takes. Downloading is left out because
 * it is optional: fewer downloads than codes is not people stopping.
 */
const REQUIRED_PATH: OnboardingEvent[] = [
  "account_created",
  "purpose_chosen",
  "destination_set",
  "code_created",
  "test_scanned",
];

export type Drop = {
  /** The step people failed to reach. */
  event: OnboardingEvent;
  /** The screen they stopped on, as the steps are labelled. */
  from: string;
  before: number;
  after: number;
  skipped: number;
};

/** Where the most people stopped, for the staff page's one-line summary. */
export function biggestDrop(steps: FunnelStep[]): Drop | null {
  const byEvent = new Map(steps.map((step) => [step.event, step]));
  let worst: Drop | null = null;

  for (let i = 1; i < REQUIRED_PATH.length; i += 1) {
    const before = byEvent.get(REQUIRED_PATH[i - 1])?.reached ?? 0;
    const step = byEvent.get(REQUIRED_PATH[i]);
    const after = step?.reached ?? 0;
    const screen = ONBOARDING_STEPS.find((s) => s.event === REQUIRED_PATH[i]);
    if (!screen || before - after <= 0) continue;
    if (!worst || before - after > worst.before - worst.after) {
      worst = {
        event: REQUIRED_PATH[i],
        from: screen.label,
        before,
        after,
        skipped: step?.skippedHere ?? 0,
      };
    }
  }
  return worst;
}
