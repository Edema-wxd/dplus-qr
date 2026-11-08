"use client";

import { createContext, useContext } from "react";

/**
 * Whose account this is, when the person looking is a team member rather
 * than its owner. The upgrade prompt reads it: a member cannot change the
 * team's plan, and a "See plans" button would sell them a plan for their
 * own account instead, so the prompt says who to ask.
 */
const BillingOwner = createContext<string | null>(null);

export function BillingOwnerProvider({ ownerName, children }: { ownerName: string | null; children: React.ReactNode }) {
  return <BillingOwner.Provider value={ownerName}>{children}</BillingOwner.Provider>;
}

export function useBillingOwner(): string | null {
  return useContext(BillingOwner);
}
