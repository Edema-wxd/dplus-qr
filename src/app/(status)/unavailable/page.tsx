import type { Metadata } from "next";
import { StatusShell } from "../StatusShell";

export const metadata: Metadata = { title: "Temporarily unavailable" };

/**
 * Shown when the code could not be looked up at all -- a database outage rather
 * than anything wrong with the code.
 *
 * Deliberately not the not-found page: telling someone their genuine printed
 * code does not exist is worse than admitting a temporary fault, and it invites
 * them to throw the printed material away.
 *
 * Fully static, so it renders even while the database is down.
 */
export default function UnavailablePage() {
  return (
    <StatusShell accent="blue" heading="We can't reach this code right now">
      <p>
        This is a problem at our end, not with the code you scanned. It is being
        looked into.
      </p>
      <p>Please try again in a few minutes.</p>
    </StatusShell>
  );
}
