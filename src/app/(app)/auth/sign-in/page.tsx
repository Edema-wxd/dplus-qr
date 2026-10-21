import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../../AuthShell";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <AuthShell
      heading="Sign in"
      footer={
        <>
          No account yet?{" "}
          <Link href="/auth/sign-up" className="underline underline-offset-4">
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
