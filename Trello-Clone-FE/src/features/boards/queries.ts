import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { boardsApi } from './api';

import type { BoardDto, CreateBoardInput } from '@trello-clone/shared';

// Query keys: docs/architecture/frontend.md → State management (`['boards', workspaceId]`).
export const boardKeys = {
  all: ['boards'] as const,
  list: (workspaceId: string) => [...boardKeys.all, workspaceId] as const,
};

/** The workspace's open boards, newest first. */
export function useBoards(workspaceId: string) {
  return useQuery({
    queryKey: boardKeys.list(workspaceId),
    queryFn: () => boardsApi.list(workspaceId),
  });
}

/** POST …/boards. The new board goes first in the cached grid, then the list is refetched. */
export function useCreateBoard(workspaceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBoardInput) => boardsApi.create(workspaceId, input),
    onSuccess: async (created) => {
      queryClient.setQueryData<BoardDto[]>(boardKeys.list(workspaceId), (list = []) => [
        created,
        ...list,
      ]);
      await queryClient.invalidateQueries({ queryKey: boardKeys.list(workspaceId) });
    },
  });
}
