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
      aside={<AuthAside />}
      footer={
        <>
          Already have one?{" "}
          <Link href="/auth/sign-in" className="underline underline-offset-4">
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
