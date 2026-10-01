import { toChecklistDto, toChecklistItemDto } from './cards.mapper';
import { assertCardAccess } from './cards.service';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { appendPosition, lockContainer, settlePosition } from '../../lib/rebalance';
import { assertBoardAccess } from '../boards/boards.service';

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
  await assertBoardAccess(userId, checklist.card.boardId, 'card.assign');
  return checklist;
}

/** Loads an item of a checklist the caller may edit; an item of another checklist is a 404. */
async function assertItemAccess(userId: string, checklistId: string, itemId: string) {
  await assertChecklistAccess(userId, checklistId);
  const item = await prisma.checklistItem.findFirst({ where: { id: itemId, checklistId } });
  if (!item) throw AppError.notFound();
  return item;
}

/** POST /cards/:cardId/checklists (≥ MEMBER): appended after the card's last checklist. */
export async function createChecklist(
  userId: string,
  cardId: string,
  input: CreateChecklistData,
): Promise<ChecklistDto> {
  await assertCardAccess(userId, cardId, 'card.assign');
  const checklist = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'Checklist', 'cardId', cardId);
      const position = await appendPosition(tx, 'Checklist', 'cardId', cardId);
      return tx.checklist.create({ data: { cardId, title: input.title, position } });
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

/** DELETE /checklists/:checklistId (≥ MEMBER): its items go with it (cascade). */
export async function removeChecklist(userId: string, checklistId: string): Promise<void> {
  await assertChecklistAccess(userId, checklistId);
  await withNotFound(() => prisma.checklist.delete({ where: { id: checklistId } }));
}

/** POST /checklists/:checklistId/items (≥ MEMBER): appended after the checklist's last item. */
export async function createItem(
  userId: string,
  checklistId: string,
  input: CreateChecklistItemData,
): Promise<ChecklistItemDto> {
  await assertChecklistAccess(userId, checklistId);
  const item = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'ChecklistItem', 'checklistId', checklistId);
      const position = await appendPosition(tx, 'ChecklistItem', 'checklistId', checklistId);
      return tx.checklistItem.create({ data: { checklistId, content: input.content, position } });
    }),
  );
  return toChecklistItemDto(item);
}

/** PATCH /checklists/:checklistId/items/:itemId (≥ MEMBER): edit, tick or move within the list. */
export async function updateItem(
  userId: string,
  checklistId: string,
  itemId: string,
  input: UpdateChecklistItemData,
): Promise<ChecklistItemDto> {
  await assertItemAccess(userId, checklistId, itemId);
  const moved = input.position !== undefined;
  const item = await withNotFound(() =>
    prisma.$transaction(async (tx) => {
      if (moved) await lockContainer(tx, 'ChecklistItem', 'checklistId', checklistId);
      const updated = await tx.checklistItem.update({
        where: { id: itemId },
        data: {
          ...(input.content !== undefined && { content: input.content }),
          ...(input.done !== undefined && { done: input.done }),
          ...(moved && { position: input.position }),
        },
      });
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
  return toChecklistItemDto(item);
}

/** DELETE /checklists/:checklistId/items/:itemId (≥ MEMBER). */
export async function removeItem(userId: string, checklistId: string, itemId: string) {
  await assertItemAccess(userId, checklistId, itemId);
  await withNotFound(() => prisma.checklistItem.delete({ where: { id: itemId } }));
}
