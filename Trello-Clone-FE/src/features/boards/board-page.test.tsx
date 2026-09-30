import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import {
  archivedBanner,
  boardEdits,
  boardNotFoundError,
  boardPathFor,
  hiddenBoardId,
  roadmapBoard,
  roadmapDetail,
  sprintBoard,
} from '@/testing/data/boards';
import { notFoundCase } from '@/testing/data/routes';
import { acmeAs, acmeWorkspace, workspacePathFor } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, Role } from '@trello-clone/shared';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const BOARDS_URL = apiUrl(`/workspaces/${acmeWorkspace.id}/boards`);

/** Signed in with `role` in acmeWorkspace; PATCH and DELETE on roadmapBoard are recorded. */
function signedInAs(role: Role, board: BoardDetailDto = roadmapDetail) {
  const state = { board: { ...board }, patches: [] as unknown[], deletes: 0 };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARD_URL, () => HttpResponse.json({ data: state.board })),
    mswHttp.patch(BOARD_URL, async ({ request }) => {
      const body = (await request.json()) as Partial<BoardDetailDto>;
      state.patches.push(body);
      state.board = { ...state.board, ...body };
      return HttpResponse.json({ data: state.board });
    }),
    mswHttp.delete(BOARD_URL, () => {
      state.deletes += 1;
      return new HttpResponse(null, { status: 204 });
    }),
    mswHttp.get(BOARDS_URL, ({ request }) => {
      const archived = new URL(request.url).searchParams.get('archived') === 'true';
      return HttpResponse.json({ data: archived ? [{ ...sprintBoard, archived: true }] : [] });
    }),
  );
  return state;
}

async function openBoard(role: Role, board?: BoardDetailDto) {
  const state = signedInAs(role, board);
  const rendered = renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { level: 1, name: new RegExp(roadmapBoard.title) });
  return { ...rendered, state };
}

const actionButton = (name: string) => screen.queryByRole('button', { name: new RegExp(name) });

describe('board page (/b/:boardId)', () => {
  afterEach(() => setAccessToken(null));

  it('a MEMBER renames the board in place (Enter saves the trimmed title)', async () => {
    const { state } = await openBoard('MEMBER');
    await waitFor(() => expect(actionButton('Archive')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: roadmapBoard.title }));
    const input = screen.getByRole('textbox', { name: 'Board title' });
    fireEvent.change(input, { target: { value: boardEdits.rename.typed } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(state.patches).toEqual([boardEdits.rename.sent]));
    expect(
      await screen.findByRole('button', { name: boardEdits.rename.sent.title }),
    ).toBeInTheDocument();
  });

  it('Escape cancels a rename without saving', async () => {
    const { state } = await openBoard('MEMBER');
    await waitFor(() => expect(actionButton('Archive')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: roadmapBoard.title }));
    const input = screen.getByRole('textbox', { name: 'Board title' });
    fireEvent.change(input, { target: { value: boardEdits.rename.typed } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(screen.getByRole('button', { name: roadmapBoard.title })).toBeVisible();
    expect(state.patches).toHaveLength(0);
  });

  it('a MEMBER recolours and archives; the archived banner appears', async () => {
    const { state } = await openBoard('MEMBER');
    await waitFor(() => expect(actionButton('Colour')).toBeInTheDocument());

    fireEvent.keyDown(actionButton('Colour')!, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: boardEdits.recolour.swatch }));
    await waitFor(() => expect(state.patches).toEqual([boardEdits.recolour.sent]));

    fireEvent.click(actionButton('Archive')!);
    await waitFor(() =>
      expect(state.patches).toEqual([boardEdits.recolour.sent, boardEdits.archive.sent]),
    );
    expect(await screen.findByText(new RegExp(archivedBanner))).toBeInTheDocument();
    expect(actionButton('Unarchive')).toBeInTheDocument();
  });

  it('a MEMBER cannot delete; an ADMIN deletes after confirming and lands on the workspace', async () => {
    const member = await openBoard('MEMBER');
    await waitFor(() => expect(actionButton('Archive')).toBeInTheDocument());
    expect(actionButton('Delete')).not.toBeInTheDocument();
    member.unmount();

    const { router, state } = await openBoard('ADMIN');
    fireEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete board' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace)),
    );
    expect(state.deletes).toBe(1);
  });

  it('an OWNER sees every action once the page shows', async () => {
    await openBoard('OWNER');

    expect(screen.getByRole('button', { name: roadmapBoard.title })).toBeInTheDocument();
    for (const name of ['Colour', 'Archive', 'Delete']) expect(actionButton(name)).not.toBeNull();
  });

  it('a VIEWER sees the board without any edit actions', async () => {
    await openBoard('VIEWER');

    await screen.findByText('No lists yet.');
    expect(screen.queryByRole('button', { name: roadmapBoard.title })).toBeNull();
    for (const name of ['Colour', 'Archive', 'Delete']) expect(actionButton(name)).toBeNull();
  });

  it('an archived board shows the banner', async () => {
    await openBoard('VIEWER', { ...roadmapDetail, archived: true });

    expect(await screen.findByText(new RegExp(archivedBanner))).toBeInTheDocument();
  });

  it('a board the caller cannot see shows "Page not found"', async () => {
    signedInAs('OWNER');
    server.use(
      mswHttp.get(apiUrl(`/boards/${hiddenBoardId}`), () =>
        HttpResponse.json(boardNotFoundError, { status: 404 }),
      ),
    );

    renderApp(boardPathFor({ id: hiddenBoardId }));

    expect(
      await screen.findByRole('heading', { level: 1, name: notFoundCase.heading }),
    ).toBeInTheDocument();
  });

  it('the workspace page toggles to the archived boards', async () => {
    signedInAs('MEMBER');
    renderApp(workspacePathFor(acmeWorkspace));
    await screen.findByText('No boards yet.');

    fireEvent.click(screen.getByRole('button', { name: 'Show archived boards' }));

    const grid = await screen.findByRole('list', { name: 'Archived boards' });
    expect(within(grid).getByRole('link', { name: sprintBoard.title })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create board' })).toBeNull();
  });
});
