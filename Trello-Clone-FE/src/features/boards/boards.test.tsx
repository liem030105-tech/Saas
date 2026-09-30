import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import {
  blankBoardTitle,
  blankBoardTitleMessage,
  boardPathFor,
  newBoard,
  roadmapBoard,
  sprintBoard,
} from '@/testing/data/boards';
import { acmeAs, acmeWorkspace, workspacePathFor } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDto, Role } from '@trello-clone/shared';

const BOARDS_URL = apiUrl(`/workspaces/${acmeWorkspace.id}/boards`);

/** Signed in with `role` in acmeWorkspace, which has `boards`; POST …/boards is recorded. */
function signedInAs(role: Role, boards: BoardDto[]) {
  const state = { boards: [...boards], created: [] as unknown[] };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARDS_URL, () => HttpResponse.json({ data: state.boards })),
    mswHttp.post(BOARDS_URL, async ({ request }) => {
      state.created.push(await request.json());
      state.boards = [newBoard.created, ...state.boards];
      return HttpResponse.json({ data: newBoard.created }, { status: 201 });
    }),
  );
  return state;
}

async function openWorkspace(role: Role, boards: BoardDto[]) {
  const state = signedInAs(role, boards);
  const rendered = renderApp(workspacePathFor(acmeWorkspace));
  await screen.findByRole('heading', { level: 2, name: 'Boards' });
  return { ...rendered, state };
}

describe('boards grid on /w/:slug', () => {
  afterEach(() => setAccessToken(null));

  it('shows each board as a tile linking to the board', async () => {
    await openWorkspace('VIEWER', [roadmapBoard, sprintBoard]);

    const grid = await screen.findByRole('list', { name: 'Boards' });
    const links = within(grid).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([roadmapBoard.title, sprintBoard.title]);
    expect(links[0]).toHaveAttribute('href', boardPathFor(roadmapBoard));
  });

  it('a VIEWER sees the grid without a way to create boards', async () => {
    await openWorkspace('VIEWER', [roadmapBoard]);

    await screen.findByRole('list', { name: 'Boards' });
    expect(screen.queryByRole('button', { name: 'Create board' })).not.toBeInTheDocument();
  });

  it('an empty workspace says so; a VIEWER gets no create button', async () => {
    await openWorkspace('VIEWER', []);

    expect(await screen.findByText('No boards yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create your first board' })).toBeNull();
  });

  it('a MEMBER creates a board with a title and background; it appears first', async () => {
    const { state } = await openWorkspace('MEMBER', [roadmapBoard]);

    fireEvent.click(await screen.findByRole('button', { name: 'Create board' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Board title'), {
      target: { value: newBoard.typed.title },
    });
    fireEvent.click(within(dialog).getByRole('radio', { name: newBoard.typed.swatch }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create board' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(state.created).toEqual([newBoard.sent]);
    const grid = screen.getByRole('list', { name: 'Boards' });
    expect(within(grid).getAllByRole('link')[0]).toHaveTextContent(newBoard.created.title);
  });

  it('an empty workspace offers "Create your first board" to a MEMBER', async () => {
    await openWorkspace('MEMBER', []);

    fireEvent.click(await screen.findByRole('button', { name: 'Create your first board' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('a blank title shows the field message and sends nothing', async () => {
    const { state } = await openWorkspace('OWNER', [roadmapBoard]);

    fireEvent.click(await screen.findByRole('button', { name: 'Create board' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Board title'), {
      target: { value: blankBoardTitle },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create board' }));

    expect(await within(dialog).findByText(blankBoardTitleMessage)).toBeInTheDocument();
    expect(state.created).toHaveLength(0);
  });
});
