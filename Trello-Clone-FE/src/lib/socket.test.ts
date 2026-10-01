import { http as mswHttp, HttpResponse } from 'msw';

import { onSessionEnded } from '@/api/client';
import { getAccessToken, setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  freshAccessToken,
  refreshUnauthorizedBody,
  serverErrorBody,
  staleAccessToken,
} from '@/testing/data/auth';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';

import { closeRealtime, createEventDedupe, joinRoom, onEvent, onReconnect } from './socket';

const boardId = 'clx0000000000000000000031';
const workspaceId = 'clx0000000000000000000011';
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('realtime connection (lib/socket)', () => {
  afterEach(() => setAccessToken(null));

  it('joins rooms once connected, again after a reconnect, and leaves when the last holder lets go', async () => {
    const leaveA = joinRoom('board:join', { boardId });
    const leaveB = joinRoom('board:join', { boardId }); // a second holder of the same room
    joinRoom('workspace:join', { workspaceId });
    await tick();
    const socket = realtime();
    expect(socket.sent).toEqual([
      `board:join {"boardId":"${boardId}"}`,
      `workspace:join {"workspaceId":"${workspaceId}"}`,
    ]);

    const reconnected = vi.fn();
    onReconnect(reconnected);
    socket.reconnect();
    expect(socket.sent.slice(2)).toEqual(socket.sent.slice(0, 2));
    expect(reconnected).toHaveBeenCalledTimes(1);

    leaveA();
    expect(socket.sent).toHaveLength(4); // still held by B
    leaveB();
    expect(socket.sent.at(-1)).toBe(`board:leave {"boardId":"${boardId}"}`);
  });

  it('a refused join reports its ack', async () => {
    joinRoom('board:join', { boardId });
    await tick();
    realtime().ack = { ok: false, code: 'NOT_FOUND' };
    const refused = vi.fn();
    joinRoom('board:join', { boardId: 'clx0000000000000000000032' }, refused);

    expect(refused).toHaveBeenCalledWith({ ok: false, code: 'NOT_FOUND' });
  });

  it('delivers events to their listeners until they unsubscribe', async () => {
    const heard = vi.fn();
    const off = onEvent('list:deleted', heard);
    await tick();
    const event = {
      boardId,
      workspaceId,
      actorId: 'a',
      version: 1,
      data: { listId: 'l' },
    };
    realtime().serverSends('list:deleted', event);
    off();
    realtime().serverSends('list:deleted', event);

    expect(heard).toHaveBeenCalledTimes(1);
  });

  it('a handshake refused as UNAUTHORIZED refreshes the token, then connects again', async () => {
    setAccessToken(staleAccessToken);
    server.use(
      mswHttp.post(apiUrl('/auth/refresh'), () =>
        HttpResponse.json({ data: { accessToken: freshAccessToken } }),
      ),
    );
    joinRoom('board:join', { boardId });
    await tick();
    const socket = realtime();
    const connect = vi.spyOn(socket, 'connect');

    socket.refuseHandshake('UNAUTHORIZED');

    await vi.waitFor(() => expect(connect).toHaveBeenCalled());
    expect(getAccessToken()).toBe(freshAccessToken);
  });

  it('a refresh refused with 401 ends the session; one that fails otherwise connects again later', async () => {
    const ended = vi.fn();
    const off = onSessionEnded(ended);
    setAccessToken(staleAccessToken);
    let refresh = () => HttpResponse.json(serverErrorBody, { status: 500 });
    server.use(mswHttp.post(apiUrl('/auth/refresh'), () => refresh()));
    joinRoom('board:join', { boardId });
    await tick();
    const socket = realtime();
    const connect = vi.spyOn(socket, 'connect');
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      socket.refuseHandshake('UNAUTHORIZED');
      await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1)); // the outage: retry later
      expect(connect).not.toHaveBeenCalled();
      await vi.runOnlyPendingTimersAsync();
      expect(connect).toHaveBeenCalledTimes(1);
      expect(ended).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }

    refresh = () => HttpResponse.json(refreshUnauthorizedBody, { status: 401 });
    socket.refuseHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(ended).toHaveBeenCalledWith('expired'));
    expect(connect).toHaveBeenCalledTimes(1);
    off();
  });

  it('stops after three handshakes in a row refused as UNAUTHORIZED', async () => {
    setAccessToken(staleAccessToken);
    let refreshes = 0;
    server.use(
      mswHttp.post(apiUrl('/auth/refresh'), () => {
        refreshes += 1;
        return HttpResponse.json({ data: { accessToken: freshAccessToken } });
      }),
    );
    joinRoom('board:join', { boardId });
    await tick();
    const socket = realtime();
    // The server keeps refusing: each refresh connects, and the handshake is refused again.
    vi.spyOn(socket, 'connect').mockImplementation(() => {
      queueMicrotask(() => socket.refuseHandshake('UNAUTHORIZED'));
      return socket;
    });

    socket.refuseHandshake('UNAUTHORIZED');
    await vi.waitFor(() => expect(refreshes).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(refreshes).toBe(3);
  });

  it('closing forgets the rooms', async () => {
    joinRoom('board:join', { boardId });
    await tick();
    closeRealtime();
    joinRoom('workspace:join', { workspaceId });
    await tick();

    expect(realtime().sent).toEqual([`workspace:join {"workspaceId":"${workspaceId}"}`]);
  });
});

describe('createEventDedupe', () => {
  it('lets each id through once, remembering only the last `size` ids', () => {
    const isNew = createEventDedupe(2);

    expect(['a', 'a', 'b', 'c', 'a'].map(isNew)).toEqual([true, false, true, true, true]);
  });
});
