"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/server";
import {
  changeDestination,
  createCode,
  renameCode,
  setStatus,
} from "@/lib/user-codes";

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

const idSchema = z.string().regex(/^\d+$/, "That code could not be found.");

export type CreateCodeState = { error?: string };

export async function createCodeAction(
  _previous: CreateCodeState,
  formData: FormData
): Promise<CreateCodeState> {
  const userId = await requireUserId();

  const parsed = z
    .object({ name: nameSchema, destinationUrl: destinationSchema })
    .safeParse({
      name: formData.get("name"),
      destinationUrl: formData.get("destinationUrl"),
    });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  let created;
  try {
    created = await createCode(userId, parsed.data);
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
