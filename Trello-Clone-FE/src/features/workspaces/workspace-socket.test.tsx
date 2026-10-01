import { screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard, sprintBoard } from '@/testing/data/boards';
import { roadmapWithCards } from '@/testing/data/cards';
import { firstWorkspacePage } from '@/testing/data/routes';
import {
  acmeWorkspace,
  betaWorkspace,
  ownerMember,
  workspacePathFor,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';
import { renderApp } from '@/testing/render';

import type { WorkspaceDto } from '@trello-clone/shared';

// REALTIME-001c: workspace-level realtime (docs/architecture/realtime.md → FE synchronization
// rules): the sidebar's workspace rooms, the boards grid, and being removed from a workspace.

const envelope = (workspaceId = acmeWorkspace.id) => ({
  boardId: null,
  workspaceId,
  actorId: ownerMember.user.id,
  version: Date.parse('2026-10-01T00:00:00.000Z'),
});

function signedIn() {
  const state = {
    workspaces: [acmeWorkspace, betaWorkspace] as WorkspaceDto[],
    workspaceGets: 0,
    boards: [roadmapBoard],
    boardGets: 0,
    memberGets: 0,
  };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => {
      state.workspaceGets += 1;
      return HttpResponse.json({ data: state.workspaces });
    }),
    mswHttp.get(apiUrl(`/workspaces/${acmeWorkspace.id}/boards`), () => {
      state.boardGets += 1;
      return HttpResponse.json({ data: state.boards });
    }),
    mswHttp.get(apiUrl(`/workspaces/${acmeWorkspace.id}/members`), () => {
      state.memberGets += 1;
      return HttpResponse.json({ data: [] });
    }),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: roadmapWithCards }),
    ),
  );
  return state;
}

const joined = (workspace: WorkspaceDto) => `workspace:join {"workspaceId":"${workspace.id}"}`;
const left = (workspace: WorkspaceDto) => `workspace:leave {"workspaceId":"${workspace.id}"}`;

describe('workspace realtime sync (REALTIME-001c)', () => {
  afterEach(() => setAccessToken(null));

  it("the sidebar joins each of the caller's workspace rooms", async () => {
    signedIn();
    renderApp(workspacePathFor(acmeWorkspace));

    await waitFor(() =>
      expect(realtime().sent).toEqual(
        expect.arrayContaining([joined(acmeWorkspace), joined(betaWorkspace)]),
      ),
    );
  });

  it('boards created, renamed or deleted elsewhere show in the grid', async () => {
    const state = signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    const grid = await screen.findByRole('link', { name: roadmapBoard.title });
    expect(grid).toBeVisible();

    state.boards = [sprintBoard, roadmapBoard];
    realtime().serverSends('board:created', { ...envelope(), data: sprintBoard });
    expect(await screen.findByRole('link', { name: sprintBoard.title })).toBeVisible();

    const renamed = { ...sprintBoard, title: 'Sprint 13' };
    state.boards = [renamed, roadmapBoard];
    realtime().serverSends('board:updated', { ...envelope(), data: renamed });
    expect(await screen.findByRole('link', { name: renamed.title })).toBeVisible();

    // An event of another workspace changes nothing here.
    const gets = state.boardGets;
    realtime().serverSends('board:deleted', {
      ...envelope(betaWorkspace.id),
      data: { boardId: 'clx0000000000000000000049' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(state.boardGets).toBe(gets);
  });

  it('removed from a workspace elsewhere: only its room is left; removed from this one, the page goes to /', async () => {
    const state = signedIn();
    const { router } = renderApp(workspacePathFor(acmeWorkspace));
    await screen.findByRole('heading', { level: 1, name: acmeWorkspace.name });
    await waitFor(() => expect(realtime().sent).toContain(joined(betaWorkspace)));

    // Removed from another workspace: this page stays, and only that room is left.
    state.workspaces = [acmeWorkspace];
    realtime().serverSends('member:removed', {
      ...envelope(betaWorkspace.id),
      data: { userId: currentUser.id },
    });
    await waitFor(() => expect(realtime().sent).toContain(left(betaWorkspace)));
    expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace));
    expect(realtime().sent).not.toContain(left(acmeWorkspace));

    // Then from this one: no workspace is left, so `/` asks for a first one.
    state.workspaces = [];
    realtime().serverSends('member:removed', { ...envelope(), data: { userId: currentUser.id } });

    expect(
      await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/');
  });

  it('removed from the board’s workspace: the board page goes to /', async () => {
    const state = signedIn();
    const { router } = renderApp(boardPathFor(roadmapBoard));
    await screen.findByRole('heading', { level: 1, name: roadmapBoard.title });

    // Removed from another workspace: the board stays.
    realtime().serverSends('member:removed', {
      ...envelope(betaWorkspace.id),
      data: { userId: currentUser.id },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(router.state.location.pathname).toBe(boardPathFor(roadmapBoard));

    state.workspaces = [];
    realtime().serverSends('member:removed', { ...envelope(), data: { userId: currentUser.id } });

    await waitFor(() =>
      expect(router.state.location.pathname).not.toBe(boardPathFor(roadmapBoard)),
    );
  });

  it('a workspace that comes or goes joins or leaves only its own room', async () => {
    const state = signedIn();
    const { queryClient } = renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(() => expect(realtime().sent).toContain(joined(betaWorkspace)));
    const gamma = { ...betaWorkspace, id: 'clx0000000000000000000013', slug: 'gamma' };

    // A new workspace whose join is refused (gone again already): the list is fetched again.
    state.workspaces = [acmeWorkspace, betaWorkspace, gamma];
    realtime().ack = { ok: false, code: 'NOT_FOUND' };
    const gets = state.workspaceGets;
    void queryClient.invalidateQueries({ queryKey: ['workspaces'], exact: true });
    await waitFor(() => expect(realtime().sent).toContain(joined(gamma)));
    await waitFor(() => expect(state.workspaceGets).toBe(gets + 2));

    const sent = realtime().sent;
    for (const workspace of [acmeWorkspace, betaWorkspace]) {
      expect(sent.filter((m) => m === joined(workspace))).toHaveLength(1);
      expect(sent).not.toContain(left(workspace));
    }
  });

  it('removed while on the members page: it goes to /', async () => {
    const state = signedIn();
    const { router } = renderApp(`${workspacePathFor(acmeWorkspace)}/members`);
    await waitFor(() => expect(state.memberGets).toBe(1));

    state.workspaces = [betaWorkspace];
    realtime().serverSends('member:removed', { ...envelope(), data: { userId: currentUser.id } });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(betaWorkspace)),
    );
  });

  it("someone else's removal refetches the member list; a workspace lost while disconnected drops out", async () => {
    const state = signedIn();
    renderApp(`${workspacePathFor(acmeWorkspace)}/members`);
    await waitFor(() => expect(state.memberGets).toBe(1));

    realtime().serverSends('member:removed', {
      ...envelope(),
      data: { userId: ownerMember.user.id },
    });
    await waitFor(() => expect(state.memberGets).toBe(2));

    // Removed while disconnected: the reconnect refetches the list (and the join is refused).
    state.workspaces = [betaWorkspace];
    realtime().ack = { ok: false, code: 'NOT_FOUND' };
    realtime().reconnect();
    const sidebar = screen.getByRole('navigation', { name: 'Workspaces' });
    await waitFor(() =>
      expect(within(sidebar).queryByRole('link', { name: acmeWorkspace.name })).toBeNull(),
    );
  });
});
