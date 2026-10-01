import { GripVerticalIcon } from 'lucide-react';

import { AddCardComposer, CardItem } from '@/features/cards';

import { ListHeader } from './ListHeader';

import type { BoardDetailDto } from '@trello-clone/shared';
import type { HTMLAttributes } from 'react';

interface ListColumnProps {
  list: BoardDetailDto['lists'][number];
  canEdit: boolean;
  /** The drag handle's ref and props from useSortable; absent when the list cannot move. */
  dragHandle?: {
    ref: (element: HTMLElement | null) => void;
    props: HTMLAttributes<HTMLElement>;
  };
}

/** One list on the board (docs/design/ui.md → Board): its header, its cards, then "Add a card". */
export function ListColumn({ list, canEdit, dragHandle }: ListColumnProps) {
  return (
    <section
      aria-label={list.title}
      className="flex w-[272px] shrink-0 flex-col gap-2 rounded-lg bg-muted p-2 text-foreground shadow-sm"
    >
      <div className="flex items-start gap-1">
        {dragHandle && (
          <button
            type="button"
            ref={dragHandle.ref}
            {...dragHandle.props}
            aria-label={`Move list ${list.title}`}
            className="mt-1 flex size-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:cursor-grabbing"
          >
            <GripVerticalIcon aria-hidden="true" className="size-4" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <ListHeader list={list} canEdit={canEdit} />
        </div>
      </div>
      {list.cards.length > 0 && (
        <ol aria-label={`Cards in ${list.title}`} className="flex flex-col gap-2">
          {list.cards.map((card) => (
            <li key={card.id}>
              <CardItem boardId={list.boardId} card={card} />
            </li>
          ))}
        </ol>
      )}
      {canEdit && (
        <AddCardComposer boardId={list.boardId} listId={list.id} listTitle={list.title} />
      )}
    </section>
  );
}
