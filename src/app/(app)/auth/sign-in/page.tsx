import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { AuthAside } from "../../AuthAside";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
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
      <SignInForm />
    </AuthShell>
  );
}
