import { UsersIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/ui/UserAvatar';

import { useToggleCardMember } from '../hooks/useMembers';

import type { UserSummary } from '@trello-clone/shared';

interface MemberPickerProps {
  boardId: string;
  cardId: string;
  /** The members of the board's workspace, who can be assigned; `undefined` while loading. */
  workspaceMembers: UserSummary[] | undefined;
  /** The members on the card. */
  cardMembers: UserSummary[];
}

/**
 * "Members" in the card modal (docs/design/ui.md → Card modal): a popover listing the workspace's
 * members as checkboxes (checked = on this card). Each checkbox keeps its own checked state, so it
 * changes the moment it is clicked (the optimistic cache update only lands after in-flight
 * queries are cancelled); the state is reset in place whenever the card's members change.
 */
export function MemberPicker({
  boardId,
  cardId,
  workspaceMembers,
  cardMembers,
}: MemberPickerProps) {
  const toggle = useToggleCardMember(boardId, cardId);
  const ids = cardMembers.map((user) => user.id);
  const [checked, setChecked] = useState({ ids: ids.join(), on: new Set(ids) });
  if (checked.ids !== ids.join()) setChecked({ ids: ids.join(), on: new Set(ids) });

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="justify-start">
          <UsersIcon aria-hidden="true" />
          Members
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" aria-label="Members" className="flex flex-col gap-3">
        <h4 className="text-center text-sm font-semibold">Members</h4>
        {workspaceMembers === undefined ? (
          <p className="text-sm text-muted-foreground" aria-busy="true">
            Loading members…
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {workspaceMembers.map((user) => (
              <li key={user.id}>
                <label className="flex items-center gap-2 rounded px-1 py-1 hover:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={checked.on.has(user.id)}
                    onChange={(event) => {
                      const on = event.target.checked;
                      setChecked((current) => {
                        const next = new Set(current.on);
                        if (on) next.add(user.id);
                        else next.delete(user.id);
                        return { ...current, on: next };
                      });
                      toggle.mutate({ item: user, on });
                    }}
                  />
                  <UserAvatar user={user} size="sm" />
                  <span className="truncate text-sm">{user.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
