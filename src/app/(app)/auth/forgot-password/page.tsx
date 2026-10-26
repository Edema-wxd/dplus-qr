import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { AuthAside } from "../../AuthAside";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Reset your password" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      heading="Reset your password"
      lede="Enter your email and we will send you a link to choose a new one."
      aside={<AuthAside />}
      footer={
        <Link
          href="/auth/sign-in"
          className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4"
        >
          Back to sign in
        </Link>
      }
    >
      <ForgotForm />
    </AuthShell>
  );
}
