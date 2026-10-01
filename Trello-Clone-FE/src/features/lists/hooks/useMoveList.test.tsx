import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, screen, waitFor } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { Toaster } from '@/components/ui/sonner';
import { boardKeys, useBoard } from '@/features/boards';
import { apiUrl } from '@/testing/data/api';
import { freshAccessToken } from '@/testing/data/auth';
import { roadmapBoard } from '@/testing/data/boards';
import {
  doingList,
  doneList,
  listServerErrors,
  roadmapWithThreeLists,
  todoList,
} from '@/testing/data/lists';
import { server } from '@/testing/mocks/server';

import { useMoveList } from './useMoveList';

import type { BoardDetailDto } from '@trello-clone/shared';
import type { ReactNode } from 'react';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const LIST_URL = apiUrl('/lists/:listId');

type ServerList = BoardDetailDto['lists'][number];

/**
 * A fake server holding the board's lists. PATCH stores the sent position, or renumbers every list
 * to 1024, 2048, … when `rebalance` is on (as the real server does when a gap gets too small).
 */
function fakeServer(options: { fail?: boolean; rebalance?: boolean } = {}) {
  const state = {
    lists: roadmapWithThreeLists.lists.map((list) => ({ ...list })) as ServerList[],
    patches: [] as { listId: string; position: number }[],
    boardGets: 0,
  };
  const sorted = () =>
    [...state.lists].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  server.use(
    mswHttp.get(BOARD_URL, () => {
      state.boardGets += 1;
      return HttpResponse.json({ data: { ...roadmapWithThreeLists, lists: sorted() } });
    }),
    mswHttp.patch(LIST_URL, async ({ params, request }) => {
      const listId = params.listId as string;
      const { position } = (await request.json()) as { position: number };
      state.patches.push({ listId, position });
      await delay(120);
      if (options.fail) return HttpResponse.json(listServerErrors.move, { status: 500 });
      state.lists.find((list) => list.id === listId)!.position = position;
      if (options.rebalance) {
        sorted().forEach((list, i) => {
          list.position = (i + 1) * 1024;
        });
      }
      const moved = state.lists.find((list) => list.id === listId)!;
      return HttpResponse.json({ data: { ...moved, cards: undefined } });
    }),
  );
  return state;
}

function setup() {
  setAccessToken(freshAccessToken);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  queryClient.setQueryData(boardKeys.detail(roadmapBoard.id), roadmapWithThreeLists);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
  // The board page's query is mounted, as in the app, so a settled move refetches it.
  const { result } = renderHook(
    () => ({ move: useMoveList(roadmapBoard.id), board: useBoard(roadmapBoard.id) }),
    { wrapper },
  );
  const titles = () =>
    queryClient
      .getQueryData<BoardDetailDto>(boardKeys.detail(roadmapBoard.id))!
      .lists.map((list) => list.title);
  return { result, titles };
}

const doneFirst = { listId: doneList.id, beforeId: null, afterId: todoList.id };

describe('useMoveList', () => {
  afterEach(() => setAccessToken(null));

  it('moves the list at once, sends the position between its new neighbours, then refetches', async () => {
    const state = fakeServer();
    const { result, titles } = setup();

    act(() => result.current.move.mutate(doneFirst));

    await waitFor(() => expect(titles()).toEqual(['Done', 'To do', 'Doing']));
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
    expect(state.patches).toEqual([{ listId: doneList.id, position: 512 }]);
    await waitFor(() => expect(state.boardGets).toBe(1));
    expect(titles()).toEqual(['Done', 'To do', 'Doing']);
  });

  it('rolls back and says so when the move fails', async () => {
    fakeServer({ fail: true });
    const { result, titles } = setup();

    act(() => result.current.move.mutate(doneFirst));

    await waitFor(() => expect(titles()[0]).toBe('Done'));
    expect(await screen.findByText("Couldn't move the list. Try again.")).toBeInTheDocument();
    expect(titles()).toEqual(['To do', 'Doing', 'Done']);
  });

  it('two quick moves run in turn and refetch only once, after the last', async () => {
    const state = fakeServer();
    const { result, titles } = setup();

    act(() => {
      result.current.move.mutate(doneFirst); // Done, To do, Doing
      // Then Doing between Done and To do.
      result.current.move.mutate({
        listId: doingList.id,
        beforeId: doneList.id,
        afterId: todoList.id,
      });
    });

    await waitFor(() => expect(state.patches).toHaveLength(2));
    expect(state.patches[1]).toEqual({ listId: doingList.id, position: (512 + 1024) / 2 });
    await waitFor(() => expect(state.boardGets).toBe(1));
    expect(titles()).toEqual(['Done', 'Doing', 'To do']);
  });

  it('after a rebalance, the next move is computed from the renumbered board', async () => {
    const state = fakeServer({ rebalance: true });
    const { result, titles } = setup();

    act(() => {
      result.current.move.mutate(doneFirst);
      result.current.move.mutate({
        listId: doingList.id,
        beforeId: doneList.id,
        afterId: todoList.id,
      });
    });

    await waitFor(() => expect(state.patches).toHaveLength(2));
    // The first move came back renumbered (Done 1024, To do 2048), so the second goes between
    // those numbers, not the stale 512 and 1024.
    expect(state.patches[1]).toEqual({ listId: doingList.id, position: 1536 });
    await waitFor(() => expect(titles()).toEqual(['Done', 'Doing', 'To do']));
  });
});
