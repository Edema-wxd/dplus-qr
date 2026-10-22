import type { Metadata } from "next";
import { sarlotte, raleway } from "@/lib/fonts";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: PRODUCT_NAME, template: `%s · ${PRODUCT_NAME}` },
  description: "Dynamic QR codes you can re-point at any time. A De Sign Plus product.",
  // Status pages must never be indexed: they are transient states of someone
  // else's printed material.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${sarlotte.variable} ${raleway.variable}`}>
      <body>{children}</body>
    </html>
  );
}
