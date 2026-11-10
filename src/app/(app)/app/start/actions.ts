"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { resolveScope } from "@/lib/resolve-scope";
import type { AccountScope } from "@/lib/account-scope";
import { flash } from "@/lib/flash";
import { linkDestination } from "@/lib/page-content";
import { LINK_KINDS } from "@/lib/qr-types";
import { checkQrStyle, DEFAULT_QR_STYLE, qrStyleSchema } from "@/lib/qr-style";
import { parseLogoId } from "@/lib/logos";
import { createCode, setCodeStyle } from "@/lib/user-codes";
import {
  attachCode,
  completeOnboarding,
  getOnboarding,
  isOwnAccount,
  setDraft,
  setPurpose,
  skipOnboarding,
} from "@/lib/onboarding";
import { isPurpose, isStartScreen } from "@/lib/onboarding-steps";

/**
 * The onboarding's Server Actions.
 *
 * Like every dashboard mutation, each resolves the scope from the session,
 * never from the form. The screens are plain forms, so every action ends in
 * a redirect to the next screen and the flow works before any JavaScript has
 * loaded.
 *
 * Onboarding is the person's own account's. If they switched to a team in
 * another tab since the screen was drawn, the action changes nothing and
 * sends them to the dashboard, which is the team's: a code made here would
 * otherwise land in whichever account is now active.
 *
 * Making the code goes through `createCode`, the dashboard's own path, so the
 * onboarding's first code meets exactly the same screening, plan limits,
 * reputation check and short-code rules as any other.
 */
async function requireOwnScope(): Promise<AccountScope> {
  const scope = await resolveScope();
  if (!scope) redirect("/auth/sign-in");
  if (!isOwnAccount(scope)) redirect("/app");
  return scope;
}

/**
 * `value` is what was typed, handed back with an error: React resets a form
 * after its action runs, and a refused link should not have to be retyped.
 */
export type StepState = { error?: string; value?: string };

/** Screen 2. One tap: each choice is its own submit button. */
export async function choosePurposeAction(formData: FormData): Promise<void> {
  const scope = await requireOwnScope();
  const purpose = formData.get("purpose");
  // A tampered value is not worth an error on a one-tap screen: the person
  // simply stays where they are.
  if (!isPurpose(purpose)) redirect("/app/start?step=purpose");

  await setPurpose(scope, purpose);
  redirect("/app/start?step=link");
}

/**
 * Screen 3. Screened here, before any code exists, so a refused link is
 * explained on the screen where it was typed rather than one screen later.
 * `createCode` screens it again on screen 4.
 */
export async function setLinkAction(_previous: StepState, formData: FormData): Promise<StepState> {
  const scope = await requireOwnScope();
  const typed = String(formData.get("destination") ?? "").slice(0, 2048);

  const parsed = z
    .object({
      kind: z.enum(LINK_KINDS, { error: "Choose where the code should lead." }),
      destination: z
        .string()
        .trim()
        .min(1, "Enter where a scan should take people.")
        .max(2048, "That link is too long."),
    })
    .safeParse({ kind: formData.get("kind"), destination: formData.get("destination") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form.", value: typed };
  }

  const screened = linkDestination(parsed.data.kind, parsed.data.destination);
  if (!screened.ok) return { error: screened.reason, value: typed };

  try {
    // The person's own wording is kept, not the normalised URL, so going back
    // shows them what they typed. `createCode` normalises it again.
    await setDraft(scope, { kind: parsed.data.kind, destination: parsed.data.destination });
  } catch (error) {
    console.error("[onboarding] could not save the link", error);
    return { error: "We could not save that. Please try again.", value: typed };
  }

  redirect("/app/start?step=create");
}

const createSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the code a name you will recognise later.")
    .max(80, "That name is too long. Keep it under 80 characters."),
  dark: z.string().default(DEFAULT_QR_STYLE.dark),
  logoId: z
    .string()
    .default("")
    .refine((value) => value === "" || parseLogoId(value) !== null, "That logo could not be found.")
    .transform((value) => (value === "" ? null : value)),
});

/** Screen 4: make the code from the saved draft. */
export async function createFirstCodeAction(
  _previous: StepState,
  formData: FormData
): Promise<StepState> {
  const scope = await requireOwnScope();
  const typed = String(formData.get("name") ?? "").slice(0, 80);
  const fail = (error: string): StepState => ({ error, value: typed });

  const parsed = createSchema.safeParse({
    name: formData.get("name"),
    dark: formData.get("dark") ?? undefined,
    logoId: formData.get("logoId") ?? undefined,
  });
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Check the form.");
  }

  const style = qrStyleSchema.safeParse({ dark: parsed.data.dark, light: DEFAULT_QR_STYLE.light });
  if (!style.success) return fail("Choose one of the colours shown.");
  const contrast = checkQrStyle(style.data);
  if (!contrast.ok) return fail(contrast.reason);

  const onboarding = await getOnboarding(scope);
  // Made already, from another tab or a double submit: carry on rather than
  // make a second code.
  if (onboarding?.codeId) redirect("/app/start?step=download");
  if (!onboarding?.draft) return fail("Choose where the code leads first.");

  let created;
  try {
    created = await createCode(scope, {
      kind: onboarding.draft.kind,
      name: parsed.data.name,
      destinationUrl: onboarding.draft.destination,
      logoId: parsed.data.logoId,
    });
  } catch (error) {
    console.error("[onboarding] create failed", error);
    return fail("We could not create that code. Please try again.");
  }
  if (!created.ok) return fail(created.reason);

  try {
    if (style.data.dark !== DEFAULT_QR_STYLE.dark) {
      await setCodeStyle(scope, created.id, style.data);
    }
    await attachCode(scope, created.id);
  } catch (error) {
    // The code exists and works. Losing its colour or its funnel row is not
    // a reason to tell someone it failed.
    console.error("[onboarding] could not finish saving the new code", error);
  }

  redirect("/app/start?step=download&made=1");
}

/** "Skip to dashboard", from any screen. Remembered: they are not sent back. */
export async function skipAction(formData: FormData): Promise<void> {
  const scope = await requireOwnScope();
  const screen = formData.get("screen");
  try {
    await skipOnboarding(scope, isStartScreen(screen) ? screen : "unknown");
  } catch (error) {
    console.error("[onboarding] could not record the skip", error);
  }
  redirect("/app");
}

/** The last screen's way out, scanned or not. Lands on the new code's page. */
export async function finishAction(): Promise<void> {
  const scope = await requireOwnScope();
  let codeId: string | null = null;
  try {
    codeId = (await getOnboarding(scope))?.codeId ?? null;
    await completeOnboarding(scope);
  } catch (error) {
    console.error("[onboarding] could not record finishing", error);
  }
  await flash("setup-finished");
  redirect(codeId ? `/app/${codeId}` : "/app");
}
