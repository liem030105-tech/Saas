import { roadmapBoard } from './boards';
import { loginCard } from './cards';
import { doingList, todoList } from './lists';
import { ownerMember, plainMember } from './workspaces';

import type { ActivityDto } from '@trello-clone/shared';

// The roadmap board's activity (CARD-005e), newest first as the API lists it. Ada (OWNER) acts.

const ada = { id: ownerMember.user.id, name: ownerMember.user.name, avatarUrl: null };

const entry = (
  n: number,
  type: ActivityDto['type'],
  data: Record<string, unknown>,
  cardId: string | null,
): ActivityDto => ({
  id: `clx00000000000000000003${String(n).padStart(2, '0')}`,
  type,
  data,
  createdAt: `2026-10-01T1${n % 10}:00:00.000Z`,
  cardId,
  user: ada,
});

export const loginMoved = entry(
  5,
  'CARD_MOVED',
  {
    fromListId: todoList.id,
    toListId: doingList.id,
    fromBoardId: roadmapBoard.id,
    toBoardId: roadmapBoard.id,
  },
  loginCard.id,
);
export const linusAdded = entry(4, 'MEMBER_ADDED', { userId: plainMember.user.id }, loginCard.id);
export const loginCreated = entry(
  3,
  'CARD_CREATED',
  { listId: todoList.id, title: loginCard.title },
  loginCard.id,
);
export const todoCreated = entry(2, 'LIST_CREATED', { listId: todoList.id, title: 'To do' }, null);
export const boardCreated = entry(1, 'BOARD_CREATED', { title: roadmapBoard.title }, null);

/** The whole feed, newest first. */
export const roadmapActivity = [loginMoved, linusAdded, loginCreated, todoCreated, boardCreated];
