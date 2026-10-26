import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/lib/auth/server";
import { ensureProfile } from "@/lib/profile";
import { getEntitlement } from "@/lib/entitlement";
import { listCodes } from "@/lib/user-codes";
import { listLogos } from "@/lib/logos";
import { uploadsEnabled } from "@/lib/uploads";
import {
  DYNAMIC_TYPES,
  STATIC_TYPES,
  dynamicType,
  isDynamicKind,
  isStaticKind,
  staticType,
} from "@/lib/qr-types";
import { DashShell } from "../DashShell";
import { TypeSection, UPLOAD_ONLY } from "./TypeSection";
import { CreateCodeForm } from "./CreateCodeForm";
import { StaticCodeForm } from "./StaticCodeForm";

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

  const [params, codes, entitlement, library] = await Promise.all([
    searchParams,
    listCodes(user.id),
    getEntitlement(user.id),
    listLogos(user.id),
  ]);

  const atLimit = entitlement !== null && codes.length >= entitlement.maxCodes;
  const uploads = uploadsEnabled();
  const dynamic = typeof params.dynamic === "string" ? params.dynamic : null;
  const fixed = typeof params.static === "string" ? params.static : null;
  const back = { href: "/app/new", label: "All code types" };

  if (dynamic && isDynamicKind(dynamic) && !atLimit) {
    const type = dynamicType(dynamic);
    return (
      <DashShell heading={type.label} meta={type.blurb} back={back}>
        <CreateCodeForm
          kind={dynamic}
          logos={library.map(({ id, url, name }) => ({ id, url, name }))}
          uploads={uploads}
        />
      </DashShell>
    );
  }

  if (fixed && isStaticKind(fixed)) {
    const type = staticType(fixed);
    return (
      <DashShell heading={type.label} meta={`Static code · ${type.blurb}`} back={back}>
        <StaticCodeForm kind={fixed} />
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
        disabled={atLimit}
        needsUpload={(kind) => !uploads && UPLOAD_ONLY.has(kind)}
      />

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
