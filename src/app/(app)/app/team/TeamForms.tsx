"use client";

import { useActionState } from "react";
import {
  changeRoleAction,
  inviteAction,
  leaveTeamAction,
  removeMemberAction,
  revokeInviteAction,
  type TeamState,
} from "./actions";
import { inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/controls";
import { useSuccessToast } from "@/components/notify";

function InlineError({ message }: { message?: string }) {
  return message ? (
    <p role="alert" className="mt-2 text-sm text-[var(--struck-ink)]">
      {message}
    </p>
  ) : null;
}

/** Invite by email. The email goes out when this succeeds; the toast says so. */
export function InviteForm() {
  const [state, action, pending] = useActionState(inviteAction, {} as TeamState);
  useSuccessToast(state, "invite", (s) =>
    s.sent ? { title: "Invitation sent", description: `We emailed ${s.sent} a link that works for 7 days.` } : null
  );

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <label htmlFor="invite-email" className="mb-1 block text-sm">
            Email address
          </label>
          <input
            id="invite-email"
            name="email"
            type="email"
            required
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            inputMode="email"
            className={inputClass}
          />
        </div>
        <fieldset>
          <legend className="mb-1 block text-sm">Role</legend>
          <div className="flex gap-2">
            {(["editor", "viewer"] as const).map((role) => (
              <label
                key={role}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-[var(--paper-rule)] bg-white px-3 py-2 text-sm has-[:checked]:border-[var(--paper-ink)]"
              >
                <input type="radio" name="role" value={role} defaultChecked={role === "editor"} required />
                {role === "editor" ? "Editor" : "Viewer"}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="text-xs leading-relaxed text-[var(--paper-soft)]">
        Editors make and change codes. Viewers see codes and scans, and download images and
        spreadsheets. Only you invite people, remove them and handle billing. Everyone signs in with
        their own password.
      </p>
      <InlineError message={state.error} />
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </form>
  );
}

export function RevokeInvite({ inviteId, email }: { inviteId: string; email: string }) {
  const [state, action, pending] = useActionState(revokeInviteAction, {} as TeamState);
  useSuccessToast(state, `revoke-${inviteId}`, (s) => (s.saved ? { title: "Invitation cancelled" } : null));
  return (
    <form action={action}>
      <input type="hidden" name="inviteId" value={inviteId} />
      <button type="submit" disabled={pending} className="text-sm underline underline-offset-4">
        Cancel<span className="sr-only"> the invitation to {email}</span>
      </button>
      <InlineError message={state.error} />
    </form>
  );
}

export function MemberControls({ memberId, name, role }: { memberId: string; name: string; role: string }) {
  const [roleState, roleAction, rolePending] = useActionState(changeRoleAction, {} as TeamState);
  const [removeState, removeAction, removePending] = useActionState(removeMemberAction, {} as TeamState);
  useSuccessToast(roleState, `role-${memberId}`, (s) => (s.saved ? { title: "Role changed" } : null));
  useSuccessToast(removeState, `remove-${memberId}`, (s) =>
    s.saved ? { title: `${name} removed`, description: "Anything they made stays in your account." } : null
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={roleAction} className="flex items-center gap-2">
        <input type="hidden" name="memberId" value={memberId} />
        <label className="sr-only" htmlFor={`role-${memberId}`}>
          Role for {name}
        </label>
        <select
          id={`role-${memberId}`}
          name="role"
          defaultValue={role === "viewer" ? "viewer" : "editor"}
          className="rounded-md border border-[var(--paper-rule)] bg-white px-2 py-1.5 text-sm"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button type="submit" disabled={rolePending} className={secondaryButtonClass}>
          Save
        </button>
      </form>
      <form
        action={removeAction}
        onSubmit={(event) => {
          if (!window.confirm(`Remove ${name} from your team? They lose access at once.`)) event.preventDefault();
        }}
      >
        <input type="hidden" name="memberId" value={memberId} />
        <button type="submit" disabled={removePending} className="text-sm text-[var(--struck-ink)] underline underline-offset-4">
          Remove<span className="sr-only"> {name}</span>
        </button>
      </form>
      <InlineError message={roleState.error ?? removeState.error} />
    </div>
  );
}

export function LeaveTeam({ ownerName }: { ownerName: string }) {
  const [state, action, pending] = useActionState(leaveTeamAction, {} as TeamState);
  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(`Leave ${ownerName}'s team? You will need a new invitation to come back.`)) {
          event.preventDefault();
        }
      }}
    >
      <button type="submit" disabled={pending} className={secondaryButtonClass}>
        {pending ? "Leaving…" : "Leave this team"}
      </button>
      <InlineError message={state.error} />
    </form>
  );
}
