"use client";

import { useActionState } from "react";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { PLAN_FEATURES } from "@/lib/plan-features";
import type { PlanFeatures } from "@/lib/plans";
import {
  connectPaystackAction,
  createPlanAction,
  savePlanAction,
  type AdminFormState,
} from "../actions";

export type PlanFormValues = {
  id?: number;
  slug: string;
  name: string;
  amountNaira: number;
  interval: "monthly" | "annually";
  maxCodes: number;
  historyDays: number;
  graceDays: number;
  sortOrder: number;
  isActive: boolean;
  features: PlanFeatures;
  /** Null until connected. While null, price and interval stay editable. */
  paystackPlanCode: string | null;
};

const label = "mb-1 block text-xs text-[var(--paper-soft)]";

/**
 * One form for creating and editing a plan. Price and interval are inputs
 * only while the plan has no Paystack code; after that they are shown as text,
 * because Paystack charges its own copy of the price.
 */
export function PlanForm({ plan }: { plan: PlanFormValues }) {
  const creating = plan.id === undefined;
  const [state, action, pending] = useActionState<AdminFormState, FormData>(
    creating ? createPlanAction : savePlanAction,
    {}
  );
  const priceLocked = plan.paystackPlanCode !== null;

  return (
    <form action={action} className="max-w-3xl space-y-8">
      {plan.id !== undefined ? <input type="hidden" name="planId" value={plan.id} /> : null}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">Plan</legend>
        <div>
          <label htmlFor="plan-name" className={label}>Name, as customers see it</label>
          <input id="plan-name" name="name" defaultValue={plan.name} required maxLength={40} className={inputClass} />
        </div>
        <div>
          <label htmlFor="plan-slug" className={label}>Slug</label>
          {creating ? (
            <input
              id="plan-slug"
              name="slug"
              defaultValue={plan.slug}
              required
              maxLength={48}
              placeholder="pro-monthly"
              className={`${inputClass} font-mono`}
            />
          ) : (
            <p id="plan-slug" className="py-2 font-mono text-sm">{plan.slug}</p>
          )}
        </div>

        <div>
          <label htmlFor="plan-price" className={label}>Price in naira</label>
          {priceLocked ? (
            <p id="plan-price" className="py-2 text-sm">₦{plan.amountNaira.toLocaleString("en-NG")}</p>
          ) : (
            <input
              id="plan-price"
              name="amountNaira"
              type="number"
              min={0}
              step={1}
              defaultValue={plan.amountNaira}
              required
              className={inputClass}
            />
          )}
        </div>
        <div>
          <label htmlFor="plan-interval" className={label}>Billed</label>
          {priceLocked ? (
            <p id="plan-interval" className="py-2 text-sm">{plan.interval === "annually" ? "Annually" : "Monthly"}</p>
          ) : (
            <select id="plan-interval" name="interval" defaultValue={plan.interval} className={inputClass}>
              <option value="monthly">Monthly</option>
              <option value="annually">Annually</option>
            </select>
          )}
        </div>
        {priceLocked ? (
          <p className="text-xs leading-relaxed text-[var(--paper-soft)] sm:col-span-2">
            Connected to Paystack as <span className="font-mono">{plan.paystackPlanCode}</span>, so the price and
            interval are fixed. To charge a different price, create a new plan and retire this one.
          </p>
        ) : null}
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-4">
        <legend className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">Limits</legend>
        <NumberField id="plan-codes" name="maxCodes" label="Dynamic codes" value={plan.maxCodes} min={0} />
        <NumberField id="plan-history" name="historyDays" label="Scan history, days" value={plan.historyDays} min={1} />
        <NumberField id="plan-grace" name="graceDays" label="Grace, days" value={plan.graceDays} min={0} max={90} />
        <NumberField id="plan-sort" name="sortOrder" label="Sort order" value={plan.sortOrder} min={0} />
      </fieldset>

      <fieldset>
        <legend className="mb-3 text-xs uppercase tracking-[0.12em] text-[var(--paper-soft)]">Features</legend>
        <ul className="divide-y divide-[var(--paper-rule)] rounded-lg border border-[var(--paper-rule)] bg-white">
          {PLAN_FEATURES.map((def) => {
            const id = `feature-${def.key}`;
            const value = plan.features[def.key];
            return (
              <li key={def.key} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="text-sm font-medium">
                    {def.label}
                    {def.built ? null : (
                      <span className="ml-2 rounded border border-[var(--paper-rule)] px-1.5 py-px text-[11px] font-normal text-[var(--paper-soft)]">
                        not built
                      </span>
                    )}
                  </label>
                  <p className="mt-0.5 text-xs text-[var(--paper-soft)]">{def.help}</p>
                </div>
                <div className="shrink-0">
                  {def.kind === "boolean" ? (
                    <input id={id} name={`feature:${def.key}`} type="checkbox" defaultChecked={value === true} className="h-4 w-4" />
                  ) : def.kind === "choice" ? (
                    <select id={id} name={`feature:${def.key}`} defaultValue={typeof value === "string" ? value : ""} className={`${inputClass} w-auto`}>
                      <option value="">None</option>
                      {Object.entries(def.options).map(([key, text]) => (
                        <option key={key} value={key}>{text}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={id}
                      name={`feature:${def.key}`}
                      type="number"
                      min={def.min}
                      max={def.max}
                      defaultValue={typeof value === "number" ? value : ""}
                      className={`${inputClass} w-24`}
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <label className="flex items-center gap-2.5 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={plan.isActive} className="h-4 w-4" />
        On sale. Unticking retires the plan: nobody new can choose it, and everyone on it keeps it.
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending ? "Saving…" : creating ? "Create plan" : "Save changes"}
        </button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

function NumberField({
  id,
  name,
  label: text,
  value,
  min,
  max,
}: {
  id: string;
  name: string;
  label: string;
  value: number;
  min: number;
  max?: number;
}) {
  return (
    <div>
      <label htmlFor={id} className={label}>{text}</label>
      <input id={id} name={name} type="number" min={min} max={max} step={1} defaultValue={value} required className={inputClass} />
    </div>
  );
}

function Feedback({ state }: { state: AdminFormState }) {
  if (state.error) return <p role="alert" className="text-sm text-[var(--struck-ink)]">{state.error}</p>;
  if (state.notice) return <p role="status" className="text-sm text-[var(--live-ink)]">{state.notice}</p>;
  return null;
}

/** Create or adopt this plan in Paystack, which is what makes it purchasable. */
export function ConnectPaystack({ planId }: { planId: number }) {
  const [state, action, pending] = useActionState<AdminFormState, FormData>(connectPaystackAction, {});
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="planId" value={planId} />
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Connecting…" : "Connect to Paystack"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
