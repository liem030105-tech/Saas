import { COVER_MIME_TYPES } from '@trello-clone/shared';

import { toAttachmentDto, UPLOADER } from './attachments.mapper';
import { toCardDetailDto, toChecklistDto } from './cards.mapper';
import * as cardsRepository from './cards.repository';
import { logger } from '../../config/logger';
import { prisma } from '../../config/prisma';
import { Prisma, type Card } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { lockAttachmentKeys } from '../../lib/attachment-files';
import { appendPosition, lockContainer, settle } from '../../lib/rebalance';
import { removeFiles, signedFileUrl } from '../../lib/storage';
import {
  cardCreated,
  cardDeleted,
  cardMoved,
  cardsReordered,
  cardUpdated,
} from '../../realtime/events/cards.events';
import {
  assertBoardAccess,
  checklistProgress,
  loadCardSummary,
  logActivity,
  NO_CHECKLIST,
  toCardSummaryDto,
  toLabelDto,
} from '../boards/boards.service';
import * as notificationsService from '../notifications/notifications.service';

import type { CreatedNotification } from '../notifications/notifications.service';
import type { WorkspaceAction } from '../workspaces/permissions';
import type {
  CardDetailDto,
  CardSummaryDto,
  CreateCardData,
  MoveCardData,
  MoveCardResult,
  UpdateCardData,
} from '@trello-clone/shared';

// docs/api/cards.md. Every endpoint authorizes with assertBoardAccess on the stored board.

/**
 * A row the insert points to (the list of a new card, the card or label of a card label) was
 * deleted between the access check and the insert (a concurrent DELETE).
 */
const isMissingReference = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/** The card was deleted between the access check and the write (a concurrent DELETE). */
const isMissingCard = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

/**
 * A card's labels and members (ordered by id) and its checklists with their items (by `position,
 * id`, docs/database/relationships.md → Ordering): CardSummaryDto's `labelIds`, `memberIds` and
 * `checklist`, and CardDetailDto's `labels`, `members` and `checklists`.
 */
const DETAIL = {
  labels: { include: { label: true }, orderBy: { labelId: 'asc' } },
  members: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { userId: 'asc' },
  },
  checklists: {
    orderBy: [{ position: 'asc' }, { id: 'asc' }],
    include: { items: { orderBy: [{ position: 'asc' }, { id: 'asc' }] } },
  },
  _count: { select: { comments: true } },
  attachments: { include: UPLOADER, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
  coverAttachment: { select: { storageKey: true, fileName: true, mimeType: true } },
} satisfies Prisma.CardInclude;

type CardDetailRow = Prisma.CardGetPayload<{ include: typeof DETAIL }>;

/** The card as the modal shows it; its attachments (newest first) with fresh signed URLs. */
const toDetail = async (card: CardDetailRow) =>
  toCardDetailDto(
    card,
    toCardSummaryDto({
      ...card,
      checklist: checklistProgress(card.checklists),
      coverUrl: await signedFileUrl(card.coverAttachment),
    }),
    {
      labels: card.labels.map(({ label }) => toLabelDto(label)),
      members: card.members.map(({ user }) => user),
      checklists: card.checklists.map(toChecklistDto),
      attachments: await Promise.all(card.attachments.map(toAttachmentDto)),
    },
  );

/**
 * After a committed change to a card's labels, members or checklists (which the board tile shows):
 * sends `card:updated` with the tile as it is now. A failure to read it only loses the event
 * (logged); the change itself is done.
 */
export async function emitCardChanged(actorId: string, cardId: string, workspaceId: string) {
  // Taken before the read: a PATCH committed after it has a later `updatedAt`, so this older tile
  // never wins over that PATCH's own event on the client.
  const version = Date.now();
  try {
    const summary = await loadCardSummary(cardId);
    if (!summary) return; // deleted meanwhile; its deletion has its own event
    cardUpdated({ boardId: summary.card.boardId, workspaceId }, actorId, summary.data, version);
  } catch (error) {
    logger.error({ err: error, cardId }, 'card:updated not sent');
  }
}

/**
 * Loads a card and checks the caller's role on its stored board (the denormalized `boardId`,
 * ADR-006). An unknown or malformed id and a card the caller cannot see are the same 404.
 */
export async function assertCardAccess(userId: string, cardId: string, action: WorkspaceAction) {
  const card = await prisma.card.findUnique({ where: { id: cardId } });
  if (!card) throw AppError.notFound();
  const { board } = await assertBoardAccess(userId, card.boardId, action);
  return { ...card, workspaceId: board.workspaceId };
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
  const { board } = await assertBoardAccess(userId, boardId, 'card.edit');
  const where = { boardId, workspaceId: board.workspaceId };
  let rebalanced: Map<string, number> | null = null;
  let card: Card;
  try {
    card = await prisma.$transaction(async (tx) => {
      await lockContainer(tx, 'Card', 'listId', listId);
      const position = input.position ?? (await appendPosition(tx, 'Card', 'listId', listId));
      let created = await tx.card.create({
        data: { boardId, listId, title: input.title, position },
      });
      if (input.position !== undefined) {
        const settled = await settle(tx, 'Card', 'listId', listId, created.id);
        created = { ...created, position: settled.position };
        rebalanced = settled.rebalanced;
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
  } catch (error) {
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
  const dto = toCardSummaryDto({
    ...card,
    labels: [],
    members: [],
    checklist: NO_CHECKLIST,
    _count: { comments: 0 },
    coverUrl: null,
  });
  // After the commit (realtime.md → Principles), outside the error mapping.
  cardCreated(where, userId, card, dto);
  if (rebalanced) cardsReordered(where, userId, listId, rebalanced);
  return dto;
}

/** GET /cards/:cardId (≥ VIEWER). Archived cards are returned (the modal shows a banner). */
export async function get(userId: string, cardId: string): Promise<CardDetailDto> {
  await assertCardAccess(userId, cardId, 'card.view');
  const card = await prisma.card.findUnique({ where: { id: cardId }, include: DETAIL });
  if (!card) throw AppError.notFound(); // deleted after the check
  return toDetail(card);
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
    ...(input.coverAttachmentId !== undefined && { coverAttachmentId: input.coverAttachmentId }),
  };
  let card: CardDetailRow;
  try {
    card = await prisma.$transaction(async (tx) => {
      if (input.coverAttachmentId) await assertCoverOf(tx, cardId, input.coverAttachmentId);
      const updated = await tx.card.update({
        where: { id: cardId },
        data: changes,
        include: DETAIL,
      });
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
          ...(input.coverAttachmentId !== undefined && {
            coverAttachmentId: input.coverAttachmentId,
          }),
        },
      });
      return updated;
    });
  } catch (error) {
    if (isMissingCard(error)) throw AppError.notFound();
    throw error;
  }
  const detail = await toDetail(card);
  const tile = toCardSummaryDto({
    ...card,
    checklist: checklistProgress(card.checklists),
    coverUrl: detail.coverUrl,
  });
  // The board the card is on now (a move may have committed since the access check).
  cardUpdated(
    { boardId: card.boardId, workspaceId: current.workspaceId },
    userId,
    { ...tile, archived: card.archived },
    card.updatedAt.getTime(),
  );
  return detail;
}

/**
 * A card's cover must be one of its own image attachments (ATTACHMENTS-001): another card's
 * attachment (a foreign one included) or a non-image is a 422, the same for each. The card is
 * locked first, so a card deleted meanwhile (its attachments gone with it) stays a 404; the
 * attachment row is held (FOR KEY SHARE) so it cannot be deleted before the card points to it.
 */
async function assertCoverOf(tx: Prisma.TransactionClient, cardId: string, attachmentId: string) {
  const [card] = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Card" WHERE "id" = ${cardId} FOR NO KEY UPDATE`;
  if (!card) throw AppError.notFound();
  const [attachment] = await tx.$queryRaw<{ cardId: string; mimeType: string }[]>`
    SELECT "cardId", "mimeType" FROM "Attachment" WHERE "id" = ${attachmentId} FOR KEY SHARE`;
  const image = (COVER_MIME_TYPES as readonly string[]).includes(attachment?.mimeType ?? '');
  if (attachment?.cardId !== cardId || !image) {
    throw AppError.businessRule(
      'COVER_NOT_IMAGE_OF_CARD',
      "The cover must be one of this card's image attachments",
    );
  }
}

/**
 * DELETE /cards/:cardId (≥ MEMBER). Its activity stays on the board with `cardId` set to null
 * (docs/database/relationships.md); nothing else is logged.
 */
export async function remove(userId: string, cardId: string): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.edit');
  let deleted: Card;
  let files: string[];
  try {
    [deleted, files] = await prisma.$transaction(async (tx) => {
      const keys = await lockAttachmentKeys(tx, { cardId });
      return [await tx.card.delete({ where: { id: cardId } }), keys] as const;
    });
  } catch (error) {
    if (isMissingCard(error)) throw AppError.notFound();
    throw error;
  }
  await removeFiles(files); // its attachments' files, after the commit (ATTACHMENTS-001)
  // The list it was deleted from (a move may have changed it since the access check).
  cardDeleted(
    { boardId: deleted.boardId, workspaceId: card.workspaceId },
    userId,
    cardId,
    deleted.listId,
  );
}

/**
 * PATCH /cards/:cardId/move (≥ MEMBER on the card's workspace): within a list, to another list, or
 * to another board of the same workspace. Step 1 of docs/api/cards.md → Transaction: the card must
 * be editable by the caller (404 / 403); the target list must be visible to them (404 otherwise,
 * so a list elsewhere looks like no list at all); a visible list in another workspace is a 422
 * CROSS_WORKSPACE_MOVE (I6). The rest runs in one transaction in cards.repository.move.
 */
export async function move(
  userId: string,
  cardId: string,
  input: MoveCardData,
): Promise<MoveCardResult> {
  const card = await assertCardAccess(userId, cardId, 'card.edit');
  const target = await prisma.list.findUnique({
    where: { id: input.listId },
    select: { id: true, boardId: true },
  });
  if (!target) throw AppError.notFound();
  const { board: targetBoard } = await assertBoardAccess(userId, target.boardId, 'card.view');
  if (targetBoard.workspaceId !== card.workspaceId) {
    throw AppError.businessRule(
      'CROSS_WORKSPACE_MOVE',
      'A card can only move to a list in its own workspace',
    );
  }
  let result: Awaited<ReturnType<typeof cardsRepository.move>>;
  try {
    result = await prisma.$transaction(async (tx) => {
      const moved = await cardsRepository.move(tx, {
        cardId,
        userId,
        to: { listId: target.id, boardId: target.boardId },
        position: input.position,
      });
      // The card's notifications follow it to its new board (NOTIFICATIONS-001).
      await notificationsService.moveCard(tx, cardId, target.boardId);
      return moved;
    });
  } catch (error) {
    // The card (P2025) or the target list (P2003) was deleted after the checks.
    if (isMissingCard(error) || isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
  const { card: moved, from, rebalanced } = result;
  // After the commit: both boards hear the move, the target board any rebalance.
  cardMoved(card.workspaceId, userId, moved, {
    cardId,
    fromListId: from.listId,
    toListId: moved.listId,
    fromBoardId: from.boardId,
    toBoardId: moved.boardId,
    position: moved.position,
  });
  if (rebalanced) {
    cardsReordered(
      { boardId: moved.boardId, workspaceId: card.workspaceId },
      userId,
      moved.listId,
      rebalanced,
    );
  }
  return {
    id: moved.id,
    listId: moved.listId,
    boardId: moved.boardId,
    position: moved.position,
    updatedAt: moved.updatedAt.toISOString(),
  };
}

// Card labels (CARD-005, docs/api/cards.md → Card members & labels). Both are idempotent.

/**
 * POST /cards/:cardId/labels/:labelId (≥ MEMBER). The label must be one the caller can see (404
 * otherwise, like a label that does not exist); a visible label of another board is a 422
 * LABEL_OTHER_BOARD (I2). Attaching a label the card already has changes nothing. Logs
 * LABEL_ADDED with the label's id, name and colour (so the feed can still name a deleted label).
 */
export async function attachLabel(userId: string, cardId: string, labelId: string): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) throw AppError.notFound();
  const otherBoard = () =>
    AppError.businessRule('LABEL_OTHER_BOARD', "A card can only carry its own board's labels");
  if (label.boardId !== card.boardId) {
    await assertBoardAccess(userId, label.boardId, 'board.view');
    throw otherBoard();
  }
  let changed: boolean;
  try {
    changed = await prisma.$transaction(async (tx) => {
      // A cross-board move of the card (it locks and updates the card row) may be committing:
      // FOR SHARE waits for it, so the board compared is the one the card ends up on, and a move
      // that starts later waits for this insert and then drops the label (I2).
      const [locked] = await tx.$queryRaw<{ boardId: string }[]>`
        SELECT "boardId" FROM "Card" WHERE "id" = ${cardId} FOR SHARE`;
      if (!locked) throw AppError.notFound();
      if (locked.boardId !== label.boardId) throw otherBoard();
      const { count } = await tx.cardLabel.createMany({
        data: [{ cardId, labelId }],
        skipDuplicates: true,
      });
      if (count > 0) {
        await logActivity(tx, {
          boardId: label.boardId,
          userId,
          cardId,
          type: 'LABEL_ADDED',
          data: { labelId, name: label.name, color: label.color },
        });
      }
      return count > 0;
    });
  } catch (error) {
    // The label was deleted after the checks.
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
  if (changed) await emitCardChanged(userId, cardId, card.workspaceId);
}

/**
 * DELETE /cards/:cardId/labels/:labelId (≥ MEMBER): a label the card does not have is a no-op.
 * Logs LABEL_REMOVED like LABEL_ADDED. Deleting the label itself, or a move to another board that
 * drops it, logs nothing for the cards that had it.
 */
export async function detachLabel(userId: string, cardId: string, labelId: string): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  const changed = await prisma.$transaction(async (tx) => {
    // The card row first (the log's foreign key locks it anyway), in the order a card delete
    // takes its rows, so the two wait for each other instead of deadlocking.
    const [held] = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "Card" WHERE "id" = ${cardId} FOR KEY SHARE`;
    if (!held) throw AppError.notFound();
    const removed = await tx.cardLabel.deleteMany({ where: { cardId, labelId } });
    if (removed.count === 0) return false;
    const label = await tx.label.findUnique({ where: { id: labelId } });
    await logActivity(tx, {
      boardId: card.boardId,
      userId,
      cardId,
      type: 'LABEL_REMOVED',
      data: { labelId, name: label?.name ?? null, color: label?.color ?? null },
    });
    return true;
  });
  if (changed) await emitCardChanged(userId, cardId, card.workspaceId);
}

// Card members (CARD-005, docs/api/cards.md → Card members & labels). Both are idempotent, and
// each logs only when it changes something.

/**
 * POST /cards/:cardId/members/:userId (≥ MEMBER). Only a member of the card's workspace can be
 * assigned (422 NOT_WORKSPACE_MEMBER otherwise, I3; the same answer for a user that does not
 * exist, so the id reveals nothing). Their membership row is held FOR KEY SHARE until the insert
 * commits (enough to hold off its deletion, without blocking a role change), so a concurrent
 * removal from the workspace either waits for it (and then removes the assignment too) or wins
 * and the assignment is refused. Logs MEMBER_ADDED with `data.userId`.
 */
export async function assignMember(
  userId: string,
  cardId: string,
  memberId: string,
): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  let changed: boolean;
  let notified: CreatedNotification[] = [];
  try {
    changed = await prisma.$transaction(async (tx) => {
      const [membership] = await tx.$queryRaw<{ userId: string }[]>`
        SELECT "userId" FROM "WorkspaceMember"
        WHERE "userId" = ${memberId} AND "workspaceId" = ${card.workspaceId} FOR KEY SHARE`;
      if (!membership) {
        throw AppError.businessRule(
          'NOT_WORKSPACE_MEMBER',
          'Only members of this workspace can be assigned to its cards',
        );
      }
      const { count } = await tx.cardMember.createMany({
        data: [{ cardId, userId: memberId }],
        skipDuplicates: true,
      });
      if (count > 0) {
        await logActivity(tx, {
          boardId: card.boardId,
          userId,
          cardId,
          type: 'MEMBER_ADDED',
          data: { userId: memberId },
        });
        // The assignee hears of it, unless they assigned themselves (NOTIFICATIONS-001).
        notified = await notificationsService.notify(tx, [
          {
            userId: memberId,
            type: 'CARD_ASSIGNED',
            workspaceId: card.workspaceId,
            actorId: userId,
            boardId: card.boardId,
            cardId,
          },
        ]);
      }
      return count > 0;
    });
  } catch (error) {
    // The card was deleted after the check.
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
  if (changed) await emitCardChanged(userId, cardId, card.workspaceId);
  await notificationsService.announce(userId, notified);
}

/**
 * DELETE /cards/:cardId/members/:userId (≥ MEMBER): someone not assigned is a no-op. Logs
 * MEMBER_REMOVED with `data.userId`.
 */
export async function unassignMember(
  userId: string,
  cardId: string,
  memberId: string,
): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.cardMember.deleteMany({ where: { cardId, userId: memberId } });
    if (count > 0) {
      await logActivity(tx, {
        boardId: card.boardId,
        userId,
        cardId,
        type: 'MEMBER_REMOVED',
        data: { userId: memberId },
      });
    }
    return count > 0;
  });
  if (changed) await emitCardChanged(userId, cardId, card.workspaceId);
}
