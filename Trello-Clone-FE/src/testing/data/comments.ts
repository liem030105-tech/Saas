import { buildErrorBody } from './api';
import { currentUser } from './auth';
import { loginCard } from './cards';
import { ownerMember } from './workspaces';

import type { CommentDto } from '@trello-clone/shared';

// Comments on "Fix login" (CARD-005d), newest first as the API lists them.

const author = (user: { id: string; name: string }) => ({
  id: user.id,
  name: user.name,
  avatarUrl: null,
});

/** By the signed-in user (Grace), in markdown. */
export const myComment: CommentDto = {
  id: 'clx0000000000000000000102',
  cardId: loginCard.id,
  content: 'Fixed in **staging**',
  createdAt: '2026-09-30T14:00:00.000Z',
  updatedAt: '2026-09-30T14:00:00.000Z',
  author: author(currentUser),
};

/** By Ada (OWNER), edited after it was written. */
export const adaComment: CommentDto = {
  id: 'clx0000000000000000000101',
  cardId: loginCard.id,
  content: 'Can you reproduce it?',
  createdAt: '2026-09-30T13:00:00.000Z',
  updatedAt: '2026-09-30T13:30:00.000Z',
  author: author(ownerMember.user),
};

/** An older comment that only the second page holds. */
export const olderComment: CommentDto = {
  id: 'clx0000000000000000000100',
  cardId: loginCard.id,
  content: 'Reported by support',
  createdAt: '2026-09-30T12:00:00.000Z',
  updatedAt: '2026-09-30T12:00:00.000Z',
  author: author(ownerMember.user),
};

export const newCommentInput = {
  typed: '  Deployed to production ',
  sent: 'Deployed to production',
};

export const commentServerError = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong',
});
