import { type WorkspaceDto } from '@trello-clone/shared';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/features/auth';

import { ConfirmDialog } from './ConfirmDialog';
import { InviteDialog } from './InviteDialog';
import { MemberRow } from './MemberRow';
import { PendingInvites } from './PendingInvites';
import { memberErrorMessage } from '../memberErrors';
import { can } from '../permissions';
import { useLeaveWorkspace, useMembers } from '../queries';

const LEAVE_ERROR = "Couldn't leave the workspace. Check your connection and try again.";

/**
 * The body of `/w/:slug/members`: invites (≥ ADMIN, WORKSPACE-004), the member list, and "Leave
 * workspace" (WORKSPACE-003).
 */
export function MembersList({ workspace }: { workspace: WorkspaceDto }) {
  const { data: members, isPending, isError, refetch } = useMembers(workspace.id);
  const { data: me } = useCurrentUser();

  if (isPending) {
    return (
      <div aria-busy="true" className="flex max-w-2xl flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="h-12 animate-pulse rounded bg-card" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">Couldn&apos;t load the members.</p>
        <button
          type="button"
          className="text-sm font-medium underline underline-offset-4"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      {can(workspace.role, 'invites.manage') && <InviteDialog workspace={workspace} />}
      <ul aria-label="Members" className="divide-y">
        {members.map((member) => (
          <MemberRow
            key={member.user.id}
            member={member}
            workspace={workspace}
            isSelf={member.user.id === me?.id}
          />
        ))}
      </ul>
      {can(workspace.role, 'invites.manage') && <PendingInvites workspace={workspace} />}
      {me && <LeaveWorkspace workspace={workspace} userId={me.id} />}
    </div>
  );
}

function LeaveWorkspace({ workspace, userId }: { workspace: WorkspaceDto; userId: string }) {
  const leave = useLeaveWorkspace(workspace.id, userId);
  const navigate = useNavigate();

  const onLeave = async () => {
    try {
      await leave.mutateAsync();
    } catch (error) {
      return memberErrorMessage(error, LEAVE_ERROR);
    }
    toast.success(`You left ${workspace.name}.`);
    await navigate('/', { replace: true });
    return null;
  };

  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="self-start">
          Leave workspace
        </Button>
      }
      title={`Leave ${workspace.name}?`}
      description="You lose access to its boards until someone invites you again."
      confirmLabel="Leave workspace"
      pendingLabel="Leaving…"
      onConfirm={onLeave}
    />
  );
}
