import { toCardDetailDto } from './cards.mapper';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { appendPosition, lockContainer, settlePosition } from '../../lib/rebalance';
import { assertBoardAccess, logActivity, toCardSummaryDto } from '../boards/boards.service';

import type { WorkspaceAction } from '../workspaces/permissions';
import type {
  CardDetailDto,
  CardSummaryDto,
  CreateCardData,
  UpdateCardData,
} from '@trello-clone/shared';

// docs/api/cards.md. Every endpoint authorizes with assertBoardAccess on the stored board.

/** The list was deleted between the access check and the insert (a concurrent DELETE). */
const isMissingList = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/** The card was deleted between the access check and the write (a concurrent DELETE). */
const isMissingCard = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/**
 * Loads a card and checks the caller's role on its stored board (the denormalized `boardId`,
 * ADR-006). An unknown or malformed id and a card the caller cannot see are the same 404.
 */
async function assertCardAccess(userId: string, cardId: string, action: WorkspaceAction) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw AppError.notFound();
  await assertBoardAccess(userId, card.boardId, action);
  return card;
}

/**
 * POST /lists/:listId/cards (≥ MEMBER). The list resolves to its stored board, and the card's
 * `boardId` is copied from it (invariant I1; never from the client). Without `position` the card
 * goes after the list's last card (archived ones included); a client `position` goes through the
 * rebalance check. The list's cards are locked first, so concurrent adds to a list run in turn.
 * Logs CARD_CREATED with the card's id, in the same transaction.
 */
export async function create(
  userId: string,
  listId: string,
  input: CreateCardData,
): Promise<CardSummaryDto> {
  const list = await prisma.list.findUnique({ where: { id: listId }, select: { boardId: true } });
  if (!list) throw AppError.notFound();
  const { boardId } = list;
  await assertBoardAccess(userId, boardId, 'card.edit');
  try {
    const card = await prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'Card', 'listId', listId);
      const position = input.position ?? (await appendPosition(tx, 'Card', 'listId', listId));
      let created = await tx.card.create({
        data: { boardId, listId, title: input.title, position },
      });
      if (input.position !== undefined) {
        created = {
          ...created,
          position: await settlePosition(tx, 'Card', 'listId', listId, created.id),
        };
      }
      await logActivity(tx, {
        boardId,
        userId,
        cardId: created.id,
        type: 'CARD_CREATED',
        data: { listId, title: created.title },
      });
      return created;
    });
    return toCardSummaryDto(card); // realtime emit (REALTIME-001) goes here, after the commit
  } catch (error) {
    if (isMissingList(error)) throw AppError.notFound();
    throw error;
  }
}

/** GET /cards/:cardId (≥ VIEWER). Archived cards are returned (the modal shows a banner). */
export async function get(userId: string, cardId: string): Promise<CardDetailDto> {
  const card = await assertCardAccess(userId, cardId, 'card.view');
  return toCardDetailDto(card, toCardSummaryDto(card));
}

/**
 * PATCH /cards/:cardId (≥ MEMBER): title, description, due date, completed, archived. Archiving an
 * open card logs CARD_ARCHIVED, anything else CARD_UPDATED, with the changed fields (the due date
 * as stored, in UTC; the description as a flag only, so the log never copies long text), in the
 * same transaction.
 */
export async function update(
  userId: string,
  cardId: string,
  input: UpdateCardData,
): Promise<CardDetailDto> {
  const current = await assertCardAccess(userId, cardId, 'card.edit');
  const { boardId } = current;
  const changes = {
    ...(input.title !== undefined && { title: input.title }),
    ...(input.description !== undefined && { description: input.description }),
    ...(input.dueDate !== undefined && {
      dueDate: input.dueDate === null ? null : new Date(input.dueDate),
    }),
    ...(input.completed !== undefined && { completed: input.completed }),
    ...(input.archived !== undefined && { archived: input.archived }),
  };
  try {
    const card = await prisma.$transaction(async (tx) => {
      const updated = await tx.card.update({ where: { id: cardId }, data: changes });
      await logActivity(tx, {
        boardId,
        userId,
        cardId,
        // CARD_ARCHIVED only when the card goes from open to archived, so the feed has no repeats.
        type: changes.archived === true && !current.archived ? 'CARD_ARCHIVED' : 'CARD_UPDATED',
        data: {
          ...(input.title !== undefined && { title: input.title }),
          // Logged as stored (UTC), whatever offset the client sent.
          ...(changes.dueDate !== undefined && {
            dueDate: changes.dueDate === null ? null : changes.dueDate.toISOString(),
          }),
          ...(input.completed !== undefined && { completed: input.completed }),
          ...(input.archived !== undefined && { archived: input.archived }),
          // The description changed: a flag only, so the log never copies long text.
          ...(input.description !== undefined && { description: true }),
        },
      });
      return updated;
    });
    return toCardDetailDto(card, toCardSummaryDto(card));
  } catch (error) {
    if (isMissingCard(error)) throw AppError.notFound();
    throw error;
  }
}

/**
 * DELETE /cards/:cardId (≥ MEMBER). Its activity stays on the board with `cardId` set to null
 * (docs/database/relationships.md); nothing else is logged.
 */
export async function remove(userId: string, cardId: string): Promise<void> {
  await assertCardAccess(userId, cardId, 'card.edit');
  try {
    await prisma.card.delete({ where: { id: cardId } });
  } catch (error) {
    if (isMissingCard(error)) throw AppError.notFound();
    throw error;
  }
}
