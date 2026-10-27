"use server";

import { revalidatePath } from "next/cache";
import { UTApi } from "uploadthing/server";
import { z } from "zod";
import { auth } from "@/lib/auth/server";
import { isAdmin } from "@/lib/admin";
import { uploadsEnabled } from "@/lib/uploads";
import {
  archiveAccount,
  archiveCode,
  blockAllCodes,
  blockCode,
  eraseAccountData,
  erasePrecheck,
  eraseRefusal,
  erasureConfirmed,
  hasSignInAccount,
  reasonSchema,
  rescreenCode,
  setCodeStatusAsStaff,
  suspendAccount,
  unarchiveAccount,
  unarchiveCode,
  unblockCode,
  unsuspendAccount,
} from "@/lib/moderation";
import { recordChange, staffForAction } from "./guard";
import type { AdminFormState } from "./actions";

/**
 * Staff moderation of codes and accounts. Each action re-checks that the
 * caller is an admin, validates its input with zod, leaves the rules to
 * `lib/moderation.ts`, and records who did what in `qr_admin_audit`.
 */

const REFUSED: AdminFormState = { error: "Only staff can do that." };

/** Any Postgres `uuid`; see the note in `actions.ts`. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CODE_OPS = ["block", "unblock", "pause", "resume", "archive", "unarchive", "rescreen"] as const;

const codeSchema = z.object({
  codeId: z.coerce.number().int().positive(),
  op: z.enum(CODE_OPS),
});

/** What each code action leaves behind, said the way staff would check it. */
const CODE_DONE: Record<Exclude<(typeof CODE_OPS)[number], "rescreen">, string> = {
  block: "Blocked. Scanners see the disabled-for-safety page within seconds.",
  unblock: "Unblocked and live again.",
  pause: "Paused. Scanners see the paused page.",
  resume: "Live again.",
  archive: "Archived. It answers as an unknown code and has left the owner's dashboard.",
  unarchive: "Back on the owner's dashboard, paused. The owner or staff can resume it.",
};

/** Why a code action changed nothing: the code was not in a state it applies to. */
const CODE_STALE: Record<Exclude<(typeof CODE_OPS)[number], "rescreen">, string> = {
  block: "That code is already blocked.",
  unblock: "That code is not blocked.",
  pause: "That code cannot be paused: it is blocked, archived or already paused.",
  resume: "That code cannot be resumed: it is blocked, archived or already live.",
  archive: "That code is already archived.",
  unarchive: "That code cannot be unarchived: it is not archived, or its account is archived or erased.",
};

export async function codeAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = codeSchema.safeParse({ codeId: form.get("codeId"), op: form.get("op") });
  if (!parsed.success) return { error: "That code does not exist." };
  const { codeId, op } = parsed.data;

  if (op === "rescreen") {
    const outcome = await rescreenCode(codeId);
    if (!outcome) return { error: "That code does not exist." };
    await recordChange(staff, "code.rescreen", "code", String(codeId), {
      passed: outcome.screen.ok,
      reputation: outcome.reputation,
    });
    if (outcome.hosted) {
      return { notice: "A page hosted here, so there is no outside destination. Its links were screened when saved." };
    }
    if (!outcome.screen.ok) return { error: `Fails screening today: ${outcome.screen.reason}` };
    return {
      notice:
        outcome.reputation === "flagged"
          ? "Passes the URL rules, but the reputation check flags it."
          : outcome.reputation === "clean"
            ? "Passes the URL rules and the reputation check."
            : "Passes the URL rules. No reputation provider is configured, so it is not checked against threat lists.",
    };
  }

  let reason: string | null = null;
  if (op === "block") {
    const parsedReason = reasonSchema.safeParse(form.get("reason") ?? "");
    if (!parsedReason.success) return { error: parsedReason.error.issues[0]?.message ?? "Give a reason." };
    reason = parsedReason.data;
  }

  const shortCode =
    op === "block"
      ? await blockCode(codeId, reason!)
      : op === "unblock"
        ? await unblockCode(codeId)
        : op === "pause"
          ? await setCodeStatusAsStaff(codeId, "paused")
          : op === "resume"
            ? await setCodeStatusAsStaff(codeId, "active")
            : op === "archive"
              ? await archiveCode(codeId)
              : await unarchiveCode(codeId);
  if (!shortCode) return { error: CODE_STALE[op] };

  await recordChange(staff, `code.${op}`, "code", String(codeId), reason ? { shortCode, reason } : { shortCode });
  revalidatePath(`/admin/codes/${codeId}`);
  revalidatePath("/admin/codes");
  return { notice: CODE_DONE[op] };
}

const ACCOUNT_OPS = ["suspend", "unsuspend", "block_all", "archive", "unarchive"] as const;

const accountSchema = z.object({
  userId: z.string().regex(UUID),
  op: z.enum(ACCOUNT_OPS),
});

export async function accountAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = accountSchema.safeParse({ userId: form.get("userId"), op: form.get("op") });
  if (!parsed.success) return { error: "That account does not exist." };
  const { userId, op } = parsed.data;

  if (userId === staff.id && op !== "unsuspend" && op !== "unarchive") {
    return { error: "You cannot do that to your own account." };
  }

  let result: AdminFormState;
  let detail: Record<string, unknown> = {};

  switch (op) {
    case "suspend":
      result = (await suspendAccount(userId))
        ? { notice: "Suspended. Every code shows the paused page; they can still sign in." }
        : { error: "That account is already suspended, or has been erased." };
      break;
    case "unsuspend":
      result = (await unsuspendAccount(userId))
        ? { notice: "Suspension lifted. Codes that are live serve again within seconds." }
        : { error: "That account is not suspended, or is archived (unarchive it first)." };
      break;
    case "block_all": {
      const reason = reasonSchema.safeParse(form.get("reason") ?? "");
      if (!reason.success) return { error: reason.error.issues[0]?.message ?? "Give a reason." };
      const count = await blockAllCodes(userId, reason.data);
      detail = { reason: reason.data, codes: count };
      result = count > 0
        ? { notice: `Blocked ${count} ${count === 1 ? "code" : "codes"}.` }
        : { error: "Every code on this account is already blocked." };
      break;
    }
    case "archive": {
      const count = await archiveAccount(userId);
      detail = { codes: count };
      result = count === null
        ? { error: "That account is already archived, or has been erased." }
        : { notice: `Archived and suspended, with ${count} ${count === 1 ? "code" : "codes"} archived.` };
      break;
    }
    case "unarchive": {
      const count = await unarchiveAccount(userId);
      detail = { codes: count };
      result = count === null
        ? { error: "That account is not archived." }
        : {
            notice: `Unarchived, with ${count} ${count === 1 ? "code" : "codes"} back on their dashboard, paused. The account is still suspended until you lift it.`,
          };
      break;
    }
  }

  if (result.notice) {
    await recordChange(staff, `customer.${op}`, "customer", userId, detail);
    revalidatePath(`/admin/customers/${userId}`);
    revalidatePath("/admin/customers");
    revalidatePath("/admin/codes");
  }
  return result;
}

const eraseSchema = z.object({
  userId: z.string().regex(UUID),
  confirm: z.string().max(320),
});

/**
 * Erase an account: personal data and content first, in one transaction, then
 * its files in UploadThing, then its sign-in account in Neon Auth. The last
 * two are outside the transaction because they are other services; each
 * failure is reported, and removing the sign-in account can be retried.
 *
 * The audit row records that an erasure happened and how much it removed,
 * never the email: keeping it there would undo the erasure.
 */
export async function eraseAccountAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const parsed = eraseSchema.safeParse({ userId: form.get("userId"), confirm: form.get("confirm") ?? "" });
  if (!parsed.success) return { error: "That account does not exist." };
  const { userId, confirm } = parsed.data;

  const facts = await erasePrecheck(userId);
  if (!facts) return { error: "That account does not exist." };

  const refusal = eraseRefusal({
    staffId: staff.id,
    userId,
    targetIsAdmin: await isAdmin(userId),
    alreadyErased: facts.erased,
    liveViaPaystack: facts.liveViaPaystack,
  });
  if (refusal) return { error: refusal };
  if (!erasureConfirmed(confirm, facts.email)) {
    return { error: "The email you typed does not match this account." };
  }

  const erased = await eraseAccountData(userId);
  if (!erased.ok) return { error: erased.error };

  let filesRemoved = true;
  if (erased.fileKeys.length > 0) {
    if (uploadsEnabled()) {
      try {
        await new UTApi().deleteFiles(erased.fileKeys);
      } catch (error) {
        console.error("[admin] erased account but could not delete its files", { userId, error });
        filesRemoved = false;
      }
    } else {
      filesRemoved = false;
    }
  }

  const signInRemoved = await removeSignIn(userId);

  await recordChange(staff, "customer.erase", "customer", userId, {
    codes: erased.codes,
    files: erased.fileKeys.length,
    filesRemoved,
    signInRemoved,
  });
  revalidatePath(`/admin/customers/${userId}`);
  revalidatePath("/admin/customers");
  revalidatePath("/admin/codes");

  const problems = [
    filesRemoved ? null : `${erased.fileKeys.length} uploaded files could not be removed from UploadThing; delete them there by hand.`,
    signInRemoved ? null : "The sign-in account could not be removed yet. Use the retry button below.",
  ].filter(Boolean);
  return problems.length > 0
    ? { error: `Erased ${erased.codes} codes and the account's data, but: ${problems.join(" ")}` }
    : { notice: `Erased. ${erased.codes} codes now answer as unknown, and their short codes stay reserved.` };
}

/** Retry removing the sign-in account of an account already erased. */
export async function removeSignInAction(_prev: AdminFormState, form: FormData): Promise<AdminFormState> {
  const staff = await staffForAction();
  if (!staff) return REFUSED;

  const userId = z.string().regex(UUID).safeParse(form.get("userId"));
  if (!userId.success) return { error: "That account does not exist." };

  const facts = await erasePrecheck(userId.data);
  if (!facts?.erased) return { error: "Only an erased account's sign-in is removed here." };
  if (!(await hasSignInAccount(userId.data))) return { notice: "Already removed." };

  if (!(await removeSignIn(userId.data))) {
    return { error: "Neon Auth refused again. Check the logs, or remove the user with the neon CLI." };
  }
  await recordChange(staff, "customer.remove_sign_in", "customer", userId.data, {});
  revalidatePath(`/admin/customers/${userId.data}`);
  return { notice: "Sign-in account removed." };
}

/**
 * Remove the person's Neon Auth account, which also ends their sessions.
 * Runs as the staff member, whose admin role the service checks itself.
 */
async function removeSignIn(userId: string): Promise<boolean> {
  try {
    const { error } = await auth.admin.removeUser({ userId });
    if (error) {
      console.error("[admin] Neon Auth refused to remove user", { userId, error });
      return false;
    }
    return true;
  } catch (error) {
    console.error("[admin] could not reach Neon Auth to remove user", { userId, error });
    return false;
  }
}
