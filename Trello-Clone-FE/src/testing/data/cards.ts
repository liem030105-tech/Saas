import { buildErrorBody } from './api';
import { roadmapDetail } from './boards';
import { doingList, todoList } from './lists';

import type { BoardDetailDto, CardSummaryDto } from '@trello-clone/shared';

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
