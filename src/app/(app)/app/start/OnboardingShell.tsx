import Image from "next/image";
import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import {
  ONBOARDING_STEPS,
  ONBOARDING_TOTAL,
  stepNumber,
  type StartScreen,
} from "@/lib/onboarding-steps";
import { skipAction } from "./actions";

/**
 * The onboarding's frame: the landing page's two materials, used for the same
 * argument. On the ink side sits the code being made, on a paper tile like a
 * printed label; on the paper side, one question at a time.
 *
 * The code is the progress indicator. It starts as an outline that cannot be
 * scanned, takes on the colour as it is picked, and becomes the real symbol
 * the moment it is made. The step counter beside the question says the rest.
 *
 * No sidebar: until the first code exists there is nothing in it to go to,
 * and every way out of the flow but "Skip to dashboard" is a place to stop.
 */
export function OnboardingShell({
  screen,
  heading,
  lede,
  specimen,
  caption,
  back,
  children,
}: {
  screen: StartScreen;
  heading: string;
  lede?: React.ReactNode;
  /** The symbol, or its outline before the code exists. */
  specimen: React.ReactNode;
  /** One line under the specimen: where the code leads. */
  caption?: React.ReactNode;
  back?: { href: string; label: string } | null;
  children: React.ReactNode;
}) {
  const current = stepNumber(screen);

  return (
    <div className="dash min-h-dvh lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,32rem)_minmax(0,1fr)]">
      <aside
        aria-label="Your code"
        className="flex items-center gap-4 bg-[var(--field)] px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-[var(--field-ink)] lg:sticky lg:top-0 lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:p-10"
      >
        <Link href="/" aria-label={PRODUCT_NAME} className="hidden shrink-0 lg:inline-flex">
          <Image
            src="/brand/qriate-wordmark-light.svg"
            alt={PRODUCT_NAME}
            width={104}
            height={43}
            className="h-auto w-[104px]"
          />
        </Link>

        <figure className="flex min-w-0 flex-1 items-center gap-4 lg:flex-col lg:justify-center lg:gap-6">
          {/*
            Paper on ink: the code always sits on its own light ground, as it
            will on the label, so a dark colour never sinks into the panel.
          */}
          <div className="w-16 shrink-0 rounded-md bg-white p-1.5 shadow-[0_1px_0_oklch(1_0_0/0.06)_inset] sm:w-20 lg:w-full lg:max-w-[18rem] lg:rounded-xl lg:p-6">
            {specimen}
          </div>
          {caption ? (
            <figcaption className="min-w-0 text-sm leading-snug text-[var(--field-soft)] lg:max-w-[18rem] lg:text-center">
              {caption}
            </figcaption>
          ) : null}
        </figure>
      </aside>

      <main className="flex min-h-[calc(100dvh-6rem)] flex-col bg-[var(--paper)] px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-10 lg:min-h-dvh lg:px-16 lg:pt-10">
        <div className="flex items-center justify-between gap-4">
          <Progress current={current} />
          <form action={skipAction}>
            <input type="hidden" name="screen" value={screen} />
            <button
              type="submit"
              className="-mr-2 min-h-11 rounded-md px-2 text-sm text-[var(--paper-soft)] underline-offset-4 transition-colors duration-150 hover:text-[var(--paper-ink)] hover:underline"
            >
              Skip to dashboard
            </button>
          </form>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-col py-7 sm:py-10 lg:mx-0 lg:flex-1 lg:justify-center lg:py-16">
          {back ? (
            <Link
              href={back.href}
              className="mb-6 inline-flex min-h-11 items-center gap-1.5 self-start text-sm text-[var(--paper-soft)] transition-colors duration-150 hover:text-[var(--paper-ink)]"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M10 3 5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {back.label}
            </Link>
          ) : null}

          <h1 className="font-sarlotte text-[2.25rem] leading-[1.05] tracking-[-0.015em] text-balance sm:text-[2.75rem]">
            {heading}
          </h1>
          {lede ? (
            <div className="mt-3 max-w-[52ch] text-base leading-relaxed text-[var(--paper-soft)]">
              {lede}
            </div>
          ) : null}

          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}

/**
 * Where the person is, as a row of modules: filled for a step done, the
 * current one in the accent, the rest outlined. The steps really are a
 * sequence, which is what earns the numbering.
 */
function Progress({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-3">
      <ol aria-hidden className="flex gap-1">
        {ONBOARDING_STEPS.map((step, index) => {
          const n = index + 1;
          const tone =
            n < current
              ? "bg-[var(--paper-ink)] border-[var(--paper-ink)]"
              : n === current
                ? "bg-[var(--pin-ink)] border-[var(--pin-ink)]"
                : "bg-transparent border-[var(--paper-rule)]";
          return <li key={step.screen} className={`size-2.5 rounded-[2px] border ${tone}`} />;
        })}
      </ol>
      <p className="dash-num text-sm text-[var(--paper-soft)]">
        Step {current} of {ONBOARDING_TOTAL}
      </p>
    </div>
  );
}
