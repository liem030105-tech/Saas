import { toCardDetailDto } from './cards.mapper';
import * as cardsRepository from './cards.repository';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { appendPosition, lockContainer, settlePosition } from '../../lib/rebalance';
import {
  assertBoardAccess,
  logActivity,
  toCardSummaryDto,
  toLabelDto,
} from '../boards/boards.service';

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
 * A card's labels and members, ordered by id: CardSummaryDto's `labelIds` and `memberIds`, and
 * CardDetailDto's `labels` and `members`.
 */
const DETAIL = {
  labels: { include: { label: true }, orderBy: { labelId: 'asc' } },
  members: {
    include: { user: { select: { id: true, name: true, avatarUrl: true } } },
    orderBy: { userId: 'asc' },
  },
} as const;

type CardDetailRow = Prisma.CardGetPayload<{ include: typeof DETAIL }>;

const toDetail = (card: CardDetailRow) =>
  toCardDetailDto(card, toCardSummaryDto(card), {
    labels: card.labels.map(({ label }) => toLabelDto(label)),
    members: card.members.map(({ user }) => user),
  });

/**
 * Loads a card and checks the caller's role on its stored board (the denormalized `boardId`,
 * ADR-006). An unknown or malformed id and a card the caller cannot see are the same 404.
 */
async function assertCardAccess(userId: string, cardId: string, action: WorkspaceAction) {
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
    return toCardSummaryDto({ ...card, labels: [], members: [] }); // realtime emit (REALTIME-001) goes here, after the commit
  } catch (error) {
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
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
  };
  try {
    const card = await prisma.$transaction(async (tx) => {
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
        },
      });
      return updated;
    });
    return toDetail(card);
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
  try {
    const moved = await prisma.$transaction((tx) =>
      cardsRepository.move(tx, {
        cardId,
        userId,
        to: { listId: target.id, boardId: target.boardId },
        position: input.position,
      }),
    );
    return {
      id: moved.id,
      listId: moved.listId,
      boardId: moved.boardId,
      position: moved.position,
      updatedAt: moved.updatedAt.toISOString(),
    }; // realtime emit (REALTIME-001: card:moved) goes here, after the commit
  } catch (error) {
    // The card (P2025) or the target list (P2003) was deleted after the checks.
    if (isMissingCard(error) || isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
}

// Card labels (CARD-005, docs/api/cards.md → Card members & labels). Both are idempotent.

/**
 * POST /cards/:cardId/labels/:labelId (≥ MEMBER). The label must be one the caller can see (404
 * otherwise, like a label that does not exist); a visible label of another board is a 422
 * LABEL_OTHER_BOARD (I2). Attaching a label the card already has changes nothing.
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
  try {
    await prisma.$transaction(async (tx) => {
      // A cross-board move of the card (it locks and updates the card row) may be committing:
      // FOR SHARE waits for it, so the board compared is the one the card ends up on, and a move
      // that starts later waits for this insert and then drops the label (I2).
      const [locked] = await tx.$queryRaw<{ boardId: string }[]>`
        SELECT "boardId" FROM "Card" WHERE "id" = ${cardId} FOR SHARE`;
      if (!locked) throw AppError.notFound();
      if (locked.boardId !== label.boardId) throw otherBoard();
      await tx.cardLabel.createMany({ data: [{ cardId, labelId }], skipDuplicates: true });
    });
  } catch (error) {
    // The label was deleted after the checks.
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
}

/** DELETE /cards/:cardId/labels/:labelId (≥ MEMBER): a label the card does not have is a no-op. */
export async function detachLabel(userId: string, cardId: string, labelId: string): Promise<void> {
  await assertCardAccess(userId, cardId, 'card.assign');
  await prisma.cardLabel.deleteMany({ where: { cardId, labelId } });
}

// Card members (CARD-005, docs/api/cards.md → Card members & labels). Both are idempotent, and
// each logs only when it changes something.

/**
 * POST /cards/:cardId/members/:userId (≥ MEMBER). Only a member of the card's workspace can be
 * assigned (422 NOT_WORKSPACE_MEMBER otherwise, I3; the same answer for a user that does not
 * exist, so the id reveals nothing). Their membership row is held FOR KEY SHARE until the insert
 * commits (enough to hold off its deletion, without blocking a role change), so a concurrent removal from the workspace either waits for it (and then removes the
 * assignment too) or wins and the assignment is refused. Logs MEMBER_ADDED with `data.userId`.
 */
export async function assignMember(
  userId: string,
  cardId: string,
  memberId: string,
): Promise<void> {
  const card = await assertCardAccess(userId, cardId, 'card.assign');
  try {
    await prisma.$transaction(async (tx) => {
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
      }
    });
  } catch (error) {
    // The card was deleted after the check.
    if (isMissingReference(error)) throw AppError.notFound();
    throw error;
  }
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
  await prisma.$transaction(async (tx) => {
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
  });
}
