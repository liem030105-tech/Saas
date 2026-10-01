import type { Card } from '../../generated/prisma/client';
import type { CardDetailDto, CardSummaryDto, LabelDto } from '@trello-clone/shared';

/**
 * docs/api/cards.md → CardDetailDto: the board's CardSummaryDto (owned by the boards module) plus
 * the card's own fields and its labels (mapped by the boards module, which owns LabelDto). Members
 * and checklists arrive with the rest of CARD-005 and attachments with ATTACHMENTS-001; until
 * then those arrays are empty.
 */
export function toCardDetailDto(
  card: Card,
  summary: CardSummaryDto,
  labels: LabelDto[],
): CardDetailDto {
  return {
    ...summary,
    boardId: card.boardId,
    description: card.description,
    archived: card.archived,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    members: [],
    labels,
    checklists: [],
    attachments: [],
  };
}
