import { buildErrorBody } from './api';
import { roadmapDetail } from './boards';
import { doingList, todoList } from './lists';

import type { BoardDetailDto, CardDetailDto, CardSummaryDto } from '@trello-clone/shared';

const card = (id: string, listId: string, title: string, position: number): CardSummaryDto => ({
  id,
  listId,
  title,
  position,
  dueDate: null,
  completed: false,
  coverUrl: null,
  labelIds: [],
  memberIds: [],
  checklist: { done: 0, total: 0 },
  commentCount: 0,
});

export const loginCard = card('clx0000000000000000000061', todoList.id, 'Fix login', 1024);
export const signupCard = card('clx0000000000000000000062', todoList.id, 'Sign-up form', 2048);

/** roadmapBoard: "To do" holds two cards, "Doing" none. */
export const roadmapWithCards: BoardDetailDto = {
  ...roadmapDetail,
  lists: [
    { ...todoList, cards: [loginCard, signupCard] },
    { ...doingList, cards: [] },
  ],
};

/** What the composer sends for a typed title (no position: the server appends). */
export const newCard = {
  typed: '  Write tests ',
  sent: { title: 'Write tests' },
  created: card('clx0000000000000000000063', todoList.id, 'Write tests', 3072),
};

export const blankCardTitle = '   ';
export const blankCardTitleMessage = 'Enter a card title';

export const cardServerError = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'The card could not be added',
  details: [],
});

/** GET /cards/:cardId for loginCard. */
export const loginCardDetail: CardDetailDto = {
  ...loginCard,
  boardId: roadmapDetail.id,
  description: '**Steps**: open the login page',
  archived: false,
  createdAt: '2026-09-30T12:00:00.000Z',
  updatedAt: '2026-09-30T12:00:00.000Z',
  members: [],
  labels: [],
  checklists: [],
  attachments: [],
};

/** A card on a board the caller can see, but not on roadmapBoard: its URL under roadmap is a 404. */
export const otherBoardCardDetail: CardDetailDto = {
  ...loginCardDetail,
  id: 'clx0000000000000000000069',
  boardId: 'clx0000000000000000000048',
};

/** A card id the API answers 404 for. */
export const hiddenCardId = 'clx0000000000000000000068';

/** Edits made in the card modal and what PATCH /cards/:cardId receives for them. */
export const cardEdits = {
  rename: { typed: '  Fix the login form ', sent: { title: 'Fix the login form' } },
  description: { typed: 'New *notes*', sent: { description: 'New *notes*' } },
  clearDescription: { typed: '   ', sent: { description: null } },
  dueDate: { picked: '2026-10-12', sent: { dueDate: '2026-10-12T23:59:59.999Z' } },
  complete: { sent: { completed: true } },
  archive: { sent: { archived: true } },
};

/** Tile badges: due in the far future, long overdue, completed. */
export const dueCards = {
  upcoming: { ...signupCard, dueDate: '2999-01-01T23:59:59.999Z' },
  overdue: { ...signupCard, dueDate: '2001-01-01T23:59:59.999Z' },
  completed: { ...signupCard, dueDate: '2001-01-01T23:59:59.999Z', completed: true },
};

/** PATCH /cards/:cardId/move failures (CARD-004): a VIEWER's 403 and a server error. */
export const cardMoveErrors = {
  forbidden: {
    status: 403,
    body: buildErrorBody({ code: 'FORBIDDEN', message: 'Insufficient role', details: [] }),
  },
  server: {
    status: 500,
    body: buildErrorBody({ code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] }),
  },
};
