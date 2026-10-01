import { CuidSchema, ROOM_EVENTS, type RoomAck } from '@trello-clone/shared';
import { z } from 'zod';

import { logger } from '../config/logger';
import { AppError } from '../lib/app-error';
import { assertBoardAccess } from '../modules/boards/boards.service';
import { assertWorkspaceAccess } from '../modules/workspaces/workspaces.service';

import type { Socket } from 'socket.io';

// docs/architecture/realtime.md → Rooms. Clients may only join and leave rooms; joining checks
// the same access as the REST API, and a room the caller may not see answers NOT_FOUND.

/** Room names (server-side only; clients send ids, never room names). */
export const boardRoom = (boardId: string) => `board:${boardId}`;
export const workspaceRoom = (workspaceId: string) => `workspace:${workspaceId}`;

const BoardRoomSchema = z.object({ boardId: CuidSchema });
const WorkspaceRoomSchema = z.object({ workspaceId: CuidSchema });

type Ack = (ack: RoomAck) => void;

/** The ack callback, if the client sent one (a message without one is still handled). */
const ackOf = (ack: unknown): Ack => (typeof ack === 'function' ? (ack as Ack) : () => {});

/**
 * Runs `authorize`: a refusal (not found or forbidden) answers NOT_FOUND, with no hint why; any
 * other failure (the database is down) is logged and answers INTERNAL_ERROR, so the client never
 * mistakes an outage for a missing board.
 */
async function authorized(authorize: () => Promise<unknown>): Promise<RoomAck> {
  try {
    await authorize();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError && (error.status === 404 || error.status === 403)) {
      return { ok: false, code: 'NOT_FOUND' };
    }
    logger.error({ err: error }, 'Room join failed');
    return { ok: false, code: 'INTERNAL_ERROR' };
  }
}

interface Room<T> {
  schema: z.ZodType<T>;
  name: (payload: T) => string;
  authorize: (userId: string, payload: T) => Promise<unknown>;
}

const BOARD: Room<z.infer<typeof BoardRoomSchema>> = {
  schema: BoardRoomSchema,
  name: ({ boardId }) => boardRoom(boardId),
  authorize: (userId, { boardId }) => assertBoardAccess(userId, boardId, 'board.view'),
};

const WORKSPACE: Room<z.infer<typeof WorkspaceRoomSchema>> = {
  schema: WorkspaceRoomSchema,
  name: ({ workspaceId }) => workspaceRoom(workspaceId),
  authorize: (userId, { workspaceId }) =>
    assertWorkspaceAccess(userId, workspaceId, 'workspace.view'),
};

export function registerRooms(socket: Socket) {
  const userId = socket.data.userId as string;
  // A socket's room messages run one after another, in the order sent: a join still checking
  // access cannot land after a later leave of the same room (fast navigation, StrictMode).
  let queue: Promise<unknown> = Promise.resolve();
  const inOrder = (run: () => Promise<void>) => {
    // A failing message is logged, so it never leaves an unhandled rejection behind.
    queue = queue.then(run).catch((error: unknown) => {
      logger.warn({ err: error }, 'Room message failed');
    });
  };

  const handle =
    <T>(room: Room<T>, joining: boolean) =>
    (payload: unknown, ack: unknown) =>
      inOrder(async () => {
        const parsed = room.schema.safeParse(payload);
        if (!parsed.success) return ackOf(ack)({ ok: false, code: 'VALIDATION_ERROR' });
        if (!joining) {
          await socket.leave(room.name(parsed.data));
          return ackOf(ack)({ ok: true });
        }
        const result = await authorized(() => room.authorize(userId, parsed.data));
        if (result.ok) await socket.join(room.name(parsed.data));
        ackOf(ack)(result);
      });

  socket.on(ROOM_EVENTS.boardJoin, handle(BOARD, true));
  socket.on(ROOM_EVENTS.boardLeave, handle(BOARD, false));
  socket.on(ROOM_EVENTS.workspaceJoin, handle(WORKSPACE, true));
  socket.on(ROOM_EVENTS.workspaceLeave, handle(WORKSPACE, false));
}
