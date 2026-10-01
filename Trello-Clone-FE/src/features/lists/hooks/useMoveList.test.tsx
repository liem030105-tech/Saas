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
  moveDoneFirst,
  roadmapWithThreeLists,
  todoList,
} from '@/testing/data/lists';
import { server } from '@/testing/mocks/server';

import { useMoveList } from './useMoveList';

import type { BoardDetailDto } from '@trello-clone/shared';
import type { ReactNode } from 'react';

const LIST_URL = apiUrl(`/lists/${moveDoneFirst.listId}`);
const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);

function setup(answer: 'rebalanced' | 'error') {
  const patches: unknown[] = [];
  server.use(
    mswHttp.patch(LIST_URL, async ({ request }) => {
      patches.push(await request.json());
      await delay(50);
      if (answer === 'error') return HttpResponse.json(listServerErrors.move, { status: 500 });
      return HttpResponse.json({
        data: { ...doneList, position: moveDoneFirst.final, cards: undefined },
      });
    }),
    // The refetch after the move: the server's renumbered board.
    mswHttp.get(BOARD_URL, () =>
      HttpResponse.json({
        data:
          answer === 'error'
            ? roadmapWithThreeLists
            : {
                ...roadmapWithThreeLists,
                lists: [
                  { ...doneList, position: 1024 },
                  { ...todoList, position: 2048 },
                  { ...doingList, position: 3072 },
                ],
              },
      }),
    ),
  );
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
  // The board page's query is mounted, as in the app, so the move's invalidation refetches it.
  const { result } = renderHook(
    () => ({ move: useMoveList(roadmapBoard.id), board: useBoard(roadmapBoard.id) }),
    { wrapper },
  );
  const cached = () =>
    queryClient.getQueryData<BoardDetailDto>(boardKeys.detail(roadmapBoard.id))!.lists;
  return { result, patches, cached };
}

describe('useMoveList', () => {
  afterEach(() => setAccessToken(null));

  it('moves the list at once, then shows the server positions from the refetch', async () => {
    const { result, patches, cached } = setup('rebalanced');

    act(() =>
      result.current.move.mutate({
        listId: moveDoneFirst.listId,
        position: moveDoneFirst.predicted,
      }),
    );

    await waitFor(() =>
      expect(cached().map((list) => list.title)).toEqual(['Done', 'To do', 'Doing']),
    );
    expect(cached()[0]!.position).toBe(moveDoneFirst.predicted);
    await waitFor(() => expect(result.current.move.isSuccess).toBe(true));
    expect(patches).toEqual([{ position: moveDoneFirst.predicted }]);
    await waitFor(() =>
      expect(cached().map((list) => [list.title, list.position])).toEqual([
        ['Done', 1024],
        ['To do', 2048],
        ['Doing', 3072],
      ]),
    );
  });

  it('rolls back and says so when the move fails', async () => {
    const { result, cached } = setup('error');

    act(() =>
      result.current.move.mutate({
        listId: moveDoneFirst.listId,
        position: moveDoneFirst.predicted,
      }),
    );

    await waitFor(() => expect(cached()[0]!.title).toBe('Done'));
    expect(await screen.findByText("Couldn't move the list. Try again.")).toBeInTheDocument();
    expect(cached().map((list) => list.title)).toEqual(['To do', 'Doing', 'Done']);
  });
});
