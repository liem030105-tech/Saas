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

export const listServerError = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong',
  details: [],
});
