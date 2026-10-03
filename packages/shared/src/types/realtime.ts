import type { BoardDto } from './boards';
import type { CardSummaryDto } from './cards';
import type { CommentDto } from './comments';
import type { ListDto } from './lists';
import type { NotificationDto } from './notifications';
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
  /** The tile as it is now; `archived` tells the board to drop (or bring back) the tile. */
  'card:updated': CardSummaryDto & { archived: boolean };
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
  /** To the recipient's own sockets (NOTIFICATIONS-001). */
  'notification:created': NotificationDto;
  /** One notification read or unread, or all of them read; to the recipient's other tabs. */
  'notification:updated': { notificationId: string; read: boolean } | { all: true };
}

/** Every server event: the envelope around its `data`. */
export interface RealtimeEvent<TType extends RealtimeEventType = RealtimeEventType> {
  /** Unique per emission (uuid v4), for de-duplication. */
  eventId: string;
  /** The Socket.IO event name. */
  type: TType;
  /** Null for workspace-level events. */
  boardId: string | null;
  /** Null only for `notification:updated` with `all` (it spans the caller's workspaces). */
  workspaceId: TType extends 'notification:updated' ? string | null : string;
  /** The user who caused the change. */
  actorId: string;
  /** `updatedAt` (epoch ms) of the changed record; `Date.now()` for deletes and `*:reordered`. */
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
