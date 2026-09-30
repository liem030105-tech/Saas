import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { boardsApi } from './api';

import type {
  BoardDetailDto,
  BoardDto,
  CreateBoardInput,
  UpdateBoardInput,
} from '@trello-clone/shared';

// Query keys: docs/architecture/frontend.md → State management (`['boards', workspaceId]`,
// `['board', boardId]`).
export const boardKeys = {
  all: ['boards'] as const,
  /** Every board list of a workspace (open and archived), for invalidation. */
  workspace: (workspaceId: string) => [...boardKeys.all, workspaceId] as const,
  list: (workspaceId: string, archived: boolean) =>
    [...boardKeys.workspace(workspaceId), { archived }] as const,
  detail: (boardId: string) => ['board', boardId] as const,
};

/** The workspace's open boards (or its archived ones), newest first. */
export function useBoards(workspaceId: string, archived = false) {
  return useQuery({
    queryKey: boardKeys.list(workspaceId, archived),
    queryFn: () => boardsApi.list(workspaceId, archived),
  });
}

/** POST …/boards. The new board goes first in the cached grid, then the lists are refetched. */
export function useCreateBoard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) => boardsApi.create(workspaceId, input),
    onSuccess: async (created) => {
      queryClient.setQueryData<BoardDto[]>(boardKeys.list(workspaceId, false), (list = []) => [
        created,
        ...list,
      ]);
      await queryClient.invalidateQueries({ queryKey: boardKeys.workspace(workspaceId) });
    },
  });
}

/** The board page's data (GET /boards/:boardId). */
export function useBoard(boardId: string) {
  return useQuery({
    queryKey: boardKeys.detail(boardId),
    queryFn: () => boardsApi.get(boardId),
  });
}

/**
 * PATCH /boards/:boardId. The cached board keeps its lists and labels and takes the new fields;
 * the workspace's grids are refetched (a title, colour or archived change shows there too).
 */
export function useUpdateBoard(boardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateBoardInput) => boardsApi.update(boardId, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData<BoardDetailDto>(boardKeys.detail(boardId), (board) =>
        board ? { ...board, ...updated } : board,
      );
      await queryClient.invalidateQueries({ queryKey: boardKeys.workspace(updated.workspaceId) });
    },
  });
}

/** DELETE /boards/:boardId. The board leaves the cache; the workspace's grids are refetched. */
export function useDeleteBoard(boardId: string, workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => boardsApi.remove(boardId),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: boardKeys.detail(boardId) });
      await queryClient.invalidateQueries({ queryKey: boardKeys.workspace(workspaceId) });
    },
  });
}
