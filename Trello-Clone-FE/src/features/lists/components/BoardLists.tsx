import { AddListComposer } from './AddListComposer';
import { SortableLists } from './SortableLists';

import type { BoardDetailDto } from '@trello-clone/shared';

interface BoardListsProps {
  board: BoardDetailDto;
  /** Add, rename, move, archive and delete lists (≥ MEMBER; UX only, the API re-checks). */
  canEdit: boolean;
}

/**
 * The board's lists, left to right in `position` order (drag to reorder, LIST-003), then the
 * composer; the row scrolls horizontally (docs/design/ui.md → Board).
 */
export function BoardLists({ board, canEdit }: BoardListsProps) {
  const { lists } = board;

  if (lists.length === 0 && !canEdit) {
    return <p className="px-6 py-4 text-sm">No lists yet.</p>;
  }
  return (
    <div className="flex flex-1 items-start gap-3 overflow-x-auto px-4 pt-2 pb-4">
      {lists.length > 0 && <SortableLists boardId={board.id} lists={lists} canEdit={canEdit} />}
      {canEdit && <AddListComposer boardId={board.id} listCount={lists.length} />}
    </div>
  );
}
