import type { BoardDto } from './boards';
import type { CardSummaryDto } from './cards';
import type { CommentDto } from './comments';
import type { ListDto } from './lists';
import type { RealtimeEventType } from '../constants/events';

// docs/architecture/realtime.md → Event envelope and Events.

/** The `data` of each server event. */
export interface RealtimeEventData {
  'board:created': BoardDto;
  'board:updated': BoardDto;
  'board:deleted': { boardId: string };
  'list:created': ListDto;
  'list:updated': ListDto;
  'list:moved': { listId: string; position: number };
  'list:reordered': { positions: Record<string, number> };
  'list:deleted': { listId: string };
  'card:created': CardSummaryDto;
  'card:updated': CardSummaryDto;
  'card:moved': {
    cardId: string;
    fromListId: string;
    toListId: string;
    fromBoardId: string;
    toBoardId: string;
    position: number;
  };
  'card:reordered': { listId: string; positions: Record<string, number> };
  'card:deleted': { cardId: string; listId: string };
  'comment:created': CommentDto;
  'comment:updated': CommentDto;
  'comment:deleted': { commentId: string; cardId: string };
  'member:removed': { userId: string };
}

/** Every server event: the envelope around its `data`. */
export interface RealtimeEvent<TType extends RealtimeEventType = RealtimeEventType> {
  /** Unique per emission (uuid v4), for de-duplication. */
  eventId: string;
  /** The Socket.IO event name. */
  type: TType;
  /** Null for workspace-level events. */
  boardId: string | null;
  workspaceId: string;
  /** The user who caused the change. */
  actorId: string;
  /** `updatedAt` (epoch ms) of the changed record; `Date.now()` for deletes. */
  version: number;
  data: RealtimeEventData[TType];
}

/** What a room join or leave answers. */
export type RoomAck =
  { ok: true } | { ok: false; code: 'NOT_FOUND' | 'VALIDATION_ERROR' | 'INTERNAL_ERROR' };

/** Client → server room messages. */
export interface RoomRequest {
  'board:join': { boardId: string };
  'board:leave': { boardId: string };
  'workspace:join': { workspaceId: string };
  'workspace:leave': { workspaceId: string };
}
