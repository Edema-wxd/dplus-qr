import type { Metadata } from "next";
import { StatusShell } from "../StatusShell";

export const metadata: Metadata = { title: "Code not found" };

export default function NotFoundCodePage() {
  return (
    <StatusShell accent="blue" heading="We don't recognise this code">
      <p>
        This code does not match anything in our system. It may have been typed
        by hand, or the printed code may be damaged or partly covered.
      </p>
      <p>
        If you scanned it from printed material, try again with the whole code in
        frame and good light.
      </p>
    </StatusShell>
  );
}
