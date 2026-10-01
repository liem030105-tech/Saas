import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { boardKeys, useBoard } from '@/features/boards';
import { apiUrl } from '@/testing/data/api';
import { freshAccessToken } from '@/testing/data/auth';
import { roadmapBoard } from '@/testing/data/boards';
import { boardWithCardsInBothLists, doingCards, loginCard, signupCard } from '@/testing/data/cards';
import { doingList, todoList } from '@/testing/data/lists';
import { server } from '@/testing/mocks/server';

import { cardsDropId } from '../dnd';
import { useCardDrag } from './useCardDrag';

import type { Active, DragEndEvent, DragOverEvent, Over } from '@dnd-kit/core';
import type { BoardDetailDto } from '@trello-clone/shared';
import type { ReactNode } from 'react';

const MOVE_URL = apiUrl('/cards/:cardId/move');

/** What dnd-kit hands the handlers: a card tile, or a list's card area. */
const cardItem = (id: string, listId: string) =>
  ({ id, data: { current: { type: 'card', listId } } }) as unknown as Active & Over;
const listArea = (listId: string) =>
  ({
    id: cardsDropId(listId),
    data: { current: { type: 'card-list', listId } },
  }) as unknown as Over;

/** The hook as the board renders it, over a cached board; moves are recorded, never answered. */
function setup() {
  setAccessToken(freshAccessToken);
  const moves: { cardId: string; listId: string; position: number }[] = [];
  server.use(
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: boardWithCardsInBothLists }),
    ),
    mswHttp.patch(MOVE_URL, async ({ params, request }) => {
      const body = (await request.json()) as { listId: string; position: number };
      moves.push({ cardId: params.cardId as string, ...body });
      return new Promise<never>(() => {}); // pending: the cache keeps the optimistic move
    }),
  );
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(boardKeys.detail(roadmapBoard.id), boardWithCardsInBothLists);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(
    () => {
      const board = useBoard(roadmapBoard.id).data as BoardDetailDto;
      return useCardDrag(roadmapBoard.id, board.lists);
    },
    { wrapper },
  );
  const titles = () => result.current.lists.map((list) => list.cards.map((card) => card.title));
  const drag = {
    start: (active: Active) => act(() => result.current.onDragStart(active)),
    over: (active: Active, over: Over) =>
      act(() => result.current.onDragOver({ active, over } as DragOverEvent)),
    end: (active: Active, over: Over | null) =>
      act(() => result.current.onDragEnd({ active, over } as DragEndEvent)),
    cancel: () => act(() => result.current.onDragCancel()),
  };
  return { result, titles, drag, moves };
}

const login = cardItem(loginCard.id, todoList.id);
const signup = cardItem(signupCard.id, todoList.id);
const [planCard, shipCard] = doingCards;

describe('useCardDrag', () => {
  afterEach(() => setAccessToken(null));

  it('a card dragged into another list follows the pointer there, the cache stays as it was', async () => {
    const { result, titles, drag } = setup();

    drag.start(login);
    expect(result.current.activeCard?.id).toBe(loginCard.id);
    drag.over(login, cardItem(shipCard!.id, doingList.id));

    expect(titles()).toEqual([['Sign-up form'], ['Plan', 'Fix login', 'Ship']]);
  });

  it('dropped between two cards of another list, it is sent between them and stays there', async () => {
    const { result, titles, drag, moves } = setup();

    drag.start(login);
    drag.over(login, cardItem(shipCard!.id, doingList.id));
    // Inserted before "Ship", the card is now over itself in its new list.
    drag.end(login, cardItem(loginCard.id, doingList.id));

    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({
      cardId: loginCard.id,
      listId: doingList.id,
      position: (planCard!.position + shipCard!.position) / 2,
    });
    expect(titles()).toEqual([['Sign-up form'], ['Plan', 'Fix login', 'Ship']]);
    expect(result.current.activeCard).toBeNull();
  });

  it('reordered within its list, the new neighbours are sent', async () => {
    const { titles, drag, moves } = setup();

    drag.start(signup);
    drag.end(signup, login);

    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]).toEqual({
      cardId: signupCard.id,
      listId: todoList.id,
      position: loginCard.position / 2,
    });
    expect(titles()[0]).toEqual(['Sign-up form', 'Fix login']);
  });

  it('dropped onto an empty spot of another list, it goes last', async () => {
    const { titles, drag, moves } = setup();

    drag.start(login);
    drag.over(login, listArea(doingList.id));
    drag.end(login, cardItem(loginCard.id, doingList.id));

    await waitFor(() => expect(moves).toHaveLength(1));
    expect(moves[0]!.position).toBeGreaterThan(shipCard!.position);
    expect(titles()[1]).toEqual(['Plan', 'Ship', 'Fix login']);
  });

  it.each([
    { case: 'dropped where it was', finish: 'drop' as const },
    { case: 'dropped outside every list', finish: 'outside' as const },
    { case: 'cancelled with Escape', finish: 'cancel' as const },
  ])('$case: no request, the board as before', async ({ finish }) => {
    const { titles, drag, moves } = setup();

    drag.start(login);
    if (finish === 'drop') drag.end(login, login);
    else {
      drag.over(login, cardItem(shipCard!.id, doingList.id));
      if (finish === 'outside') drag.end(login, null);
      else drag.cancel();
    }

    expect(titles()).toEqual([
      ['Fix login', 'Sign-up form'],
      ['Plan', 'Ship'],
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(moves).toEqual([]);
  });
});
