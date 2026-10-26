import type { Metadata } from "next";
import { CODE_ORIGIN, PRODUCT_NAME } from "@/lib/brand";
import { PRIVACY } from "@/lib/legal";
import { LegalShell } from "../LegalShell";

export const metadata: Metadata = {
  title: PRIVACY.title,
  description: `How ${PRODUCT_NAME} handles personal data: hashed visitor values instead of IP addresses, no cookies on the redirect, and what you can ask us to do.`,
  alternates: { canonical: `${CODE_ORIGIN}/privacy` },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return <LegalShell doc={PRIVACY} />;
}
