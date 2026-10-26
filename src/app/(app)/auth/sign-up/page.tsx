import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { AuthAside } from "../../AuthAside";
import { SignUpForm } from "./SignUpForm";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthShell
      heading="Create an account"
      lede="Print a code once, then change where it leads whenever you need to."
      aside={<AuthAside />}
      footer={
        <>
          Already have one?{" "}
          <Link href="/auth/sign-in" className="inline-flex min-h-11 items-center font-medium text-foreground underline underline-offset-4">
            Sign in
          </Link>
          .
        </>
      }
    >
      <SignUpForm />
    </AuthShell>
  );
}
