import { emitEvent, versionOf } from './emit';
import { boardRoom, workspaceRoom } from '../rooms';
import { realtimeServer } from '../socket';

import type { Board } from '../../generated/prisma/client';
import type { BoardDto } from '@trello-clone/shared';

// Board events (docs/architecture/realtime.md → Events): the workspace room sees boards come and
// go; the board's own room also hears about its updates and deletion.

export function boardCreated(actorId: string, board: Board, data: BoardDto) {
  emitEvent([workspaceRoom(board.workspaceId)], {
    type: 'board:created',
    boardId: board.id,
    workspaceId: board.workspaceId,
    actorId,
    version: versionOf(board),
    data,
  });
}

export function boardUpdated(actorId: string, board: Board, data: BoardDto) {
  emitEvent([workspaceRoom(board.workspaceId), boardRoom(board.id)], {
    type: 'board:updated',
    boardId: board.id,
    workspaceId: board.workspaceId,
    actorId,
    version: versionOf(board),
    data,
  });
}

/** Also empties the board's room: nothing is left to hear about. */
export function boardDeleted(actorId: string, boardId: string, workspaceId: string) {
  emitEvent([workspaceRoom(workspaceId), boardRoom(boardId)], {
    type: 'board:deleted',
    boardId,
    workspaceId,
    actorId,
    version: versionOf(),
    data: { boardId },
  });
  realtimeServer()?.in(boardRoom(boardId)).socketsLeave(boardRoom(boardId));
}
