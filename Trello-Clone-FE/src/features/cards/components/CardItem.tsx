import { CheckIcon, ClockIcon, ListChecksIcon, MessageSquareIcon } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router';

import { UserAvatar } from '@/components/ui/UserAvatar';
import { cn } from '@/lib/utils';

import { formatDueDate, isOverdue } from '../dates';
import { labelText } from '../labels';
import { cardPath } from '../paths';
import { isOptimisticCard } from '../queries';
import { useCardTileData } from '../tileContext';

import type { CardSummaryDto } from '@trello-clone/shared';
import type { HTMLAttributes } from 'react';

/** Avatars shown on a tile; more members show as "+n" (docs/design/ui.md → Card tile). */
const MAX_AVATARS = 3;

/**
 * A card tile in a list (docs/design/ui.md → Card tile): its title (at most three lines) and the
 * due-date badge (red when overdue, green when completed). It opens the card modal and, for a
 * member, can be dragged (CARD-004); a card still being created has no id to open or move yet.
 * Label chips (colour only; CARD-005a) sit above the title and member avatars (CARD-005b, at most
 * three, then "+n") below it; the checklist badge (`done/total`, green when all are done;
 * CARD-005c) follows the due date, then the comment count (CARD-005d).
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
  const tileData = useCardTileData();
  const labels = card.labelIds.flatMap((id) => tileData.labels.filter((label) => label.id === id));
  const members = card.memberIds.flatMap((id) => tileData.members.filter((user) => user.id === id));
  const body = (
    <>
      {labels.length > 0 && (
        <span className="mb-1 flex flex-wrap gap-1">
          {labels.map((label) => (
            <span
              key={label.id}
              aria-hidden="true"
              title={labelText(label)}
              className="h-2 w-10 rounded-full"
              style={{ backgroundColor: label.color }}
            />
          ))}
        </span>
      )}
      <p className="line-clamp-3 break-words">{card.title}</p>
      {labels.length > 0 && (
        <span className="sr-only">Labels: {labels.map(labelText).join(', ')}</span>
      )}
      {(card.dueDate || card.completed || card.checklist.total > 0 || card.commentCount > 0) && (
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
          ) : card.completed ? (
            <span className="inline-flex items-center gap-1 rounded bg-green-700 px-1.5 py-0.5 text-white">
              <CheckIcon aria-hidden="true" className="size-3" />
              Completed
            </span>
          ) : null}
          {card.checklist.total > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-1 rounded px-1.5 py-0.5',
                card.checklist.done === card.checklist.total
                  ? 'bg-green-700 text-white'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <ListChecksIcon aria-hidden="true" className="size-3" />
              <span className="sr-only">
                Checklist: {card.checklist.done} of {card.checklist.total} items done
              </span>
              <span aria-hidden="true">
                {card.checklist.done}/{card.checklist.total}
              </span>
            </span>
          )}
          {card.commentCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-muted-foreground">
              <MessageSquareIcon aria-hidden="true" className="size-3" />
              <span className="sr-only">Comments:</span>
              {card.commentCount}
            </span>
          )}
        </p>
      )}
      {members.length > 0 && (
        <span className="mt-1 flex justify-end -space-x-1.5">
          {members.slice(0, MAX_AVATARS).map((user) => (
            <UserAvatar key={user.id} user={user} size="sm" className="ring-2 ring-card" />
          ))}
          {members.length > MAX_AVATARS && (
            <span
              aria-hidden="true"
              className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-xs ring-2 ring-card"
            >
              +{members.length - MAX_AVATARS}
            </span>
          )}
          <span className="sr-only">Members: {members.map((user) => user.name).join(', ')}</span>
        </span>
      )}
    </>
  );
  // The board's filters (SEARCH-001): matching tiles are outlined, the others dimmed.
  const filtered = overlay ? null : (tileData.matches ?? null);
  const filterNoteId = useId();
  const match = filtered?.has(card.id) ?? false;
  const tile = cn(
    'block rounded-md bg-card px-3 py-2 text-sm text-card-foreground shadow-sm transition-opacity',
    filtered && (match ? 'ring-2 ring-amber-400' : 'opacity-40'),
  );

  if (overlay) {
    return (
      <div aria-hidden="true" className={cn(tile, 'rotate-3 cursor-grabbing shadow-lg')}>
        {body}
      </div>
    );
  }
  return (
    <article
      aria-label={card.title}
      aria-busy={pending || undefined}
      aria-describedby={filtered ? filterNoteId : undefined}
    >
      {filtered && (
        <span id={filterNoteId} className="sr-only">
          {match ? 'Matches the filters' : "Doesn't match the filters"}
        </span>
      )}
      {pending ? (
        <div className={cn(tile, !(filtered && !match) && 'opacity-70')}>{body}</div>
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
