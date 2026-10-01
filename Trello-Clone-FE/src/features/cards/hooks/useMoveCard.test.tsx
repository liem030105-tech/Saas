import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { Toaster } from '@/components/ui/sonner';
import { boardKeys, useBoard } from '@/features/boards';
import { apiUrl } from '@/testing/data/api';
import { freshAccessToken } from '@/testing/data/auth';
import { roadmapBoard } from '@/testing/data/boards';
import { cardMoveErrors, loginCard, roadmapWithCards, signupCard } from '@/testing/data/cards';
import { doingList, todoList } from '@/testing/data/lists';
import { server } from '@/testing/mocks/server';

import { useMoveCard } from './useMoveCard';

import type { BoardDetailDto, CardSummaryDto } from '@trello-clone/shared';
import type { ReactNode } from 'react';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const MOVE_URL = apiUrl('/cards/:cardId/move');

/**
 * A fake server holding the board's cards. A move stores the sent list and position, or renumbers
 * the target list to 1024, 2048, … when `rebalance` is on (as the real server does when a gap
 * gets too small); `fail` answers with that error instead.
 */
function fakeServer(
  options: {
    fail?: (typeof cardMoveErrors)[keyof typeof cardMoveErrors];
    rebalance?: boolean;
  } = {},
) {
  const state = {
    cards: roadmapWithCards.lists.flatMap((list) => list.cards.map((card) => ({ ...card }))),
    moves: [] as { cardId: string; listId: string; position: number }[],
    boardGets: 0,
  };
  const board = (): BoardDetailDto => ({
    ...roadmapWithCards,
    lists: roadmapWithCards.lists.map((list) => ({
      ...list,
      cards: state.cards
        .filter((card) => card.listId === list.id)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    })),
  });
  server.use(
    mswHttp.get(BOARD_URL, () => {
      state.boardGets += 1;
      return HttpResponse.json({ data: board() });
    }),
    mswHttp.patch(MOVE_URL, async ({ params, request }) => {
      const cardId = params.cardId as string;
      const { listId, position } = (await request.json()) as { listId: string; position: number };
      state.moves.push({ cardId, listId, position });
      await delay(120);
      if (options.fail)
        return HttpResponse.json(options.fail.body, { status: options.fail.status });
      const card = state.cards.find((item) => item.id === cardId)!;
      Object.assign(card, { listId, position });
      if (options.rebalance) {
        board()
          .lists.find((list) => list.id === listId)!
          .cards.forEach((item, i) => {
            state.cards.find((stored) => stored.id === item.id)!.position = (i + 1) * 1024;
          });
      }
      return HttpResponse.json({ data: { ...card } satisfies CardSummaryDto });
    }),
  );
  return state;
}

function setup() {
  setAccessToken(freshAccessToken);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(boardKeys.detail(roadmapBoard.id), roadmapWithCards);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
  // The board page's query is mounted, as in the app, so a settled move refetches it.
  const { result } = renderHook(
    () => ({ move: useMoveCard(roadmapBoard.id), board: useBoard(roadmapBoard.id) }),
    { wrapper },
  );
  /** Each list's card titles, from the cache. */
  const cardsByList = () =>
    queryClient
      .getQueryData<BoardDetailDto>(boardKeys.detail(roadmapBoard.id))!
      .lists.map((list) => list.cards.map((card) => card.title));
  return { result, cardsByList };
}

/** "Fix login" into the empty "Doing" list. */
const loginToDoing = { cardId: loginCard.id, listId: doingList.id, beforeId: null, afterId: null };

describe('useMoveCard', () => {
  afterEach(() => {
    setAccessToken(null);
    // Sonner keeps its toasts between tests; each failure test must find its own.
    toast.dismiss();
  });

  it('moves the card to the other list at once, sends its position, then refetches', async () => {
    const state = fakeServer();
    const { result, cardsByList } = setup();

    act(() => result.current.move.mutate(loginToDoing));

    await waitFor(() => expect(cardsByList()).toEqual([['Sign-up form'], ['Fix login']]));
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
    expect(state.moves).toEqual([{ cardId: loginCard.id, listId: doingList.id, position: 1024 }]);
    await waitFor(() => expect(state.boardGets).toBe(1));
    expect(cardsByList()).toEqual([['Sign-up form'], ['Fix login']]);
  });

  it('reorders within a list: the position goes between the new neighbours', async () => {
    const state = fakeServer();
    const { result, cardsByList } = setup();

    act(() =>
      result.current.move.mutate({
        cardId: signupCard.id,
        listId: todoList.id,
        beforeId: null,
        afterId: loginCard.id,
      }),
    );

    await waitFor(() => expect(cardsByList()[0]).toEqual(['Sign-up form', 'Fix login']));
    await waitFor(() => expect(state.moves).toHaveLength(1));
    expect(state.moves[0]).toEqual({ cardId: signupCard.id, listId: todoList.id, position: 512 });
  });

  it.each([
    { case: 'a 403 (the role was lowered meanwhile)', fail: cardMoveErrors.forbidden },
    { case: 'a server error', fail: cardMoveErrors.server },
  ])('on $case the card snaps back with a toast', async ({ fail }) => {
    fakeServer({ fail });
    const { result, cardsByList } = setup();

    act(() => result.current.move.mutate(loginToDoing));

    await waitFor(() => expect(cardsByList()[1]).toEqual(['Fix login']));
    expect(screen.queryByText("Couldn't move the card. Try again.")).toBeNull();
    await waitFor(() => expect(cardsByList()).toEqual([['Fix login', 'Sign-up form'], []]));
    expect(screen.getByText("Couldn't move the card. Try again.")).toBeInTheDocument();
  });

  it('after a rebalance, the board is refetched and the next move uses the new numbers', async () => {
    const state = fakeServer({ rebalance: true });
    const { result, cardsByList } = setup();

    act(() => {
      // Sign-up form first (sent 512, renumbered to 1024; Fix login becomes 2048) …
      result.current.move.mutate({
        cardId: signupCard.id,
        listId: todoList.id,
        beforeId: null,
        afterId: loginCard.id,
      });
      // … then Fix login back to the front, before Sign-up form's renumbered 1024.
      result.current.move.mutate({
        cardId: loginCard.id,
        listId: todoList.id,
        beforeId: null,
        afterId: signupCard.id,
      });
    });

    await waitFor(() => expect(state.moves).toHaveLength(2));
    expect(state.moves[1]).toEqual({ cardId: loginCard.id, listId: todoList.id, position: 512 });
    expect(state.boardGets).toBeGreaterThanOrEqual(1);
    await waitFor(() => expect(cardsByList()[0]).toEqual(['Fix login', 'Sign-up form']));
  });
});
