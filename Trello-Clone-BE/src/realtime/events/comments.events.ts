import { emitEvent, versionOf } from './emit';
import { boardRoom } from '../rooms';

import type { CommentDto } from '@trello-clone/shared';

// Comment events (docs/architecture/realtime.md → Events), to the card's board room.

interface Board {
  boardId: string;
  workspaceId: string;
}

const envelope = ({ boardId, workspaceId }: Board, actorId: string) => ({
  boardId,
  workspaceId,
  actorId,
});

export function commentCreated(board: Board, actorId: string, data: CommentDto) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'comment:created',
    ...envelope(board, actorId),
    version: Date.parse(data.updatedAt),
    data,
  });
}

export function commentUpdated(board: Board, actorId: string, data: CommentDto) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'comment:updated',
    ...envelope(board, actorId),
    version: Date.parse(data.updatedAt),
    data,
  });
}

export function commentDeleted(board: Board, actorId: string, commentId: string, cardId: string) {
  emitEvent([boardRoom(board.boardId)], {
    type: 'comment:deleted',
    ...envelope(board, actorId),
    version: versionOf(),
    data: { commentId, cardId },
  });
}
