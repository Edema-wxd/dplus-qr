import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import {
  canBulkCreate,
  canMakeHostedPages,
  canUploadVideo,
  canUseCustomCodes,
  getEntitlement,
} from "@/lib/entitlement";
import { listCodes } from "@/lib/user-codes";
import { listPublicPlans } from "@/lib/plans";
import { codesOffer, featureOffer } from "@/lib/upgrade-offers";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";
import {
  DYNAMIC_TYPES,
  STATIC_TYPES,
  dynamicType,
  isDynamicKind,
  isPageKind,
  isStaticKind,
  staticType,
} from "@/lib/qr-types";
import { DashShell } from "../DashShell";
import { TypeSection, UPLOAD_ONLY } from "./TypeSection";
import { CreateCodeForm } from "./CreateCodeForm";
import { StaticCodeForm } from "./StaticCodeForm";
import { LockIcon, LockedButton } from "../UpgradePrompt";
import type { UpgradeOffer } from "@/lib/upgrade-offers";

export const metadata: Metadata = { title: "New code" };

// The signed-in user's own plan and library decide what this page offers, so
// there is no static shell worth streaming around.
export const instant = false;

/**
 * Create a code: pick a type, then fill it in.
 *
 * The type lives in the URL (`?dynamic=menu`, `?static=wifi`), so the picker
 * is a page of plain links that works before any JavaScript has loaded, the
 * back button returns to the picker, and a chosen type survives a reload.
 *
 * Dynamic and static are shown as two families because the difference is the
 * one that matters after printing: a dynamic code can be edited, paused and
 * counted; a static one never changes and is never stored.
 */
export default async function NewCodePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const { data: session } = await auth.getSession();
  const user = session?.user;
  if (!user) redirect("/auth/sign-in");

  await ensureProfile({ id: user.id, email: user.email, name: user.name });

  const [params, codes, entitlement, library, plans] = await Promise.all([
    searchParams,
    listCodes(user.id),
    getEntitlement(user.id),
    listLogos(user.id),
    listPublicPlans(),
  ]);

  const atLimit = entitlement !== null && codes.length >= entitlement.maxCodes;
  const uploads = uploadsEnabled();
  const dynamic = typeof params.dynamic === "string" ? params.dynamic : null;
  const fixed = typeof params.static === "string" ? params.static : null;
  const back = { href: "/app/new", label: "All code types" };

  // Free makes link codes only. A page type is not offered (and not served as
  // a form by URL) on a plan without hosted pages; the server refuses it too.
  const pages = canMakeHostedPages(entitlement);
  const lockedPage = (kind: string) => !pages && isPageKind(kind);

  // What a locked card or field says when clicked, with the cheapest plan
  // that unlocks it read from the plan rows rather than written into copy.
  const offers = {
    codes: codesOffer(entitlement, plans),
    hosted: featureOffer("hosted_pages", entitlement, plans),
    custom: featureOffer("custom_codes", entitlement, plans),
    video: featureOffer("video_uploads", entitlement, plans),
    bulk: featureOffer("bulk_creation", entitlement, plans),
  };
  const bulkLocked = atLimit ? offers.codes : canBulkCreate(entitlement) ? null : offers.bulk;

  if (dynamic && isDynamicKind(dynamic) && !atLimit && !lockedPage(dynamic)) {
    const type = dynamicType(dynamic);
    return (
      <DashShell heading={type.label} meta={type.blurb} back={back}>
        <CreateCodeForm
          kind={dynamic}
          logos={library.map(({ id, url, name }) => ({ id, url, name }))}
          uploads={uploads}
          videoUploads={canUploadVideo(entitlement)}
          videoOffer={offers.video}
          customLinks={canUseCustomCodes(entitlement)}
          customOffer={offers.custom}
        />
      </DashShell>
    );
  }

  if (fixed && isStaticKind(fixed)) {
    const type = staticType(fixed);
    return (
      <DashShell heading={type.label} meta={`Static code · ${type.blurb}`} back={back}>
        {/*
          The library is the session user's own (`listLogos` filters by
          user id). Colours and logos are on every plan, so nothing is gated;
          the code's content still never comes to the server.
        */}
        <StaticCodeForm
          kind={fixed}
          logos={library.map(({ id, url, name }) => ({ id, url, name }))}
          uploads={uploads}
        />
      </DashShell>
    );
  }

  return (
    <DashShell
      heading="Choose your code type"
      back={{ href: "/app", label: "All codes" }}
      meta={
        entitlement ? (
          <span className="dash-num">
            {entitlement.planName} plan · {codes.length} of {entitlement.maxCodes} dynamic
            codes used
          </span>
        ) : null
      }
    >
      <TypeSection
        id="dynamic-heading"
        heading="Dynamic codes"
        note="Hosted by us. Change what it shows after printing, pause it, and see every scan. Uses one of your plan's codes."
        types={DYNAMIC_TYPES}
        href={(kind) => `/app/new?dynamic=${kind}`}
        needsUpload={(kind) => !uploads && UPLOAD_ONLY.has(kind)}
        locked={(kind) => (atLimit ? offers.codes : lockedPage(kind) ? offers.hosted : null)}
      />

      {!pages && !atLimit ? (
        <p className="-mt-4 mb-10 max-w-[60ch] text-sm leading-relaxed text-[var(--paper-soft)]">
          {offers.hosted.why}{" "}
          {offers.hosted.unlock ? `Hosted pages come with ${offers.hosted.unlock.name} and up; ` : ""}
          link codes are included. Pick a locked type to see what it adds, or{" "}
          <Link href="/billing" className="underline underline-offset-4">
            compare plans
          </Link>
          .
        </p>
      ) : null}

      {atLimit && entitlement ? (
        <p className="-mt-4 mb-10 max-w-[60ch] text-sm leading-relaxed text-[var(--paper-soft)]">
          You are using all {entitlement.maxCodes} dynamic codes on the{" "}
          {entitlement.planName} plan.{" "}
          <Link href="/billing" className="underline underline-offset-4">
            See plans
          </Link>{" "}
          for more, or make a static code below, which needs no slot.
        </p>
      ) : null}

      <section aria-labelledby="bulk-heading" className="-mt-2 mb-12">
        <h2 id="bulk-heading" className="sr-only">
          Many codes at once
        </h2>
        <BulkCard locked={bulkLocked} />
      </section>

      <TypeSection
        id="static-heading"
        heading="Static codes"
        note="The content is baked into the pattern. Free, never stored, and it can never be changed or tracked once printed."
        types={STATIC_TYPES}
        href={(kind) => `/app/new?static=${kind}`}
      />
    </DashShell>
  );
}

/**
 * The way in to bulk creation, under the dynamic types it makes. Locked on a
 * plan without it (or at the code limit), and then it explains on click.
 */
function BulkCard({ locked }: { locked: UpgradeOffer | null }) {
  const card =
    "flex w-full items-start gap-3 rounded-lg border border-[var(--paper-rule)] bg-white px-4 py-3.5 text-left sm:max-w-md";
  const body = (
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-1.5 text-[15px] font-medium text-[var(--paper-ink)]">
        Many at once, from a spreadsheet
        {locked ? <LockIcon className="text-[var(--paper-soft)]" /> : null}
      </span>
      <span className="block text-sm text-[var(--paper-soft)]">
        Link, Instagram and Facebook codes from a CSV, with every QR image in one zip.
      </span>
      {locked ? (
        <span className="mt-1 block text-xs text-[var(--paper-ink)]">
          {locked.gate === "codes"
            ? "No dynamic codes left on your plan"
            : locked.unlock
              ? `Included from ${locked.unlock.name}`
              : "Not on your plan"}
        </span>
      ) : null}
    </span>
  );
  return locked ? (
    <LockedButton
      offer={locked}
      className={`${card} border-dashed transition-colors duration-150 hover:border-[var(--paper-ink)]`}
    >
      {body}
    </LockedButton>
  ) : (
    <Link
      href="/app/new/bulk"
      className={`${card} no-underline transition-colors duration-150 hover:border-[var(--paper-ink)]`}
    >
      {body}
    </Link>
  );
}
