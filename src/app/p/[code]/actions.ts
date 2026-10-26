"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { clientIp, ipRateKey } from "@/lib/ip";
import { allowFeedback } from "@/lib/ratelimit";
import { saveFeedback } from "@/lib/public-page";
import { isValidCodeFormat } from "@/lib/short-code";

const schema = z.object({
  code: z.string().refine(isValidCodeFormat, "That is not a valid code."),
  rating: z.coerce
    .number({ error: "Choose a rating." })
    .int()
    .min(1, "Choose a rating.")
    .max(5, "Choose a rating."),
  comment: z.string().trim().max(1000, "Keep it under 1,000 characters.").default(""),
});

export type FeedbackState = { status: "idle" | "sent"; rating?: number; error?: string };

/**
 * One answer to a feedback code. No session, like the report form, so it is
 * rate limited per visitor here; `saveFeedback` only accepts it for a live
 * code of the feedback kind.
 */
export async function submitFeedback(
  _previous: FeedbackState,
  formData: FormData
): Promise<FeedbackState> {
  const parsed = schema.safeParse({
    code: formData.get("code"),
    rating: formData.get("rating") ?? undefined,
    comment: formData.get("comment") ?? "",
  });
  if (!parsed.success) {
    return { status: "idle", error: parsed.error.issues[0]?.message ?? "Check the form." };
  }

  const allowed = await allowFeedback(ipRateKey(clientIp(await headers())));
  if (!allowed) {
    return { status: "idle", error: "Thank you, we already have your answers." };
  }

  try {
    const saved = await saveFeedback(
      parsed.data.code,
      parsed.data.rating,
      parsed.data.comment || null
    );
    if (!saved) return { status: "idle", error: "This code is not taking answers right now." };
  } catch (error) {
    console.error("[feedback] submit failed", error);
    return { status: "idle", error: "We could not save that. Please try again." };
  }

  return { status: "sent", rating: parsed.data.rating };
}
