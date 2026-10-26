"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import {
  changeDestination,
  createCode,
  customCodeAvailable,
  parseCodeId,
  renameCode,
  setCodeStyle,
  setStatus,
  updateCodeContent,
  type CreateInput,
} from "@/lib/user-codes";
import { isDynamicKind, isLinkKind } from "@/lib/qr-types";
import { checkQrStyle, qrStyleSchema } from "@/lib/qr-style";
import { archiveLogo, parseLogoId, setCodeLogo } from "@/lib/logos";
import { canUseCustomCodes, getEntitlement } from "@/lib/entitlement";
import { checkCustomCode } from "@/lib/short-code";

/**
 * Dashboard mutations.
 *
 * Every one re-reads the session rather than trusting the page that rendered
 * the form: `proxy.ts` guards pages, not data, and a Server Action is an
 * endpoint anyone can post to. The user id comes from the session only — never
 * from the form — and every query underneath filters by it.
 */
async function requireUserId(): Promise<string> {
  const { data: session } = await auth.getSession();
  if (!session?.user) redirect("/auth/sign-in");
  return session.user.id;
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the code a name you will recognise later.")
  .max(80, "That name is too long. Keep it under 80 characters.");

const destinationSchema = z
  .string()
  .trim()
  .min(1, "Enter a destination link.")
  .max(2048, "That link is too long.");

// The same guard the pages and route handlers use, so a tampered form id is a
// clean "not found" rather than a bigint cast error from Postgres.
const idSchema = z
  .string()
  .refine((value) => parseCodeId(value) !== null, "That code could not be found.");

// Empty means "no logo": that is what the picker's "None" option posts.
const logoIdSchema = z
  .string()
  .refine(
    (value) => value === "" || parseLogoId(value) !== null,
    "That logo could not be found."
  )
  .transform((value) => (value === "" ? null : value));

/**
 * A page type's content, posted as one JSON field by the editor. Parsed here
 * only as far as "is it JSON, and not huge"; its shape is the kind's schema's
 * job, in `createCode` and `updateCodeContent`.
 */
const contentSchema = z
  .string({ error: "Fill in the page first." })
  .max(100_000, "That page is too large.")
  .transform((value, ctx) => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      ctx.addIssue({ code: "custom", message: "That page could not be read. Please try again." });
      return z.NEVER;
    }
  });

export type CreateCodeState = { error?: string };

export async function createCodeAction(
  _previous: CreateCodeState,
  formData: FormData
): Promise<CreateCodeState> {
  const userId = await requireUserId();

  const common = z
    .object({
      name: nameSchema,
      kind: z.string().refine(isDynamicKind, "Choose a kind of code."),
      logoId: logoIdSchema,
      // Optional; the format and the plan are checked in `createCode`, where
      // the save happens, so a tampered form meets the same rules.
      customCode: z.string().trim().max(64).default(""),
    })
    .safeParse({
      name: formData.get("name"),
      kind: formData.get("kind") ?? "url",
      logoId: formData.get("logoId") ?? "",
      customCode: formData.get("customCode") ?? "",
    });

  if (!common.success) {
    return { error: common.error.issues[0]?.message ?? "Check the form." };
  }

  const { name, kind, logoId } = common.data;
  const customCode = common.data.customCode || null;
  let input: CreateInput;
  if (isLinkKind(kind)) {
    const destination = destinationSchema.safeParse(formData.get("destinationUrl"));
    if (!destination.success) {
      return { error: destination.error.issues[0]?.message ?? "Check the form." };
    }
    input = { kind, name, logoId, customCode, destinationUrl: destination.data };
  } else {
    const content = contentSchema.safeParse(formData.get("content"));
    if (!content.success) {
      return { error: content.error.issues[0]?.message ?? "Check the form." };
    }
    input = { kind, name, logoId, customCode, content: content.data };
  }

  let created;
  try {
    created = await createCode(userId, input);
  } catch (error) {
    console.error("[dashboard] create failed", error);
    return { error: "We could not create that code. Please try again." };
  }

  if (!created.ok) return { error: created.reason };

  // Outside the try/catch: `redirect` works by throwing, so a catch would
  // swallow it and the user would sit on a form that had already succeeded.
  redirect(`/app/${created.id}`);
}

export type CodeState = { error?: string; saved?: boolean };

export async function renameCodeAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ id: idSchema, name: nameSchema })
    .safeParse({ id: formData.get("id"), name: formData.get("name") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const ok = await renameCode(userId, parsed.data.id, parsed.data.name);
    if (!ok) return { error: "That code could not be found." };
  } catch (error) {
    console.error("[dashboard] rename failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  revalidatePath("/app");
  return { saved: true };
}

export async function changeDestinationAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ id: idSchema, destinationUrl: destinationSchema })
    .safeParse({
      id: formData.get("id"),
      destinationUrl: formData.get("destinationUrl"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const result = await changeDestination(
      userId,
      parsed.data.id,
      parsed.data.destinationUrl
    );
    // The screener's own wording is returned verbatim: it already explains
    // which rule was hit and what to do instead.
    if (!result.ok) return { error: result.reason };
  } catch (error) {
    console.error("[dashboard] destination change failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  revalidatePath("/app");
  return { saved: true };
}

export async function updateContentAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ id: idSchema, content: contentSchema })
    .safeParse({ id: formData.get("id"), content: formData.get("content") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const result = await updateCodeContent(userId, parsed.data.id, parsed.data.content);
    if (!result.ok) return { error: result.reason };
  } catch (error) {
    console.error("[dashboard] content change failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  return { saved: true };
}

export async function setStatusAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({
      id: idSchema,
      // Only these two. `blocked` is an admin verdict about a destination and
      // is deliberately unreachable from the owner's own dashboard.
      status: z.enum(["active", "paused"]),
    })
    .safeParse({ id: formData.get("id"), status: formData.get("status") });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const ok = await setStatus(userId, parsed.data.id, parsed.data.status);
    if (!ok) {
      return {
        error:
          "That code could not be changed. A blocked code can only be restored by support.",
      };
    }
  } catch (error) {
    console.error("[dashboard] status change failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  revalidatePath("/app");
  return { saved: true };
}

export async function setStyleAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ id: idSchema, style: qrStyleSchema })
    .safeParse({
      id: formData.get("id"),
      style: { dark: formData.get("dark"), light: formData.get("light") },
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  // The form runs this same check as the owner picks, but a Server Action is
  // an endpoint anyone can post to, so the server decides.
  const scannable = checkQrStyle(parsed.data.style);
  if (!scannable.ok) return { error: scannable.reason };

  try {
    const ok = await setCodeStyle(userId, parsed.data.id, parsed.data.style);
    if (!ok) return { error: "That code could not be found." };
  } catch (error) {
    console.error("[dashboard] style change failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  revalidatePath("/app");
  return { saved: true };
}

export async function setLogoAction(
  _previous: CodeState,
  formData: FormData
): Promise<CodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ id: idSchema, logoId: logoIdSchema })
    .safeParse({ id: formData.get("id"), logoId: formData.get("logoId") ?? "" });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  try {
    const ok = await setCodeLogo(userId, parsed.data.id, parsed.data.logoId);
    if (!ok) {
      return {
        error: "That logo is no longer in your library. Pick another, or upload it again.",
      };
    }
  } catch (error) {
    console.error("[dashboard] logo change failed", error);
    return { error: "We could not save that. Please try again." };
  }

  revalidatePath(`/app/${parsed.data.id}`);
  revalidatePath("/app");
  return { saved: true };
}

/**
 * Remove a logo from the picker. Codes already drawn with it keep it; see
 * `archiveLogo`.
 */
export async function archiveLogoAction(logoId: string): Promise<CodeState> {
  const userId = await requireUserId();

  const id = parseLogoId(String(logoId));
  if (!id) return { error: "That logo could not be found." };

  try {
    const ok = await archiveLogo(userId, id);
    if (!ok) return { error: "That logo could not be found." };
  } catch (error) {
    console.error("[dashboard] logo archive failed", error);
    return { error: "We could not remove that. Please try again." };
  }

  revalidatePath("/app", "layout");
  return { saved: true };
}

export type CustomCodeHint =
  | { state: "available"; code: string }
  | { state: "taken" | "invalid" | "unavailable"; reason: string };

/**
 * The live hint under the custom link field: allowed, free, or why not.
 * Read-only and advisory; the save decides (see `customCodeAvailable`).
 */
export async function checkCustomCodeAction(raw: string): Promise<CustomCodeHint> {
  const userId = await requireUserId();

  const permitted = canUseCustomCodes(await getEntitlement(userId));
  if (!permitted.ok) return { state: "unavailable", reason: permitted.reason };

  const checked = checkCustomCode(String(raw ?? ""));
  if (!checked.ok) return { state: "invalid", reason: checked.reason };

  try {
    if (!(await customCodeAvailable(checked.code))) {
      return { state: "taken", reason: "Someone already has that link. Try another." };
    }
  } catch (error) {
    console.error("[dashboard] custom code check failed", error);
    return { state: "unavailable", reason: "Could not check that link just now." };
  }
  return { state: "available", code: checked.code };
}
