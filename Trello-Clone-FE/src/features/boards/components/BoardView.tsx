import { type BoardDetailDto } from '@trello-clone/shared';

import { BoardHeader } from './BoardHeader';
import { readableTextColor } from '../colors';

interface BoardViewProps {
  board: BoardDetailDto;
  canEdit: boolean;
  canDelete: boolean;
  onDeleted: () => void;
}

/**
 * The board page body (docs/design/ui.md → Board): the board colour fills the page, the header
 * sits on top, and an archived board says so. Lists arrive with LIST-001.
 */
export function BoardView({ board, canEdit, canDelete, onDeleted }: BoardViewProps) {
  const color = readableTextColor(board.background);

  return (
    <main className="flex min-h-full flex-1 flex-col" style={{ backgroundColor: board.background }}>
      <BoardHeader board={board} canEdit={canEdit} canDelete={canDelete} onDeleted={onDeleted} />
      {board.archived && (
        <p
          role="status"
          className="mx-4 rounded-md bg-background/90 px-3 py-2 text-sm text-foreground"
        >
          This board is archived.
          {canEdit ? ' Unarchive it to show it with the open boards again.' : ''}
        </p>
      )}
      <p className="px-6 py-4 text-sm" style={{ color }}>
        No lists yet.
      </p>
    </main>
  );
}
