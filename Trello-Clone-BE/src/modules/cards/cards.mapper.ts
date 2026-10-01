import type { Card, Checklist, ChecklistItem } from '../../generated/prisma/client';
import type {
  CardDetailDto,
  CardSummaryDto,
  ChecklistDto,
  ChecklistItemDto,
  LabelDto,
  UserSummary,
} from '@trello-clone/shared';

/**
 * docs/api/cards.md → CardDetailDto: the board's CardSummaryDto (owned by the boards module) plus
 * the card's own fields, its labels (mapped by the boards module, which owns LabelDto), members
 * and checklists. Attachments arrive with ATTACHMENTS-001; until then that array is empty.
 */
export function toCardDetailDto(
  card: Card,
  summary: CardSummaryDto,
  {
    labels,
    members,
    checklists,
  }: { labels: LabelDto[]; members: UserSummary[]; checklists: ChecklistDto[] },
): CardDetailDto {
  return {
    ...summary,
    boardId: card.boardId,
    description: card.description,
    archived: card.archived,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
    members,
    labels,
    checklists,
    attachments: [],
  };
}

/** docs/api/cards.md → ChecklistItemDto. */
export function toChecklistItemDto(item: ChecklistItem): ChecklistItemDto {
  return { id: item.id, content: item.content, done: item.done, position: item.position };
}

/** docs/api/cards.md → ChecklistDto, with its items in `position, id` order. */
export function toChecklistDto(checklist: Checklist & { items: ChecklistItem[] }): ChecklistDto {
  return {
    id: checklist.id,
    title: checklist.title,
    position: checklist.position,
    items: checklist.items.map(toChecklistItemDto),
  };
}
