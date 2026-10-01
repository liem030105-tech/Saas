import { emitEvent, versionOf } from './emit';
import { boardRoom, userRoom, workspaceRoom } from '../rooms';
import { realtimeServer } from '../socket';

// A member leaves or is removed from a workspace (docs/architecture/realtime.md → Events): the
// workspace room and the person's own sockets hear `member:removed`, then their sockets leave the
// workspace's rooms, so they hear nothing more from it.

export function memberRemoved(
  actorId: string,
  workspaceId: string,
  userId: string,
  boardIds: string[],
) {
  emitEvent([workspaceRoom(workspaceId), userRoom(userId)], {
    type: 'member:removed',
    boardId: null,
    workspaceId,
    actorId,
    version: versionOf(),
    data: { userId },
  });
  realtimeServer()
    ?.in(userRoom(userId))
    .socketsLeave([workspaceRoom(workspaceId), ...boardIds.map(boardRoom)]);
}
