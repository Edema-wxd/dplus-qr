import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { AuthAside } from "../../AuthAside";
import { ResetForm, InvalidLink } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password" };

/**
 * Managed Auth redirects here with `?token=…`, or `?error=INVALID_TOKEN` when
 * the link was bad. `searchParams` is read in a child inside Suspense so the
 * shell stays static, as Cache Components requires.
 */
async function Body({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  if (error || !token) return <InvalidLink />;
  return <ResetForm token={token} />;
}

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  return (
    <AuthShell
      heading="Choose a new password"
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
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}
