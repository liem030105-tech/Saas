import { type MemberDto, type Role, type WorkspaceDto } from '@trello-clone/shared';
import { ChevronDownIcon } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { initials } from '@/components/layout/Header';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { memberErrorMessage } from '../memberErrors';
import { assignableRoles, canManageMember } from '../permissions';
import { useChangeMemberRole, useRemoveMember } from '../queries';
import { ROLE_LABELS } from '../roleLabels';

const ROLE_ERROR = "Couldn't change the role. Check your connection and try again.";
const REMOVE_ERROR = "Couldn't remove the member. Check your connection and try again.";

interface MemberRowProps {
  member: MemberDto;
  workspace: WorkspaceDto;
  isSelf: boolean;
}

/**
 * One member: avatar, name, email, and role. The role menu and "Remove" appear only when the
 * caller may manage this member (UX only; the API enforces the same rules).
 */
export function MemberRow({ member, workspace, isSelf }: MemberRowProps) {
  const changeRole = useChangeMemberRole(workspace.id);
  const removeMember = useRemoveMember(workspace.id);
  const { user } = member;
  const manageable = !isSelf && canManageMember(workspace.role, member.role);

  const onRoleChange = (role: Role) => {
    if (role === member.role) return;
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              aria-label={`Role for ${user.name}`}
              disabled={changeRole.isPending}
            >
              {ROLE_LABELS[member.role]}
              <ChevronDownIcon aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup
              value={member.role}
              onValueChange={(value) => onRoleChange(value as Role)}
            >
              {assignableRoles(workspace.role).map((role) => (
                <DropdownMenuRadioItem key={role} value={role}>
                  {ROLE_LABELS[role]}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
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
