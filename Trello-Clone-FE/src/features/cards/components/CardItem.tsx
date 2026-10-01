import { CheckIcon, ClockIcon } from 'lucide-react';
import { Link } from 'react-router';

import { cn } from '@/lib/utils';

import { formatDueDate, isOverdue } from '../dates';
import { cardPath } from '../paths';
import { isOptimisticCard } from '../queries';

import type { CardSummaryDto } from '@trello-clone/shared';
import type { HTMLAttributes } from 'react';

/**
 * A card tile in a list (docs/design/ui.md → Card tile): its title (at most three lines) and the
 * due-date badge (red when overdue, green when completed). It opens the card modal and, for a
 * member, can be dragged (CARD-004); a card still being created has no id to open or move yet.
 * Labels and the other badges arrive with CARD-005.
 */
interface CardItemProps {
  boardId: string;
  card: CardSummaryDto;
  /** dnd-kit's listeners and description for dragging this tile (absent when it cannot move). */
  dragProps?: HTMLAttributes<HTMLElement>;
  /** The copy that follows the pointer while the card is dragged (DragOverlay): tilted. */
  overlay?: boolean;
}

export function CardItem({ boardId, card, dragProps, overlay = false }: CardItemProps) {
  const pending = isOptimisticCard(card);
  const overdue = isOverdue(card.dueDate, card.completed);
  const body = (
    <>
      <p className="line-clamp-3 break-words">{card.title}</p>
      {(card.dueDate || card.completed) && (
        <p className="mt-1 flex flex-wrap items-center gap-1 text-xs">
          {card.dueDate ? (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                card.completed && 'bg-green-700 text-white',
                overdue && 'bg-red-700 text-white',
                !card.completed && !overdue && 'bg-muted text-muted-foreground',
              )}
            >
              {card.completed ? (
                <CheckIcon aria-hidden="true" className="size-3" />
              ) : (
                <ClockIcon aria-hidden="true" className="size-3" />
              )}
              <span className="sr-only">
                {card.completed ? 'Completed, due' : overdue ? 'Overdue, due' : 'Due'}
              </span>
              {formatDueDate(card.dueDate)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded bg-green-700 px-1.5 py-0.5 text-white">
              <CheckIcon aria-hidden="true" className="size-3" />
              Completed
            </span>
          )}
        </p>
      )}
    </>
  );
  const tile = 'block rounded-md bg-card px-3 py-2 text-sm text-card-foreground shadow-sm';

  if (overlay) {
    return (
      <div aria-hidden="true" className={cn(tile, 'rotate-3 cursor-grabbing shadow-lg')}>
        {body}
      </div>
    );
  }
  return (
    <article aria-label={card.title} aria-busy={pending || undefined}>
      {pending ? (
        <div className={cn(tile, 'opacity-70')}>{body}</div>
      ) : (
        <Link
          {...dragProps}
          to={cardPath(boardId, card.id)}
          className={cn(
            tile,
            'hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
          )}
        >
          {body}
        </Link>
      )}
    </article>
  );
}
