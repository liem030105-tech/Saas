import { type MemberDto, type Role, type WorkspaceDto } from '@trello-clone/shared';
import { toast } from 'sonner';

import { initials } from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';

import { ConfirmDialog } from './ConfirmDialog';
import { memberErrorMessage } from '../memberErrors';
import { assignableRoles, canManageMember } from '../permissions';
import { useChangeMemberRole, useRemoveMember } from '../queries';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
  VIEWER: 'Viewer',
};

const ROLE_ERROR = "Couldn't change the role. Check your connection and try again.";
const REMOVE_ERROR = "Couldn't remove the member. Check your connection and try again.";

interface MemberRowProps {
  member: MemberDto;
  workspace: WorkspaceDto;
  isSelf: boolean;
}

/**
 * One member: avatar, name, email, and role. The role dropdown and "Remove" appear only when the
 * caller may manage this member (UX only; the API enforces the same rules).
 */
export function MemberRow({ member, workspace, isSelf }: MemberRowProps) {
  const changeRole = useChangeMemberRole(workspace.id);
  const removeMember = useRemoveMember(workspace.id);
  const { user } = member;
  const manageable = !isSelf && canManageMember(workspace.role, member.role);

  const onRoleChange = (role: Role) => {
    changeRole.mutate(
      { userId: user.id, role },
      { onError: (error) => toast.error(memberErrorMessage(error, ROLE_ERROR)) },
    );
  };

  const onRemove = async () => {
    try {
      await removeMember.mutateAsync(user.id);
      toast.success(`${user.name} was removed from the workspace.`);
      return null;
    } catch (error) {
      return memberErrorMessage(error, REMOVE_ERROR);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <Avatar>
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
        <AvatarFallback>{initials(user.name)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">
          {user.name}
          {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
        </span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </div>
      {manageable ? (
        <select
          aria-label={`Role for ${user.name}`}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
          value={member.role}
          disabled={changeRole.isPending}
          onChange={(event) => onRoleChange(event.target.value as Role)}
        >
          {assignableRoles(workspace.role).map((role) => (
            <option key={role} value={role}>
              {ROLE_LABELS[role]}
            </option>
          ))}
        </select>
      ) : (
        <span className="text-sm text-muted-foreground">{ROLE_LABELS[member.role]}</span>
      )}
      {manageable && (
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm" aria-label={`Remove ${user.name}`}>
              Remove
            </Button>
          }
          title={`Remove ${user.name}?`}
          description={`${user.name} loses access to ${workspace.name} and all its boards.`}
          confirmLabel="Remove"
          pendingLabel="Removing…"
          onConfirm={onRemove}
        />
      )}
    </li>
  );
}
