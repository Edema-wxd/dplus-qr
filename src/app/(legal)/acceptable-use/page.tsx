import type { Metadata } from "next";
import { CODE_ORIGIN, PRODUCT_NAME } from "@/lib/brand";
import { ACCEPTABLE_USE } from "@/lib/legal";
import { LegalShell } from "../LegalShell";

export const metadata: Metadata = {
  title: ACCEPTABLE_USE.title,
  description: `What a ${PRODUCT_NAME} code must never point at, how abuse is reported, and how a block is appealed.`,
  alternates: { canonical: `${CODE_ORIGIN}/acceptable-use` },
  robots: { index: true, follow: true },
};

export default function AcceptableUsePage() {
  return <LegalShell doc={ACCEPTABLE_USE} />;
}
