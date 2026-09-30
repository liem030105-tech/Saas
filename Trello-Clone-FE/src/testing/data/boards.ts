import { buildErrorBody } from './api';
import { acmeWorkspace } from './workspaces';

import type { BoardDetailDto, BoardDto } from '@trello-clone/shared';

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

/** A title that is only spaces, and the field message it gets. */
export const blankBoardTitle = '   ';
export const blankBoardTitleMessage = 'Enter a board title';

export const boardPathFor = (board: Pick<BoardDto, 'id'>) => `/b/${board.id}`;

/** GET /boards/:boardId for roadmapBoard (no lists or labels before LIST-001 / CARD-005). */
export const roadmapDetail: BoardDetailDto = { ...roadmapBoard, lists: [], labels: [] };

/** Edits made on the board page and what PATCH /boards/:boardId receives for them. */
export const boardEdits = {
  rename: { typed: '  Roadmap 2027 ', sent: { title: 'Roadmap 2027' } },
  recolour: { swatch: 'Red', sent: { background: '#b04632' } },
  archive: { sent: { archived: true } },
};

export const archivedBanner = 'This board is archived.';

/** A board id the caller cannot see: the API answers 404. */
export const hiddenBoardId = 'clx0000000000000000000049';

/** The API's answer for a board the caller cannot see. */
export const boardNotFoundError = buildErrorBody({
  code: 'NOT_FOUND',
  message: 'Resource not found',
  details: [],
});
