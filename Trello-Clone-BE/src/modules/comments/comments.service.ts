import { toCommentDto } from './comments.mapper';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import {
  commentCreated,
  commentDeleted,
  commentUpdated,
} from '../../realtime/events/comments.events';
import { assertBoardAccess, logActivity } from '../boards/boards.service';
import { assertCardAccess, emitCardChanged } from '../cards/cards.service';
import { hasPermission } from '../workspaces/permissions';

import type {
  CommentData,
  CommentDto,
  CommentsPage,
  ListCommentsQuery,
} from '@trello-clone/shared';

// docs/api/cards.md → Comments (CARD-005d). A comment resolves to its card's stored board; an
// unknown or malformed id and a comment the caller cannot see are the same 404. Content is raw
// markdown, stored as written (trimmed) and rendered sanitized by the FE.

const AUTHOR = { author: { select: { id: true, name: true, avatarUrl: true } } } as const;

/** Newest first; `id` breaks ties between comments made in the same millisecond. */
const NEWEST_FIRST = [
  { createdAt: 'desc' },
  { id: 'desc' },
] satisfies Prisma.CommentOrderByWithRelationInput[];

/** The comment was deleted after the access check (a concurrent DELETE). */
const isMissing = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  (error.code === 'P2025' || error.code === 'P2003');

/** GET /cards/:cardId/comments (≥ VIEWER): a page, newest first, and the next page's cursor. */
export async function list(
  userId: string,
  cardId: string,
  query: ListCommentsQuery,
): Promise<CommentsPage> {
  await assertCardAccess(userId, cardId, 'comment.view');
  let after: Prisma.CommentWhereInput = {};
  if (query.cursor) {
    // The cursor must be a comment of this card, else it is a bad request (docs/api/README.md).
    const from = await prisma.comment.findFirst({ where: { id: query.cursor, cardId } });
    if (!from) {
      throw new AppError('VALIDATION_ERROR', 400, 'Request validation failed', [
        { path: 'cursor', message: 'Unknown cursor' },
      ]);
    }
    // Keyset on the row just read, so the page still follows it if it is deleted meanwhile.
    after = {
      OR: [
        { createdAt: { lt: from.createdAt } },
        { createdAt: from.createdAt, id: { lt: from.id } },
      ],
    };
  }
  const rows = await prisma.comment.findMany({
    where: { cardId, ...after },
    orderBy: NEWEST_FIRST,
    include: AUTHOR,
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  return {
    data: page.map(toCommentDto),
    nextCursor: rows.length > query.limit ? page.at(-1)!.id : null,
  };
}

/** POST /cards/:cardId/comments (≥ MEMBER): logs COMMENT_ADDED in the same transaction. */
export async function create(
  userId: string,
  cardId: string,
  input: CommentData,
): Promise<CommentDto> {
  const card = await assertCardAccess(userId, cardId, 'comment.create');
  let comment: Prisma.CommentGetPayload<{ include: typeof AUTHOR }>;
  try {
    comment = await prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { cardId, authorId: userId, content: input.content },
        include: AUTHOR,
      });
      await logActivity(tx, {
        boardId: card.boardId,
        userId,
        cardId,
        type: 'COMMENT_ADDED',
        data: { commentId: created.id },
      });
      return created;
    });
  } catch (error) {
    if (isMissing(error)) throw AppError.notFound();
    throw error;
  }
  // After the commit, outside the error mapping; the card's tile also shows one more comment.
  const dto = toCommentDto(comment);
  commentCreated({ boardId: card.boardId, workspaceId: card.workspaceId }, userId, dto);
  await emitCardChanged(userId, cardId, card.workspaceId);
  return dto;
}

/**
 * Loads a comment with the caller's role on its card's board (404 if they cannot see it), and
 * checks they may act on it: their own with `own`, anyone's with `any` (permission matrix).
 */
async function assertCommentAccess(
  userId: string,
  commentId: string,
  own: 'comment.editOwn' | 'comment.deleteOwn',
  any?: 'comment.deleteAny',
) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    select: { id: true, cardId: true, authorId: true, card: { select: { boardId: true } } },
  });
  if (!comment) throw AppError.notFound();
  const { role, board } = await assertBoardAccess(userId, comment.card.boardId, 'comment.view');
  const allowed =
    (comment.authorId === userId && hasPermission(role, own)) ||
    (any !== undefined && hasPermission(role, any));
  if (!allowed) throw AppError.forbidden();
  return { ...comment, board: { boardId: board.id, workspaceId: board.workspaceId } };
}

/** PATCH /comments/:commentId: the author, while their role is ≥ MEMBER. */
export async function update(
  userId: string,
  commentId: string,
  input: CommentData,
): Promise<CommentDto> {
  const { board } = await assertCommentAccess(userId, commentId, 'comment.editOwn');
  let comment: Prisma.CommentGetPayload<{ include: typeof AUTHOR }>;
  try {
    comment = await prisma.comment.update({
      where: { id: commentId },
      data: { content: input.content },
      include: AUTHOR,
    });
  } catch (error) {
    if (isMissing(error)) throw AppError.notFound();
    throw error;
  }
  const dto = toCommentDto(comment);
  commentUpdated(board, userId, dto);
  return dto;
}

/** DELETE /comments/:commentId: the author with a role ≥ MEMBER, or anyone ≥ ADMIN. */
export async function remove(userId: string, commentId: string): Promise<void> {
  const { board, cardId } = await assertCommentAccess(
    userId,
    commentId,
    'comment.deleteOwn',
    'comment.deleteAny',
  );
  try {
    await prisma.comment.delete({ where: { id: commentId } });
  } catch (error) {
    if (isMissing(error)) throw AppError.notFound();
    throw error;
  }
  commentDeleted(board, userId, commentId, cardId);
  await emitCardChanged(userId, cardId, board.workspaceId); // one comment fewer on the tile
}
