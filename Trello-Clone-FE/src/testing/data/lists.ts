import { buildErrorBody } from './api';
import { roadmapBoard, roadmapDetail } from './boards';

import type { BoardDetailDto, ListDto } from '@trello-clone/shared';

type BoardList = BoardDetailDto['lists'][number];

const list = (id: string, title: string, position: number): BoardList => ({
  id,
  boardId: roadmapBoard.id,
  title,
  position,
  archived: false,
  createdAt: '2026-09-30T12:00:00.000Z',
  updatedAt: '2026-09-30T12:00:00.000Z',
  cards: [],
});

export const todoList = list('clx0000000000000000000051', 'To do', 1024);
export const doingList = list('clx0000000000000000000052', 'Doing', 2048);

/** roadmapBoard with two lists, in position order. */
export const roadmapWithLists: BoardDetailDto = { ...roadmapDetail, lists: [todoList, doingList] };

/** What the composer sends for a typed title (no position: the server appends). */
export const newList = {
  typed: '  Done ',
  sent: { title: 'Done' },
  created: { ...list('clx0000000000000000000053', 'Done', 3072) } satisfies ListDto,
};

export const blankListTitle = '   ';
export const blankListTitleMessage = 'Enter a list title';

/**
 * A 500 per failing test: toasts outlive a test's render, so each failure case needs its own
 * message to be told apart.
 */
const serverError = (message: string) =>
  buildErrorBody({ code: 'INTERNAL_ERROR', message, details: [] });

export const listServerErrors = {
  move: serverError('The list could not be moved'),
  add: serverError('The list could not be added'),
  addAfterClose: serverError('The list could not be added (composer closed)'),
  archive: serverError('The list could not be archived'),
  remove: serverError('The list could not be deleted'),
};

/** Edits made in a list's header and what PATCH /lists/:listId receives for them. */
export const listEdits = {
  rename: { typed: '  Up next ', sent: { title: 'Up next' } },
  archive: { sent: { archived: true } },
};

export const doneList = {
  ...todoList,
  id: 'clx0000000000000000000054',
  title: 'Done',
  position: 3072,
};

/** roadmapBoard with To do, Doing, Done (1024, 2048, 3072). */
export const roadmapWithThreeLists: BoardDetailDto = {
  ...roadmapDetail,
  lists: [todoList, doingList, doneList],
};
