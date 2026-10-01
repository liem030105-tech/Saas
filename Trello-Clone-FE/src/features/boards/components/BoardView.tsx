import { type BoardDetailDto, type UserSummary } from '@trello-clone/shared';
import { type ReactNode } from 'react';

import { BoardHeader } from './BoardHeader';
import { readableTextColor } from '../colors';

interface BoardViewProps {
  board: BoardDetailDto;
  canEdit: boolean;
  canDelete: boolean;
  onDeleted: () => void;
  /** The workspace's members, for the activity feed (CARD-005e). */
  members: readonly UserSummary[];
  /** The board's lists (the page composes them from the lists feature, LIST-001). */
  children: ReactNode;
}

/**
 * The board page body (docs/design/ui.md → Board): the board colour fills the page, the header
 * sits on top, an archived board says so, and the lists fill the rest.
 */
export function BoardView({
  board,
  canEdit,
  canDelete,
  onDeleted,
  members,
  children,
}: BoardViewProps) {
  const color = readableTextColor(board.background);

  return (
    <main className="flex min-h-full flex-1 flex-col" style={{ backgroundColor: board.background }}>
      <BoardHeader
        board={board}
        canEdit={canEdit}
        canDelete={canDelete}
        onDeleted={onDeleted}
        members={members}
      />
      {board.archived && (
        <p
          role="status"
          className="mx-4 rounded-md bg-background/90 px-3 py-2 text-sm text-foreground"
        >
          This board is archived.
          {canEdit ? ' Unarchive it to show it with the open boards again.' : ''}
        </p>
      )}
      <div className="flex flex-1 flex-col" style={{ color }}>
        {children}
      </div>
    </main>
  );
}
