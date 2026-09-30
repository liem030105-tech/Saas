import { type WorkspaceDto } from '@trello-clone/shared';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format-date';

import { memberErrorMessage } from '../memberErrors';
import { useInvites, useRevokeInvite } from '../queries';
import { ROLE_LABELS } from '../roleLabels';

const REVOKE_ERROR = "Couldn't revoke the invite. Check your connection and try again.";

/** Pending invites with "Revoke" (≥ ADMIN; the caller renders it only for them). */
export function PendingInvites({ workspace }: { workspace: WorkspaceDto }) {
  const { data: invites, isPending, isError, refetch } = useInvites(workspace.id);
  const revoke = useRevokeInvite(workspace.id);

  return (
    <section aria-labelledby="pending-invites-heading" className="flex flex-col gap-3">
      <h2 id="pending-invites-heading" className="text-lg font-semibold">
        Pending invites
      </h2>
      {isPending ? (
        <div aria-busy="true" className="h-10 animate-pulse rounded bg-card" />
      ) : isError ? (
        <div className="flex flex-col items-start gap-2 text-sm">
          <p role="alert">Couldn&apos;t load the invites.</p>
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : invites.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending invites.</p>
      ) : (
        <ul aria-label="Pending invites" className="divide-y">
          {invites.map((invite) => (
            <li key={invite.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{invite.email}</span>
                <span className="text-xs text-muted-foreground">
                  {ROLE_LABELS[invite.role]} · expires {formatDate(invite.expiresAt)}
                </span>
              </div>
              <ConfirmDialog
                trigger={
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Revoke invite for ${invite.email}`}
                  >
                    Revoke
                  </Button>
                }
                title={`Revoke the invite for ${invite.email}?`}
                description="The invite link stops working. You can invite them again later."
                confirmLabel="Revoke"
                pendingLabel="Revoking…"
                onConfirm={async () => {
                  try {
                    await revoke.mutateAsync(invite.id);
                    toast.success(`The invite for ${invite.email} was revoked.`);
                    return null;
                  } catch (error) {
                    return memberErrorMessage(error, REVOKE_ERROR);
                  }
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
