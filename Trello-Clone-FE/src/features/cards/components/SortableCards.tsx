import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';

import { cardsDropId } from '../dnd';
import { isOptimisticCard } from '../queries';
import { CardItem } from './CardItem';

import type { CardSummaryDto } from '@trello-clone/shared';

interface SortableCardsProps {
  boardId: string;
  listId: string;
  listTitle: string;
  cards: CardSummaryDto[];
  /** Drag cards (≥ MEMBER; UX only, the API re-checks). */
  canEdit: boolean;
}

/**
 * A list's cards as a vertical sortable group inside the board's DndContext (CARD-004). The group
 * itself is a drop target, so a card can be dropped into an empty list.
 */
export function SortableCards({ boardId, listId, listTitle, cards, canEdit }: SortableCardsProps) {
  const { setNodeRef } = useDroppable({
    id: cardsDropId(listId),
    data: { type: 'card-list', listId },
    disabled: !canEdit,
  });

  return (
    <SortableContext items={cards.map((card) => card.id)} strategy={verticalListSortingStrategy}>
      <ol
        ref={setNodeRef}
        aria-label={`Cards in ${listTitle}`}
        className={cn('flex flex-col gap-2', canEdit && 'min-h-2')}
      >
        {cards.map((card) => (
          <SortableCard
            key={card.id}
            boardId={boardId}
            listId={listId}
            card={card}
            canEdit={canEdit && !isOptimisticCard(card)}
          />
        ))}
      </ol>
    </SortableContext>
  );
}

function SortableCard({
  boardId,
  listId,
  card,
  canEdit,
}: {
  boardId: string;
  listId: string;
  card: CardSummaryDto;
  canEdit: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', listId },
    disabled: !canEdit,
  });
  // The tile stays a link (Enter opens the card): keep dnd-kit's drag instructions and listeners,
  // not its button role, tab stop or pressed state. Space picks the card up (SortableLists).
  const describedBy = { 'aria-describedby': attributes['aria-describedby'] };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      // While dragged, the tile stays as a placeholder; the DragOverlay follows the pointer.
      className={cn(isDragging && 'opacity-40')}
    >
      <CardItem
        boardId={boardId}
        card={card}
        dragProps={canEdit ? { ...describedBy, ...listeners } : undefined}
      />
    </li>
  );
}
