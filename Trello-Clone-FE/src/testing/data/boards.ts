import { acmeWorkspace } from './workspaces';

import type { BoardDto } from '@trello-clone/shared';

/** Boards of acmeWorkspace as GET …/boards returns them (newest first). */
export const roadmapBoard: BoardDto = {
  id: 'clx0000000000000000000041',
  workspaceId: acmeWorkspace.id,
  title: 'Roadmap',
  background: '#0079bf',
  archived: false,
  createdAt: '2026-09-30T11:00:00.000Z',
  updatedAt: '2026-09-30T11:00:00.000Z',
};

export const sprintBoard: BoardDto = {
  ...roadmapBoard,
  id: 'clx0000000000000000000042',
  title: 'Sprint 12',
  background: '#519839',
  createdAt: '2026-09-30T10:00:00.000Z',
  updatedAt: '2026-09-30T10:00:00.000Z',
};

/** What the create-board form sends for a typed title and the "Orange" swatch. */
export const newBoard = {
  typed: { title: '  Launch plan ', swatch: 'Orange' },
  sent: { title: 'Launch plan', background: '#d29034' },
  created: {
    ...roadmapBoard,
    id: 'clx0000000000000000000043',
    title: 'Launch plan',
    background: '#d29034',
  } satisfies BoardDto,
};

export const blankBoardTitleMessage = 'Enter a board title';

export const boardPathFor = (board: Pick<BoardDto, 'id'>) => `/b/${board.id}`;
