# TanStack Query 5 patterns

Server data lives only in the Query cache (ADR-005). Each feature owns its keys, API calls, and hooks.

## `features/boards/api.ts` – typed calls through the shared client
```ts
import type { BoardDetailDto, BoardDto, CreateBoardInput } from '@trello-clone/shared';
import { apiClient } from '@/api/client';

export const boardsApi = {
  list: (workspaceId: string) => apiClient.get<BoardDto[]>(`/workspaces/${workspaceId}/boards`),
  detail: (boardId: string) => apiClient.get<BoardDetailDto>(`/boards/${boardId}`),
  create: (workspaceId: string, input: CreateBoardInput) =>
    apiClient.post<BoardDto>(`/workspaces/${workspaceId}/boards`, input),
};
```
`apiClient` unwraps `{ data }` and throws `ApiError` (with the shared error `code`) for error responses.

## `features/boards/queries.ts` – key factory and hooks
```ts
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { boardsApi } from './api';

export const boardKeys = {
  all: ['boards'] as const,
  list: (workspaceId: string) => [...boardKeys.all, 'list', workspaceId] as const,
  detail: (boardId: string) => ['board', boardId] as const, // shared with lists/cards features
};

export const boardDetailQuery = (boardId: string) =>
  queryOptions({ queryKey: boardKeys.detail(boardId), queryFn: () => boardsApi.detail(boardId) });

export const useBoard = (boardId: string) => useQuery(boardDetailQuery(boardId));

export function useCreateBoard(workspaceId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) => boardsApi.create(workspaceId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKeys.list(workspaceId) }),
  });
}
```
Other features never build `['board', id]` by hand: they import `boardKeys` from `features/boards` (its `index.ts`).

## Optimistic update (board mutations: move, rename, archive)
```ts
export function useRenameList(boardId: string) {
  const qc = useQueryClient();
  const key = boardKeys.detail(boardId);
  return useMutation({
    mutationFn: ({ listId, title }: { listId: string; title: string }) => listsApi.update(listId, { title }),
    onMutate: async ({ listId, title }) => {
      await qc.cancelQueries({ queryKey: key });                     // no stale refetch overwrites us
      const previous = qc.getQueryData<BoardDetailDto>(key);          // snapshot
      qc.setQueryData<BoardDetailDto>(key, (board) =>
        board && { ...board, lists: board.lists.map((l) => (l.id === listId ? { ...l, title } : l)) },
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      qc.setQueryData(key, context?.previous);                       // rollback
      toast.error("Couldn't rename the list. Try again.");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),        // converge with the server
  });
}
```
Never mutate cached objects in place; always return new objects.

## Component states
```tsx
const { data: board, isPending, isError, refetch } = useBoard(boardId);
if (isPending) return <BoardSkeleton />;
if (isError) return <ErrorState message="Couldn't load this board." onRetry={refetch} />;
if (board.lists.length === 0) return <EmptyState action={<AddListComposer boardId={board.id} />} />;
```
A `404 NOT_FOUND` from the API renders the "not found" page (non-members must see "not found", E2E scenario 6).

## QueryClient defaults (`lib/query-client.ts`)
`staleTime: 30_000`; `retry` off for 4xx `ApiError`s (retrying a 403/404 is pointless); `refetchOnWindowFocus: true`.
