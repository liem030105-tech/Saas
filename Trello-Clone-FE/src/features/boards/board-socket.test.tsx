import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import { adaComment, myComment } from '@/testing/data/comments';
import { doingList, todoList } from '@/testing/data/lists';
import { acmeAs, ownerMember } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';
import { renderApp } from '@/testing/render';

// REALTIME-001c: the board page follows everyone else's changes (docs/architecture/realtime.md →
// FE synchronization rules), through the in-memory realtime connection (testing/realtime).

const someoneElse = ownerMember.user.id;
const envelope = (actorId = someoneElse) => ({
  boardId: roadmapBoard.id,
  workspaceId: roadmapBoard.workspaceId,
  actorId,
  version: Date.parse('2026-10-01T00:00:00.000Z'),
});

function signedIn() {
  const state = {
    boardGets: 0,
    cardGets: 0,
    commentGets: 0,
    board: structuredClone(roadmapWithCards),
  };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs('MEMBER')] })),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () => {
      state.boardGets += 1;
      return HttpResponse.json({ data: state.board });
    }),
    mswHttp.get(apiUrl('/cards/:cardId'), () => {
      state.cardGets += 1;
      return HttpResponse.json({ data: loginCardDetail });
    }),
    mswHttp.get(apiUrl('/cards/:cardId/comments'), () => {
      state.commentGets += 1;
      return HttpResponse.json({ data: [], nextCursor: null });
    }),
  );
  return state;
}

async function openBoard() {
  const state = signedIn();
  const { queryClient } = renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { name: 'To do', level: 2 });
  await waitFor(() =>
    expect(realtime().sent).toContain(`board:join {"boardId":"${roadmapBoard.id}"}`),
  );
  // Joining refetches the board once (changes made while it loaded reach no event).
  await waitFor(() => expect(state.boardGets).toBe(2));
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  return state;
}

const listTitles = () =>
  within(screen.getByRole('list', { name: 'Lists' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('board realtime sync (REALTIME-001c)', () => {
  afterEach(() => setAccessToken(null));

  it('joins the board room, and leaves it when the page goes away', async () => {
    const { unmount } = renderApp(boardPathFor(roadmapBoard));
    signedIn();
    await screen.findByRole('heading', { name: 'To do', level: 2 });
    await waitFor(() =>
      expect(realtime().sent).toContain(`board:join {"boardId":"${roadmapBoard.id}"}`),
    );

    unmount();

    expect(realtime().sent.at(-1)).toBe(`board:leave {"boardId":"${roadmapBoard.id}"}`);
  });

  it("someone else's list and card changes show at once", async () => {
    await openBoard();

    realtime().serverSends('list:created', {
      ...envelope(),
      data: { ...doingList, id: 'clx00000000000000000000l3', title: 'Done', position: 9000 },
    });
    await waitFor(() => expect(listTitles()).toEqual(['To do', 'Doing', 'Done']));

    realtime().serverSends('card:moved', {
      ...envelope(),
      data: {
        cardId: loginCard.id,
        fromListId: todoList.id,
        toListId: doingList.id,
        fromBoardId: roadmapBoard.id,
        toBoardId: roadmapBoard.id,
        position: 1024,
      },
    });
    const doing = screen.getByRole('region', { name: 'Doing' });
    await waitFor(() =>
      expect(within(doing).getByRole('link', { name: /Fix login/ })).toBeVisible(),
    );

    realtime().serverSends('card:updated', {
      ...envelope(),
      data: { ...loginCard, listId: doingList.id, position: 1024, archived: true },
    });
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: /Fix login/ })).not.toBeInTheDocument(),
    );
  });

  it('ignores repeats and stale events; applies the same user’s changes from another tab', async () => {
    await openBoard();
    const renamed = (title: string) => ({ ...roadmapBoard, title });

    realtime().serverSends('board:updated', {
      ...envelope(),
      version: Date.parse(roadmapBoard.updatedAt), // not newer than what is shown
      data: renamed('Stale'),
    });
    realtime().serverSends('list:deleted', {
      ...envelope(),
      eventId: 'once',
      data: { listId: doingList.id },
    });
    await waitFor(() => expect(listTitles()).toEqual(['To do']));
    // The same event again (and the list back on the server) changes nothing.
    realtime().serverSends('list:created', { ...envelope(), eventId: 'once', data: doingList });

    expect(screen.getByRole('heading', { name: roadmapBoard.title, level: 1 })).toBeVisible();
    expect(listTitles()).toEqual(['To do']);

    // This user, in another tab (the server never sends this tab its own changes).
    realtime().serverSends('list:created', { ...envelope(currentUser.id), data: doingList });
    await waitFor(() => expect(listTitles()).toEqual(['To do', 'Doing']));
  });

  it('REST requests name this tab’s connection (X-Socket-Id), so its own changes are not echoed', async () => {
    let header: string | null = null;
    server.use(
      mswHttp.post(apiUrl(`/boards/${roadmapBoard.id}/lists`), async ({ request }) => {
        header = request.headers.get('x-socket-id');
        const { title } = (await request.json()) as { title: string };
        return HttpResponse.json(
          { data: { ...doingList, id: 'clx00000000000000000000l4', title, position: 9000 } },
          { status: 201 },
        );
      }),
    );
    await openBoard();

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: 'Done' },
    });
    fireEvent.submit(screen.getByRole('textbox', { name: 'List title' }).closest('form')!);

    await waitFor(() => expect(header).toBe(realtime().id));
  });

  it('an event during its own pending change waits for it: the change refetches the board after', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const state = await openBoard();
    server.use(
      mswHttp.patch(apiUrl(`/lists/${todoList.id}`), async () => {
        await gate;
        return HttpResponse.json({ data: { ...todoList, title: 'Mine' } });
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: todoList.title }));
    const input = screen.getByRole('textbox', { name: 'List title' });
    fireEvent.change(input, { target: { value: 'Mine' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(listTitles()).toEqual(['Mine', 'Doing']));

    // Someone renames the other list meanwhile: not patched over the pending rename …
    state.board.lists[0]!.title = 'Mine';
    state.board.lists[1]!.title = 'Theirs';
    realtime().serverSends('list:updated', {
      ...envelope(),
      data: { ...doingList, title: 'Theirs' },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(listTitles()).toEqual(['Mine', 'Doing']);

    // … the rename's own refetch brings it.
    release();
    await waitFor(() => expect(listTitles()).toEqual(['Mine', 'Theirs']));
  });

  it('events that arrive while the board is being fetched are not lost to that older answer', async () => {
    const state = await openBoard();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let answered = 0;
    server.use(
      mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), async () => {
        const snapshot = structuredClone(state.board); // the board as it is when the GET runs
        if (answered++ === 0) await gate;
        return HttpResponse.json({ data: snapshot });
      }),
    );
    realtime().reconnect(); // the join refetches the board: that GET waits
    await waitFor(() => expect(answered).toBe(1));

    // Someone adds a list meanwhile; its event arrives before that older answer.
    const done = { ...doingList, id: 'clx00000000000000000000l5', title: 'Done', position: 9000 };
    state.board.lists.push({ ...done, cards: [] });
    realtime().serverSends('list:created', { ...envelope(), data: done });
    // More events during the same fetch still cost one more fetch, not one each.
    for (const title of ['Done!', 'Done!!']) {
      state.board.lists[2]!.title = title;
      realtime().serverSends('list:updated', { ...envelope(), data: { ...done, title } });
    }
    expect(answered).toBe(1); // nothing cancelled or added while it runs
    release();

    await waitFor(() => expect(listTitles()).toEqual(['To do', 'Doing', 'Done!!']));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(answered).toBe(2);
  });

  it('refetches the board after a reconnect, and when the event cannot be applied', async () => {
    const state = await openBoard();
    const before = state.boardGets;

    realtime().reconnect();
    await waitFor(() => expect(state.boardGets).toBe(before + 1));
    expect(realtime().sent.filter((m) => m.startsWith('board:join'))).toHaveLength(2);

    realtime().serverSends('card:moved', {
      ...envelope(),
      data: {
        cardId: 'clx00000000000000000000c9',
        fromListId: 'clx00000000000000000000x1',
        toListId: todoList.id,
        fromBoardId: 'clx0000000000000000000039',
        toBoardId: roadmapBoard.id,
        position: 5000,
      },
    });
    await waitFor(() => expect(state.boardGets).toBe(before + 2));
  });

  it('the open card refetches on a change made elsewhere; a comment is added to its list', async () => {
    const state = signedIn();
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    await screen.findByRole('dialog', { name: loginCard.title });
    await waitFor(() => expect(state.commentGets).toBe(1));
    const cardGets = state.cardGets;

    realtime().serverSends('card:updated', {
      ...envelope(),
      data: { ...loginCard, title: 'Fixed', archived: false },
    });
    await waitFor(() => expect(state.cardGets).toBe(cardGets + 1));

    realtime().serverSends('comment:created', { ...envelope(), data: adaComment });
    expect(
      await screen.findByRole('article', { name: `Comment by ${adaComment.author.name}` }),
    ).toBeVisible();
    expect(state.commentGets).toBe(1); // patched in, not refetched
  });

  it('a comment arriving while its own comment is being sent keeps both', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const state = signedIn();
    server.use(
      mswHttp.post(apiUrl(`/cards/${loginCard.id}/comments`), async ({ request }) => {
        await gate;
        const { content } = (await request.json()) as { content: string };
        return HttpResponse.json({ data: { ...myComment, content } }, { status: 201 });
      }),
    );
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    await screen.findByRole('dialog', { name: loginCard.title });
    await waitFor(() => expect(state.commentGets).toBe(1));

    fireEvent.change(screen.getByRole('textbox', { name: 'Write a comment' }), {
      target: { value: 'Mine' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comment' }));
    const mine = `Comment by ${currentUser.name}`;
    await screen.findByRole('article', { name: mine });

    realtime().serverSends('comment:created', { ...envelope(), data: adaComment });
    await screen.findByRole('article', { name: `Comment by ${adaComment.author.name}` });
    release();

    await waitFor(() =>
      expect(screen.getByRole('article', { name: mine })).not.toHaveAttribute('aria-busy'),
    );
    expect(screen.getByRole('article', { name: mine })).toHaveTextContent('Mine');
    expect(screen.getAllByRole('article')).toHaveLength(2);
  });
});
