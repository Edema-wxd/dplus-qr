import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { CODE_HOST, codeUrl } from "@/lib/brand";
import { listCodes, getCode, type OwnedCode } from "@/lib/user-codes";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";
import { qrStyleVars } from "@/lib/qr-style";
import {
  getOnboarding,
  latestTestScan,
  progressOf,
  startOnboarding,
  type OnboardingState,
} from "@/lib/onboarding";
import {
  describeScan,
  previousScreen,
  PURPOSES,
  screenFor,
  type Purpose,
  type StartScreen,
} from "@/lib/onboarding-steps";
import { QrSymbol } from "@/app/_landing/QrSymbol";
import { OnboardingShell } from "./OnboardingShell";
import { CodeOutline } from "./Specimen";
import { LinkStep } from "./LinkStep";
import { CreateStep, InkScope } from "./CreateStep";
import { ScanWatcher } from "./ScanWatcher";
import { choosePurposeAction } from "./actions";
import { obPrimaryClass, obSecondaryClass } from "./controls";

export const metadata: Metadata = { title: "Set up your first code" };

// Every screen is this account's own progress; there is no shell to stream.
export const instant = false;

const BACK_LABELS: Record<StartScreen, string> = {
  purpose: "Back",
  link: "What it is for",
  create: "Where it leads",
  download: "Back",
  scan: "Download",
};

/**
 * The first-code onboarding, from just after sign-up to a test scan.
 *
 * One route, with the screen in the URL (`?step=link`) the way `/app/new`
 * carries the code type: each screen is a plain form whose action saves the
 * step and redirects to the next, so it works before JavaScript has loaded,
 * a reload keeps the person where they were, and the back button behaves.
 * Which screens a person may open is decided by `screenFor`, from what they
 * have saved, never from the URL alone.
 */
export default async function StartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  const [params, codes] = await Promise.all([searchParams, listCodes(user.id)]);

  let state = await getOnboarding(user.id);
  if (!state) {
    // An account that never had one: sign-up's write failed, or it predates
    // the onboarding. An account that already has codes has no use for it.
    if (codes.length > 0) redirect("/app");
    await startOnboarding(user.id, "existing");
    state = await getOnboarding(user.id);
    if (!state) redirect("/app");
  }

  if (state.completedAt) redirect("/app");

  // The code this onboarding made. Gone (archived by staff, say) means there
  // is nothing left to walk through.
  const code = state.codeId ? await getCode(user.id, state.codeId) : null;
  if (state.codeId && !code) redirect("/app");
  // Codes made on the dashboard instead: the onboarding has nothing to add.
  if (!code && codes.length > 0) redirect("/app");

  const progress = progressOf(state);
  const screen = screenFor(params.step, progress);
  // A screen asked for but not offered lands on the real one, so the URL,
  // the counter and the back link all agree.
  if (typeof params.step === "string" && params.step !== screen) {
    redirect(`/app/start?step=${screen}`);
  }
  const previous = previousScreen(screen, progress);
  const back = previous
    ? { href: `/app/start?step=${previous}`, label: BACK_LABELS[screen] }
    : null;

  switch (screen) {
    case "purpose":
      return <PurposeScreen state={state} back={back} />;
    case "link":
      return (
        <OnboardingShell
          screen="link"
          heading="Where should a scan take people?"
          specimen={<CodeOutline className="block h-auto w-full" />}
          caption={<CaptionLine>Not made yet. Nothing to print until the next step.</CaptionLine>}
          back={back}
        >
          <LinkStep initial={state.draft} />
        </OnboardingShell>
      );
    case "create":
      return <CreateScreen userId={user.id} state={state} back={back} />;
    case "download":
    case "scan":
      // `screenFor` only offers these once the code exists.
      if (!code) redirect("/app/start");
      return screen === "download" ? (
        <DownloadScreen code={code} reveal={params.made === "1"} back={back} />
      ) : (
        <ScanScreen userId={user.id} code={code} back={back} />
      );
  }
}

/** Screen 2: one tap. Each tile is its own submit button. */
function PurposeScreen({
  state,
  back,
}: {
  state: OnboardingState;
  back: { href: string; label: string } | null;
}) {
  return (
    <OnboardingShell
      screen="purpose"
      heading="What will your first code go on?"
      lede="We will set it up to suit. You can make every other kind of code later."
      specimen={<CodeOutline className="block h-auto w-full" />}
      caption={<CaptionLine>Your code takes shape here as you set it up.</CaptionLine>}
      back={back}
    >
      <form action={choosePurposeAction}>
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {(Object.entries(PURPOSES) as [Purpose, (typeof PURPOSES)[Purpose]][]).map(
            ([value, option]) => {
              const chosen = state.purpose === value;
              return (
                <li key={value}>
                  <button
                    type="submit"
                    name="purpose"
                    value={value}
                    aria-pressed={chosen}
                    className={`flex min-h-14 w-full items-center rounded-lg border bg-white px-4 text-left text-base text-[var(--paper-ink)] transition-[border-color,transform] duration-150 ease-[var(--ease-out)] hover:border-[var(--paper-ink)] active:scale-[0.98] ${
                      chosen ? "border-[var(--paper-ink)] shadow-[0_0_0_1px_var(--paper-ink)]" : "border-[var(--paper-rule)]"
                    }`}
                  >
                    {option.label}
                  </button>
                </li>
              );
            }
          )}
        </ul>
      </form>
    </OnboardingShell>
  );
}

/** Screen 4: the colour picked here previews on the outline beside it. */
async function CreateScreen({
  userId,
  state,
  back,
}: {
  userId: string;
  state: OnboardingState;
  back: { href: string; label: string } | null;
}) {
  const library = await listLogos(userId);
  const suggested = state.purpose ? PURPOSES[state.purpose].codeName : "My first code";

  return (
    <InkScope>
      <OnboardingShell
        screen="create"
        heading="Name it and make it yours"
        specimen={<CodeOutline className="block h-auto w-full" />}
        caption={state.draft ? <LeadsTo destination={state.draft.destination} /> : null}
        back={back}
      >
        <CreateStep
          suggestedName={suggested}
          logos={library.map(({ id, url, name }) => ({ id, url, name }))}
          uploads={uploadsEnabled()}
        />
      </OnboardingShell>
    </InkScope>
  );
}

/** The real symbol, in the code's own colours. */
function CodeArt({ code, reveal, px }: { code: OwnedCode; reveal?: boolean; px: number }) {
  return (
    <div style={qrStyleVars(code.style) as React.CSSProperties} className={reveal ? "ob-reveal" : undefined}>
      <QrSymbol
        value={codeUrl(code.shortCode)}
        px={px}
        title={`QR code for ${code.name}`}
        logoUrl={code.logo?.url}
        className="block h-auto w-full"
      />
    </div>
  );
}

/** Screen 5. Optional: the next screen is one tap away either way. */
function DownloadScreen({
  code,
  reveal,
  back,
}: {
  code: OwnedCode;
  reveal: boolean;
  back: { href: string; label: string } | null;
}) {
  return (
    <OnboardingShell
      screen="download"
      heading="Your code is ready"
      lede={
        <p>
          It leads to <Destination url={code.destinationUrl} />. Download it for print: the
          link inside never changes, so print it as often as you like and re-point it any time.
        </p>
      }
      specimen={<CodeArt code={code} reveal={reveal} px={248} />}
      caption={<ShortLink shortCode={code.shortCode} />}
      back={back}
    >
      {/* On a phone the code beside the heading is a thumbnail; show it whole. */}
      <div className="mb-8 w-48 rounded-xl border border-[var(--paper-rule)] bg-white p-4 lg:hidden">
        <CodeArt code={code} reveal={reveal} px={176} />
      </div>
      <div className="flex flex-wrap gap-3">
        <a href={`/app/${code.id}/qr?format=svg`} download className={obPrimaryClass}>
          Download for print (SVG)
        </a>
        <a href={`/app/${code.id}/qr?format=png&size=2048`} download className={obSecondaryClass}>
          PNG image
        </a>
      </div>
      <p className="mt-3 max-w-[52ch] text-sm leading-relaxed text-[var(--paper-soft)]">
        SVG stays sharp at any size, which is what a printer wants. PNG is for
        sharing on a screen.
      </p>

      <Link
        href="/app/start?step=scan"
        className="mt-10 inline-flex min-h-11 items-center gap-1.5 text-base font-medium text-[var(--paper-ink)] underline underline-offset-4"
      >
        Next: test it with your phone
      </Link>
    </OnboardingShell>
  );
}

/** Screen 6: scan it, and see the scan arrive. */
async function ScanScreen({
  userId,
  code,
  back,
}: {
  userId: string;
  code: OwnedCode;
  back: { href: string; label: string } | null;
}) {
  // A scan made before this screen opened (from the printed proof, say)
  // counts: the screen opens on it rather than waiting for another.
  const scan = await latestTestScan(userId).catch(() => null);

  return (
    <OnboardingShell
      screen="scan"
      heading="Scan it with your phone"
      lede={
        <>
          <p>
            Point your phone&apos;s camera at the code. It should open{" "}
            <Destination url={code.destinationUrl} />.
          </p>
          <p className="mt-2">
            On your phone already? Open{" "}
            {/*
              Relative on purpose: it goes through this deployment's own
              redirect, so the test counts wherever this page is served.
            */}
            <a
              href={`/${code.shortCode}`}
              target="_blank"
              rel="noopener"
              className="dash-num font-mono text-[0.92em] text-[var(--paper-ink)] underline underline-offset-4"
            >
              {CODE_HOST}/{code.shortCode}
            </a>{" "}
            instead.
          </p>
        </>
      }
      specimen={<CodeArt code={code} px={248} />}
      caption={<ShortLink shortCode={code.shortCode} />}
      back={back}
    >
      {/* On a phone the code beside the heading is a thumbnail, too small to scan from. */}
      <div className="mb-8 w-48 rounded-xl border border-[var(--paper-rule)] bg-white p-4 lg:hidden">
        <CodeArt code={code} px={176} />
      </div>
      <ScanWatcher
        initial={scan ? { at: scan.scannedAt.toISOString(), where: describeScan(scan) } : null}
      />
    </OnboardingShell>
  );
}

function CaptionLine({ children }: { children: React.ReactNode }) {
  return <span className="block">{children}</span>;
}

function LeadsTo({ destination }: { destination: string }) {
  return (
    <span className="block">
      Leads to{" "}
      <span className="block truncate font-mono text-xs text-[var(--field-ink)] lg:mt-1">
        {destination}
      </span>
    </span>
  );
}

function ShortLink({ shortCode }: { shortCode: string }) {
  return (
    <span className="dash-num block truncate font-mono text-xs text-[var(--field-ink)]">
      {CODE_HOST}/{shortCode}
    </span>
  );
}

/** A destination as a person reads it: no scheme, no trailing slash. */
function Destination({ url }: { url: string }) {
  const shown = url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  return <span className="font-mono text-[0.92em] text-[var(--paper-ink)] [overflow-wrap:anywhere]">{shown}</span>;
}
