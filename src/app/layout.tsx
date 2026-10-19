import type { Metadata } from "next";
import { sarlotte, raleway } from "@/lib/fonts";
import { PRODUCT_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: PRODUCT_NAME,
  description: "Dynamic QR codes by De Sign Plus.",
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
