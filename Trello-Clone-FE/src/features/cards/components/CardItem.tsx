import { cn } from '@/lib/utils';

import { isOptimisticCard } from '../queries';

import type { CardSummaryDto } from '@trello-clone/shared';

/**
 * A card tile in a list (docs/design/ui.md → Card tile): its title, at most three lines. Labels,
 * badges and opening the card arrive with CARD-002 and CARD-005.
 */
export function CardItem({ card }: { card: CardSummaryDto }) {
  return (
    <article
      aria-label={card.title}
      aria-busy={isOptimisticCard(card) || undefined}
      className={cn(
        'rounded-md bg-card px-3 py-2 text-sm text-card-foreground shadow-sm',
        isOptimisticCard(card) && 'opacity-70',
      )}
    >
      <p className="line-clamp-3 break-words">{card.title}</p>
    </article>
  );
}
