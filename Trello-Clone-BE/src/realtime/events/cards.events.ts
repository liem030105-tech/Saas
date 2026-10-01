import { emitEvent, versionOf } from './emit';
import { boardRoom } from '../rooms';

import type { RealtimeEventData } from '@trello-clone/shared';

// Card events (docs/architecture/realtime.md → Events), to the card's board room; a move to another
// board reaches both boards.

interface Board {
  boardId: string;
  workspaceId: string;
}

const envelope = ({ boardId, workspaceId }: Board, actorId: string) => ({
  boardId,
  workspaceId,
  actorId,
});

export function cardCreated(
  board: Board,
  actorId: string,
  card: { updatedAt: Date },
  data: RealtimeEventData['card:created'],
) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'card:created',
    ...envelope(board, actorId),
    version: versionOf(card),
    data,
  });
}

/**
 * `version`: the card's `updatedAt` after a PATCH; a change to its labels, members or checklists
 * does not touch the card row, so those pass the time taken just before the tile was read.
 */
export function cardUpdated(
  board: Board,
  actorId: string,
  data: RealtimeEventData['card:updated'],
  version: number,
) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'card:updated',
    ...envelope(board, actorId),
    version,
    data,
  });
}

/** To the board it left and, if different, the board it joined (envelope `boardId`: the new one). */
export function cardMoved(
  workspaceId: string,
  actorId: string,
  card: { updatedAt: Date },
  data: RealtimeEventData['card:moved'],
) {
  const rooms = [...new Set([data.fromBoardId, data.toBoardId])].map(boardRoom);
  emitEvent(rooms, {
    type: 'card:moved',
    ...envelope({ boardId: data.toBoardId, workspaceId }, actorId),
    version: versionOf(card),
    data,
  });
}

/** One event per rebalance of a list, with every card's new position. */
export function cardsReordered(
  board: Board,
  actorId: string,
  listId: string,
  positions: Map<string, number>,
) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'card:reordered',
    ...envelope(board, actorId),
    version: versionOf(),
    data: { listId, positions: Object.fromEntries(positions) },
  });
}

export function cardDeleted(board: Board, actorId: string, cardId: string, listId: string) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'card:deleted',
    ...envelope(board, actorId),
    version: versionOf(),
    data: { cardId, listId },
  });
}
