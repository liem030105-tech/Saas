import { AddListComposer } from './AddListComposer';
import { isOptimisticList } from '../queries';
import { ListColumn } from './ListColumn';

import type { BoardDetailDto } from '@trello-clone/shared';

interface BoardListsProps {
  board: BoardDetailDto;
  /** Add, rename, archive and delete lists (≥ MEMBER; UX only, the API re-checks). */
  canEdit: boolean;
}

/**
 * The board's lists, left to right in `position` order, then the composer; the row scrolls
 * horizontally (docs/design/ui.md → Board).
 */
export function BoardLists({ board, canEdit }: BoardListsProps) {
  const { lists } = board;

  if (lists.length === 0 && !canEdit) {
    return <p className="px-6 py-4 text-sm">No lists yet.</p>;
  }
  return (
    <div className="flex flex-1 items-start gap-3 overflow-x-auto px-4 pt-2 pb-4">
      {lists.length > 0 && (
        <ol aria-label="Lists" className="flex items-start gap-3">
          {lists.map((list) => (
            <li key={list.id}>
              {/* A list still being created has no real id yet: read-only until the server answers. */}
              <ListColumn list={list} canEdit={canEdit && !isOptimisticList(list)} />
            </li>
          ))}
        </ol>
      )}
      {canEdit && <AddListComposer boardId={board.id} listCount={lists.length} />}
    </div>
  );
}
