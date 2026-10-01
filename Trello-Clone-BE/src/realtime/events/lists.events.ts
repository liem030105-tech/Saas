import { emitEvent, versionOf } from './emit';
import { boardRoom } from '../rooms';

import type { List } from '../../generated/prisma/client';
import type { ListDto } from '@trello-clone/shared';

// List events (docs/architecture/realtime.md → Events), all to the list's board room.

interface Board {
  boardId: string;
  workspaceId: string;
}

const envelope = ({ boardId, workspaceId }: Board, actorId: string) => ({
  boardId,
  workspaceId,
  actorId,
});

export function listCreated(board: Board, actorId: string, list: List, data: ListDto) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'list:created',
    ...envelope(board, actorId),
    version: versionOf(list),
    data,
  });
}

export function listUpdated(board: Board, actorId: string, list: List, data: ListDto) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'list:updated',
    ...envelope(board, actorId),
    version: versionOf(list),
    data,
  });
}

export function listMoved(board: Board, actorId: string, list: List) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'list:moved',
    ...envelope(board, actorId),
    version: versionOf(list),
    data: { listId: list.id, position: list.position },
  });
}

/** One event per rebalance, with every list's new position (a rebalance has no updatedAt). */
export function listsReordered(board: Board, actorId: string, positions: Map<string, number>) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'list:reordered',
    ...envelope(board, actorId),
    version: versionOf(),
    data: { positions: Object.fromEntries(positions) },
  });
}

export function listDeleted(board: Board, actorId: string, listId: string) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'list:deleted',
    ...envelope(board, actorId),
    version: versionOf(),
    data: { listId },
  });
}
