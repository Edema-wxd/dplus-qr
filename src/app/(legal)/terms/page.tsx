import type { Metadata } from "next";
import { CODE_ORIGIN, PRODUCT_NAME } from "@/lib/brand";
import { TERMS } from "@/lib/legal";
import { LegalShell } from "../LegalShell";

/**
 * The root layout marks this whole host `noindex`, because almost every page
 * on it is a transient state of someone else's printed material. The legal
 * pages are among the few that should be findable -- a customer checking the
 * refund position before paying, or Paystack's own merchant review -- so each
 * one opts itself back in, the same way the landing page does.
 */
export const metadata: Metadata = {
  title: TERMS.title,
  description: `The terms of service for ${PRODUCT_NAME}: plans, billing, cancellation, acceptable use and data protection roles.`,
  alternates: { canonical: `${CODE_ORIGIN}/terms` },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return <LegalShell doc={TERMS} />;
}
