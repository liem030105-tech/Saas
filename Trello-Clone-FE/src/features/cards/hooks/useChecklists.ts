import { useMutation, useQueryClient } from '@tanstack/react-query';
import { positionAfter, initialPosition } from '@trello-clone/shared';
import { toast } from 'sonner';

import { boardChangeKey, boardKeys } from '@/features/boards';

import { checklistsApi } from '../api';
import { cardKeys, cardMutationScope, refetchCardWhenIdle, withCard } from '../queries';

import type { BoardDetailDto, CardDetailDto, ChecklistDto } from '@trello-clone/shared';

const ERROR = "Couldn't update the checklist. Try again.";

const OPTIMISTIC_ITEM = 'optimistic-item-';
let optimisticItems = 0;

/** An item shown before the server created it: it has no real id yet, so it cannot change. */
export const isOptimisticItem = (item: { id: string }) => item.id.startsWith(OPTIMISTIC_ITEM);

/**
 * A card's checklists, changed from its modal (docs/api/cards.md → Checklists). Ticking, adding
 * and deleting items and renaming a checklist show at once and are undone with a toast on error;
 * adding or deleting a checklist waits for the server (they run from a form that shows the
 * error). All run in the card's mutation scope (queries.ts) and keep the board tile's
 * `checklist` progress in step.
 */
export function useChecklists(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const boardKey = boardKeys.detail(boardId);
  const scope = cardMutationScope(cardId);
  const mutationKey = boardChangeKey(boardId); // the tile's progress
  const settle = () => refetchCardWhenIdle(queryClient, boardId, cardId);

  const cancel = () =>
    Promise.all([
      queryClient.cancelQueries({ queryKey: cardKey }),
      queryClient.cancelQueries({ queryKey: boardKey }),
    ]);
  /** Changes the card's checklists in the modal's cache. */
  const editChecklists = (change: (checklists: ChecklistDto[]) => ChecklistDto[]) =>
    queryClient.setQueryData<CardDetailDto>(cardKey, (card) =>
      card ? { ...card, checklists: change(card.checklists) } : card,
    );
  /** Changes one checklist's items. */
  const editItems = (
    checklistId: string,
    change: (items: ChecklistDto['items']) => ChecklistDto['items'],
  ) =>
    editChecklists((checklists) =>
      checklists.map((checklist) =>
        checklist.id === checklistId ? { ...checklist, items: change(checklist.items) } : checklist,
      ),
    );
  /** Moves the board tile's progress by these many done and total items. */
  const editProgress = (done: number, total: number) =>
    queryClient.setQueryData<BoardDetailDto>(boardKey, (board) =>
      board
        ? withCard(board, cardId, (card) => ({
            ...card,
            checklist: {
              done: card.checklist.done + done,
              total: card.checklist.total + total,
            },
          }))
        : board,
    );
  const fail = () => toast.error(ERROR);

  const addChecklist = useMutation({
    scope,
    mutationKey,
    mutationFn: (title: string) => checklistsApi.create(cardId, { title }),
    onSuccess: (checklist) => editChecklists((checklists) => [...checklists, checklist]),
    onSettled: settle,
  });

  const removeChecklist = useMutation({
    scope,
    mutationKey,
    mutationFn: (checklistId: string) => checklistsApi.remove(checklistId),
    onSuccess: (_result, checklistId) => {
      const card = queryClient.getQueryData<CardDetailDto>(cardKey);
      const items = card?.checklists.find((checklist) => checklist.id === checklistId)?.items ?? [];
      editProgress(-items.filter((item) => item.done).length, -items.length);
      editChecklists((checklists) =>
        checklists.filter((checklist) => checklist.id !== checklistId),
      );
    },
    onSettled: settle,
  });

  const renameChecklist = useMutation({
    scope,
    mutationKey,
    mutationFn: ({ checklistId, title }: { checklistId: string; title: string; from: string }) =>
      checklistsApi.update(checklistId, { title }),
    onMutate: async ({ checklistId, title }) => {
      await cancel();
      editChecklists((checklists) =>
        checklists.map((checklist) =>
          checklist.id === checklistId ? { ...checklist, title } : checklist,
        ),
      );
    },
    onError: (_error, { checklistId, from }) => {
      editChecklists((checklists) =>
        checklists.map((checklist) =>
          checklist.id === checklistId ? { ...checklist, title: from } : checklist,
        ),
      );
      fail();
    },
    onSettled: settle,
  });

  const addItem = useMutation({
    scope,
    mutationKey,
    mutationFn: ({
      checklistId,
      content,
    }: {
      checklistId: string;
      content: string;
      tempId: string;
    }) => checklistsApi.addItem(checklistId, { content }),
    onMutate: async ({ checklistId, content, tempId }) => {
      await cancel();
      editItems(checklistId, (items) => {
        const last = items.at(-1);
        const position = last ? positionAfter(last.position) : initialPosition();
        return [...items, { id: tempId, content, done: false, position }];
      });
      editProgress(0, 1);
    },
    // A refetch may already have replaced the stand-in (with or without the new item).
    onSuccess: (item, { checklistId, tempId }) =>
      editItems(checklistId, (items) =>
        items.some((x) => x.id === tempId)
          ? items.map((x) => (x.id === tempId ? item : x))
          : items.some((x) => x.id === item.id)
            ? items
            : [...items, item],
      ),
    onError: (_error, { checklistId, tempId }) => {
      editItems(checklistId, (items) => items.filter((x) => x.id !== tempId));
      editProgress(0, -1);
      fail();
    },
    onSettled: settle,
  });

  const toggleItem = useMutation({
    scope,
    mutationKey,
    mutationFn: ({
      checklistId,
      itemId,
      done,
    }: {
      checklistId: string;
      itemId: string;
      done: boolean;
    }) => checklistsApi.updateItem(checklistId, itemId, { done }),
    onMutate: async ({ checklistId, itemId, done }) => {
      await cancel();
      editItems(checklistId, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, done } : item)),
      );
      editProgress(done ? 1 : -1, 0);
    },
    onError: (_error, { checklistId, itemId, done }) => {
      editItems(checklistId, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, done: !done } : item)),
      );
      editProgress(done ? -1 : 1, 0);
      fail();
    },
    onSettled: settle,
  });

  const removeItem = useMutation({
    scope,
    mutationKey,
    mutationFn: ({
      checklistId,
      item,
    }: {
      checklistId: string;
      item: ChecklistDto['items'][number];
    }) => checklistsApi.removeItem(checklistId, item.id),
    onMutate: async ({ checklistId, item }) => {
      await cancel();
      editItems(checklistId, (items) => items.filter((x) => x.id !== item.id));
      editProgress(item.done ? -1 : 0, -1);
    },
    onError: (_error, { checklistId, item }) => {
      // A refetch since may already show it again (the delete failed on the server).
      const card = queryClient.getQueryData<CardDetailDto>(cardKey);
      const shown = card?.checklists
        .find((checklist) => checklist.id === checklistId)
        ?.items.some((x) => x.id === item.id);
      if (!shown) {
        editItems(checklistId, (items) =>
          [...items, item].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : 1)),
        );
        editProgress(item.done ? 1 : 0, 1);
      }
      fail();
    },
    onSettled: settle,
  });

  return {
    addChecklist,
    removeChecklist,
    renameChecklist,
    toggleItem,
    removeItem,
    addItem: (checklistId: string, content: string) => {
      optimisticItems += 1;
      addItem.mutate({ checklistId, content, tempId: `${OPTIMISTIC_ITEM}${optimisticItems}` });
    },
  };
}
