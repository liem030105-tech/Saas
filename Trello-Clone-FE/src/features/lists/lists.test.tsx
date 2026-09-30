import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard, roadmapDetail } from '@/testing/data/boards';
import {
  blankListTitle,
  blankListTitleMessage,
  doingList,
  listServerError,
  newList,
  roadmapWithLists,
  todoList,
} from '@/testing/data/lists';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { predictAppendPosition } from './queries';

import type { BoardDetailDto, Role } from '@trello-clone/shared';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const LISTS_URL = apiUrl(`/boards/${roadmapBoard.id}/lists`);

/**
 * Signed in with `role`; POST …/lists is recorded and answers `created` (or `fail`'s body with 500).
 * Each GET of the board returns what the server holds at that moment.
 */
function signedInAs(role: Role, board: BoardDetailDto, options: { fail?: boolean } = {}) {
  const state = { board: structuredClone(board), posts: [] as unknown[] };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARD_URL, () => HttpResponse.json({ data: state.board })),
    mswHttp.post(LISTS_URL, async ({ request }) => {
      state.posts.push(await request.json());
      // Long enough for the optimistic list to be seen before the answer lands.
      await delay(50);
      if (options.fail) return HttpResponse.json(listServerError, { status: 500 });
      state.board.lists.push({ ...newList.created, cards: [] });
      return HttpResponse.json({ data: newList.created }, { status: 201 });
    }),
  );
  return state;
}

async function openBoard(role: Role, board: BoardDetailDto, options?: { fail?: boolean }) {
  const state = signedInAs(role, board, options);
  renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { level: 1, name: roadmapBoard.title });
  return state;
}

const listTitles = () =>
  within(screen.getByRole('list', { name: 'Lists' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('lists on the board page', () => {
  afterEach(() => setAccessToken(null));

  it('shows the lists in position order', async () => {
    await openBoard('VIEWER', roadmapWithLists);

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
  });

  it('a MEMBER adds a list: it shows at once, the title is trimmed, and no position is sent', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    // Optimistic: the list is there before the server answers, and the field is ready for the next.
    await waitFor(() =>
      expect(listTitles()).toEqual([todoList.title, doingList.title, newList.sent.title]),
    );
    expect(screen.getByRole('textbox', { name: 'List title' })).toHaveValue('');
    await waitFor(() => expect(state.posts).toEqual([newList.sent]));
    await waitFor(() =>
      expect(listTitles()).toEqual([todoList.title, doingList.title, newList.sent.title]),
    );
  });

  it('an empty board offers "Add a list", and Escape closes the composer', async () => {
    await openBoard('MEMBER', roadmapDetail);

    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'List title' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'List title' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a list' })).toBeVisible();
  });

  it('a blank title shows the field error and sends nothing', async () => {
    const state = await openBoard('MEMBER', roadmapDetail);

    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: blankListTitle },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    expect(await screen.findByText(blankListTitleMessage)).toBeInTheDocument();
    expect(state.posts).toEqual([]);
  });

  it('a failed add removes the optimistic list and says so', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: true });

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    await waitFor(() => expect(listTitles()).toContain(newList.sent.title));
    expect(await screen.findByText(listServerError.error.message)).toBeInTheDocument();
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('an archived board shows its lists without a composer, even to a MEMBER', async () => {
    await openBoard('MEMBER', { ...roadmapWithLists, archived: true });

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
    expect(screen.queryByRole('button', { name: /Add (a|another) list/ })).toBeNull();
  });

  it('a failed add still says so after the composer was closed', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: true });

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(await screen.findByText(listServerError.error.message)).toBeInTheDocument();
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('a VIEWER sees the lists but no composer', async () => {
    await openBoard('VIEWER', roadmapWithLists);

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
    expect(screen.queryByRole('button', { name: /Add (a|another) list/ })).toBeNull();
  });
});

describe('predictAppendPosition', () => {
  it('predicts what the server stores when appending', () => {
    expect(predictAppendPosition([])).toBe(1024);
    expect(predictAppendPosition(roadmapWithLists.lists)).toBe(newList.created.position);
  });
});
