// Realtime event names (docs/architecture/realtime.md → Events): `<domain>:<past-tense-verb>`
// (D-16 default). The server is the only sender of these; clients only join and leave rooms.

/** Server → client domain events. */
export const REALTIME_EVENTS = [
  'board:created',
  'board:updated',
  'board:deleted',
  'list:created',
  'list:updated',
  'list:moved',
  'list:reordered',
  'list:deleted',
  'card:created',
  'card:updated',
  'card:moved',
  'card:reordered',
  'card:deleted',
  'comment:created',
  'comment:updated',
  'comment:deleted',
  'member:removed',
  'notification:created',
  'notification:updated',
] as const;

export type RealtimeEventType = (typeof REALTIME_EVENTS)[number];

/** Client → server room messages, each answered with a `RoomAck`. */
export const ROOM_EVENTS = {
  boardJoin: 'board:join',
  boardLeave: 'board:leave',
  workspaceJoin: 'workspace:join',
  workspaceLeave: 'workspace:leave',
} as const;
