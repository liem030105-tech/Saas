import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { activityKeys, boardKeys, boardMutationScope } from '@/features/boards';

import { commentsApi } from './api';

import type { Page } from '@/api/client';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import type { BoardDetailDto, CommentDto, UserSummary } from '@trello-clone/shared';

const DELETE_ERROR = "Couldn't delete the comment. Try again.";

// Query keys: docs/architecture/frontend.md → State management. Not under ['card', cardId], so
// refetching the card after one of its changes does not refetch every page of its comments.
export const commentKeys = {
  all: ['comments'] as const,
  list: (cardId: string) => ['comments', cardId] as const,
};

type CommentPages = InfiniteData<Page<CommentDto>, string | undefined>;

const OPTIMISTIC_ID_PREFIX = 'optimistic-comment-';
let optimisticIds = 0;

/** A comment shown before the server stored it: it cannot be edited or deleted yet. */
export const isOptimisticComment = (comment: Pick<CommentDto, 'id'>) =>
  comment.id.startsWith(OPTIMISTIC_ID_PREFIX);

/** A card's comments, newest first, one page at a time ("Load more comments"). */
export function useComments(cardId: string) {
  return useInfiniteQuery({
    queryKey: commentKeys.list(cardId),
    queryFn: ({ pageParam }) => commentsApi.list(cardId, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

/** Changes every loaded page of the card's comments. */
function updatePages(
  queryClient: QueryClient,
  cardId: string,
  update: (comments: CommentDto[], pageIndex: number) => CommentDto[],
) {
  queryClient.setQueryData<CommentPages>(commentKeys.list(cardId), (pages) =>
    pages
      ? { ...pages, pages: pages.pages.map((page, i) => ({ ...page, data: update(page.data, i) })) }
      : pages,
  );
}

/** The comment badge on the card's tile follows a comment added or deleted here. */
function bumpCommentCount(queryClient: QueryClient, boardId: string, cardId: string, by: 1 | -1) {
  queryClient.setQueryData<BoardDetailDto>(boardKeys.detail(boardId), (board) =>
    board
      ? {
          ...board,
          lists: board.lists.map((list) => ({
            ...list,
            cards: list.cards.map((card) =>
              card.id === cardId
                ? { ...card, commentCount: Math.max(0, card.commentCount + by) }
                : card,
            ),
          })),
        }
      : board,
  );
}

/**
 * The board's activity and comment counts come from the server again (the counts unless a list or
 * card move is pending).
 */
function refetchBoardUnlessMoving(queryClient: QueryClient, boardId: string) {
  void queryClient.invalidateQueries({ queryKey: activityKeys.board(boardId) }); // "commented on"
  const { id } = boardMutationScope(boardId);
  if (queryClient.isMutating({ predicate: (m) => m.options.scope?.id === id }) > 0) return;
  return queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
}

/**
 * POST /cards/:cardId/comments with an optimistic update: the comment shows at the top at once
 * (by `author`, the signed-in user) and the tile counts it; on error it goes away again. The
 * composer puts the text back with the error (see CommentSection), so nothing typed is lost.
 */
export function useAddComment(boardId: string, cardId: string, author: UserSummary) {
  const queryClient = useQueryClient();
  const key = commentKeys.list(cardId);

  return useMutation({
    mutationFn: (content: string) => commentsApi.create(cardId, { content }),
    onMutate: async (content) => {
      await queryClient.cancelQueries({ queryKey: key });
      const now = new Date().toISOString();
      optimisticIds += 1;
      const temp: CommentDto = {
        id: `${OPTIMISTIC_ID_PREFIX}${optimisticIds}`,
        cardId,
        content,
        createdAt: now,
        updatedAt: now,
        author,
      };
      updatePages(queryClient, cardId, (comments, i) => (i === 0 ? [temp, ...comments] : comments));
      bumpCommentCount(queryClient, boardId, cardId, 1);
      return { tempId: temp.id };
    },
    onSuccess: (comment, _content, context) =>
      updatePages(queryClient, cardId, (comments) =>
        comments.map((c) => (c.id === context.tempId ? comment : c)),
      ),
    onError: (_error, _content, context) => {
      if (!context) return;
      updatePages(queryClient, cardId, (comments) =>
        comments.filter((c) => c.id !== context.tempId),
      );
      bumpCommentCount(queryClient, boardId, cardId, -1);
    },
    onSettled: () => refetchBoardUnlessMoving(queryClient, boardId),
  });
}

/** PATCH /comments/:commentId: waits for the server (the edit form stays open until it answers). */
export function useEditComment(cardId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, content }: { commentId: string; content: string }) =>
      commentsApi.update(commentId, { content }),
    onSuccess: (comment) =>
      updatePages(queryClient, cardId, (comments) =>
        comments.map((c) => (c.id === comment.id ? comment : c)),
      ),
  });
}

/**
 * DELETE /comments/:commentId with an optimistic update: the comment goes at once and the tile
 * counts one less; on error it comes back where it was, with a toast. Deleting the last comment of
 * a loaded page refetches the pages, since that comment was the cursor of the next one.
 */
export function useDeleteComment(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const key = commentKeys.list(cardId);

  return useMutation({
    mutationFn: (comment: CommentDto) => commentsApi.remove(comment.id),
    onMutate: async (comment) => {
      await queryClient.cancelQueries({ queryKey: key });
      const pages = queryClient.getQueryData<CommentPages>(key)?.pages ?? [];
      const pageIndex = pages.findIndex((page) => page.data.some((c) => c.id === comment.id));
      const index = pages[pageIndex]?.data.findIndex((c) => c.id === comment.id) ?? -1;
      const wasCursor = pages.some((page) => page.nextCursor === comment.id);
      updatePages(queryClient, cardId, (comments) => comments.filter((c) => c.id !== comment.id));
      bumpCommentCount(queryClient, boardId, cardId, -1);
      return { pageIndex, index, wasCursor };
    },
    onError: (_error, comment, context) => {
      toast.error(DELETE_ERROR);
      if (!context || context.pageIndex < 0) return;
      updatePages(queryClient, cardId, (comments, i) =>
        i !== context.pageIndex || comments.some((c) => c.id === comment.id)
          ? comments
          : comments.toSpliced(context.index, 0, comment),
      );
      bumpCommentCount(queryClient, boardId, cardId, 1);
    },
    onSettled: async (_result, error, _comment, context) => {
      if (!error && context?.wasCursor) await queryClient.invalidateQueries({ queryKey: key });
      await refetchBoardUnlessMoving(queryClient, boardId);
    },
  });
}
