import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { AuthAside } from "../../AuthAside";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

/** Shown once after a password reset sends the person back here. */
async function ResetNotice({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const { reset } = await searchParams;
  if (!reset) return null;
  return (
    <p role="status" className="mb-5 rounded-lg border border-dsp-green/40 bg-dsp-green/10 px-3.5 py-2.5 text-sm">
      Password updated. Sign in with your new password.
    </p>
  );
}

export default function SignInPage({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  return (
    <AuthShell
      heading="Sign in"
      lede="Manage the codes you have printed."
      aside={<AuthAside />}
      footer={
        <>
          No account yet?{" "}
          <Link href="/auth/sign-up" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Create one
          </Link>
          .
        </>
      }
    >
      <Suspense>
        <ResetNotice searchParams={searchParams} />
      </Suspense>
      <SignInForm />
    </AuthShell>
  );
}
