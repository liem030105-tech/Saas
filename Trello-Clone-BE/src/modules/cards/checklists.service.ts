import { toChecklistDto, toChecklistItemDto } from './cards.mapper';
import { assertCardAccess, emitCardChanged } from './cards.service';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { appendPosition, lockContainer, settlePosition } from '../../lib/rebalance';
import { assertBoardAccess, logActivity } from '../boards/boards.service';

import type {
  ChecklistDto,
  ChecklistItemDto,
  CreateChecklistData,
  CreateChecklistItemData,
  UpdateChecklistData,
  UpdateChecklistItemData,
} from '@trello-clone/shared';

// docs/api/cards.md → Checklists (CARD-005c). Every endpoint needs `card.assign` (≥ MEMBER) on
// the card's stored board; a checklist resolves to its card, an item to its checklist. Positions
// work like lists and cards: appended after the last one, a client position goes through the
// rebalance check, and the container's rows are locked first so concurrent writers run in turn.
// Adding or deleting a checklist and ticking or unticking an item log activity (D-25); renames,
// item adds and deletes, and moves do not.

/** A row the write points to (the card, the checklist) was deleted after the access check. */
const isMissingReference = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/** The row itself was deleted after the access check. */
const isMissingRow = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

const withNotFound = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    if (isMissingReference(error) || isMissingRow(error)) throw AppError.notFound();
    throw error;
  }
};

/**
 * Holds the card row (FOR KEY SHARE) before a write that logs activity: the log's foreign key
 * takes this lock anyway, and taking it first keeps the order a card delete uses (card, then its
 * checklists and items), so the two wait for each other instead of deadlocking.
 */
async function lockCard(tx: Prisma.TransactionClient, cardId: string) {
  const [card] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Card" WHERE "id" = ${cardId} FOR KEY SHARE`;
  if (!card) throw AppError.notFound();
}

const ITEMS = {
  items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ChecklistInclude;

/**
 * Loads a checklist and checks the caller's role on its card's stored board. An unknown or
 * malformed id and a checklist the caller cannot see are the same 404.
 */
async function assertChecklistAccess(userId: string, checklistId: string) {
  const checklist = await prisma.checklist.findUnique({
    where: { id: checklistId },
    select: { id: true, cardId: true, card: { select: { boardId: true } } },
  });
  if (!checklist) throw AppError.notFound();
  const { board } = await assertBoardAccess(userId, checklist.card.boardId, 'card.assign');
  return {
    id: checklist.id,
    cardId: checklist.cardId,
    boardId: checklist.card.boardId,
    workspaceId: board.workspaceId,
  };
}

/** Loads an item of a checklist the caller may edit; an item of another checklist is a 404. */
async function assertItemAccess(userId: string, checklistId: string, itemId: string) {
  const checklist = await assertChecklistAccess(userId, checklistId);
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, checklistId } });
  if (!item) throw AppError.notFound();
  return { item, checklist };
}

/**
 * POST /cards/:cardId/checklists (≥ MEMBER): appended after the card's last checklist. Logs
 * CHECKLIST_ADDED with its id and title.
 */
export async function createChecklist(
  userId: string,
  cardId: string,
  input: CreateChecklistData,
): Promise<ChecklistDto> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  const checklist = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockCard(tx, cardId);
      await lockContainer(tx, 'Checklist', 'cardId', cardId);
      const position = await appendPosition(tx, 'Checklist', 'cardId', cardId);
      const created = await tx.checklist.create({ data: { cardId, title: input.title, position } });
      await logActivity(tx, {
        boardId: card.boardId,
        userId,
        cardId,
        type: 'CHECKLIST_ADDED',
        data: { checklistId: created.id, title: created.title },
      });
      return created;
    }),
  );
  return toChecklistDto({ ...checklist, items: [] });
}

/** PATCH /checklists/:checklistId (≥ MEMBER): rename or move within the card. */
export async function updateChecklist(
  userId: string,
  checklistId: string,
  input: UpdateChecklistData,
): Promise<ChecklistDto> {
  const { cardId } = await assertChecklistAccess(userId, checklistId);
  const moved = input.position !== undefined;
  const checklist = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      if (moved) await lockContainer(tx, 'Checklist', 'cardId', cardId);
      const updated = await tx.checklist.update({
        where: { id: checklistId },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(moved && { position: input.position }),
        },
        include: ITEMS,
      });
      if (!moved) return updated;
      const position = await settlePosition(tx, 'Checklist', 'cardId', cardId, checklistId);
      return { ...updated, position };
    }),
  );
  return toChecklistDto(checklist);
}

/**
 * DELETE /checklists/:checklistId (≥ MEMBER): its items go with it (cascade). Logs
 * CHECKLIST_REMOVED with its id and title.
 */
export async function removeChecklist(userId: string, checklistId: string): Promise<void> {
  const { cardId, boardId, workspaceId } = await assertChecklistAccess(userId, checklistId);
  await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockCard(tx, cardId);
      const removed = await tx.checklist.delete({ where: { id: checklistId } });
      await logActivity(tx, {
        boardId,
        userId,
        cardId,
        type: 'CHECKLIST_REMOVED',
        data: { checklistId, title: removed.title },
      });
    }),
  );
  // Its items no longer count toward the tile's progress (REALTIME-001).
  await emitCardChanged(userId, cardId, workspaceId);
}

/** POST /checklists/:checklistId/items (≥ MEMBER): appended after the checklist's last item. */
export async function createItem(
  userId: string,
  checklistId: string,
  input: CreateChecklistItemData,
): Promise<ChecklistItemDto> {
  const { cardId, workspaceId } = await assertChecklistAccess(userId, checklistId);
  const item = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'ChecklistItem', 'checklistId', checklistId);
      const position = await appendPosition(tx, 'ChecklistItem', 'checklistId', checklistId);
      return tx.checklistItem.create({ data: { checklistId, content: input.content, position } });
    }),
  );
  await emitCardChanged(userId, cardId, workspaceId); // one more item on the tile's progress
  return toChecklistItemDto(item);
}

/**
 * PATCH /checklists/:checklistId/items/:itemId (≥ MEMBER): edit, tick or move within the list. A
 * change of `done` logs CHECKLIST_ITEM_CHECKED with the item's id, content and new `done`; the card
 * and then the item row are locked first, so two clients ticking the same item log it once.
 */
export async function updateItem(
  userId: string,
  checklistId: string,
  itemId: string,
  input: UpdateChecklistItemData,
): Promise<ChecklistItemDto> {
  const { checklist } = await assertItemAccess(userId, checklistId, itemId);
  const moved = input.position !== undefined;
  let ticked = false;
  const item = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockCard(tx, checklist.cardId);
      if (moved) await lockContainer(tx, 'ChecklistItem', 'checklistId', checklistId);
      const [before] = await tx.$queryRaw<{ done: boolean }[]>`
        SELECT "done" FROM "ChecklistItem"
        WHERE "id" = ${itemId} AND "checklistId" = ${checklistId} FOR NO KEY UPDATE`;
      // Still in this checklist (no route moves an item, but the write should not assume it).
      const updated = await tx.checklistItem.update({
        where: { id: itemId, checklistId },
        data: {
          ...(input.content !== undefined && { content: input.content }),
          ...(input.done !== undefined && { done: input.done }),
          ...(moved && { position: input.position }),
        },
      });
      if (before && input.done !== undefined && input.done !== before.done) {
        ticked = true;
        await logActivity(tx, {
          boardId: checklist.boardId,
          userId,
          cardId: checklist.cardId,
          type: 'CHECKLIST_ITEM_CHECKED',
          data: { checklistId, itemId, content: updated.content, done: updated.done },
        });
      }
      if (!moved) return updated;
      const position = await settlePosition(
        tx,
        'ChecklistItem',
        'checklistId',
        checklistId,
        itemId,
      );
      return { ...updated, position };
    }),
  );
  // A tick changes the tile's progress (REALTIME-001); edits and moves do not.
  if (ticked) await emitCardChanged(userId, checklist.cardId, checklist.workspaceId);
  return toChecklistItemDto(item);
}

/** DELETE /checklists/:checklistId/items/:itemId (≥ MEMBER). */
export async function removeItem(userId: string, checklistId: string, itemId: string) {
  const { checklist } = await assertItemAccess(userId, checklistId, itemId);
  await withNotFound(() => prisma.checklistItem.delete({ where: { id: itemId, checklistId } }));
  await emitCardChanged(userId, checklist.cardId, checklist.workspaceId);
}
