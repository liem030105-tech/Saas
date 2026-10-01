import { arrayMove } from '@dnd-kit/sortable';
import { useState } from 'react';

import { cardsDropId } from '../dnd';
import { useMoveCard } from './useMoveCard';

import type { Active, DragEndEvent, DragOverEvent, Over, UniqueIdentifier } from '@dnd-kit/core';
import type { BoardDetailDto, CardSummaryDto } from '@trello-clone/shared';

type BoardLists = BoardDetailDto['lists'];

/** The list a draggable or droppable id belongs to: a list's card area, or a card in a list. */
function listIdOf(id: UniqueIdentifier, lists: BoardLists): string | undefined {
  const area = lists.find((list) => cardsDropId(list.id) === id);
  if (area) return area.id;
  return lists.find((list) => list.cards.some((card) => card.id === id))?.id;
}

/** `lists` with the card taken out of its list and put into `toListId` at `index`. */
function moveCardTo(lists: BoardLists, cardId: string, toListId: string, index: number) {
  const card = lists.flatMap((list) => list.cards).find((item) => item.id === cardId);
  if (!card) return lists;
  return lists.map((list) => {
    const others = list.cards.filter((item) => item.id !== cardId);
    if (list.id !== toListId) return { ...list, cards: others };
    const cards = [...others];
    cards.splice(Math.min(index, cards.length), 0, { ...card, listId: toListId });
    return { ...list, cards };
  });
}

const isCard = (item: Active | Over | null) => item?.data.current?.type === 'card';

/**
 * Card dragging on the board (CARD-004, docs/design/ui.md → Drag and drop). While a card is
 * dragged, a local preview of the lists follows it from list to list (the Query cache is not
 * touched, so a refetch cannot move it under the pointer). On drop, the new neighbours go to
 * useMoveCard, which moves the card in the cache; the preview stays until that update arrives,
 * so the card never flashes back to where it was.
 */
export function useCardDrag(boardId: string, boardLists: BoardLists) {
  const moveCard = useMoveCard(boardId);
  const [activeCard, setActiveCard] = useState<CardSummaryDto | null>(null);
  const [preview, setPreview] = useState<{ base: BoardLists; lists: BoardLists } | null>(null);
  // After a drop, new board data (the optimistic move, a rollback or a refetch) replaces the
  // preview (state adjusted during render: https://react.dev/learn/you-might-not-need-an-effect).
  if (preview && !activeCard && preview.base !== boardLists) setPreview(null);
  const lists = preview && (activeCard || preview.base === boardLists) ? preview.lists : boardLists;

  const onDragStart = (active: Active) => {
    const card = boardLists.flatMap((list) => list.cards).find((item) => item.id === active.id);
    if (!card) return;
    setActiveCard(card);
    setPreview({ base: boardLists, lists: boardLists });
  };

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!isCard(active) || !over) return;
    const fromListId = listIdOf(active.id, lists);
    const toListId = listIdOf(over.id, lists);
    if (!fromListId || !toListId || fromListId === toListId) return;
    // Entering another list: over a card, take its place; over the list's area, go last.
    const target = lists.find((list) => list.id === toListId)!;
    const overIndex = target.cards.findIndex((card) => card.id === over.id);
    const index = overIndex >= 0 ? overIndex : target.cards.length;
    setPreview({ base: boardLists, lists: moveCardTo(lists, String(active.id), toListId, index) });
  };

  const end = () => setActiveCard(null);

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    end();
    const cardId = String(active.id);
    const toListId = over ? listIdOf(over.id, lists) : undefined;
    if (!toListId) {
      setPreview(null);
      return;
    }
    const target = lists.find((list) => list.id === toListId)!;
    const ids = target.cards.map((card) => card.id);
    const from = ids.indexOf(cardId);
    const to = isCard(over) ? ids.indexOf(String(over!.id)) : from;
    const finalIds = from >= 0 && to >= 0 ? arrayMove(ids, from, to) : ids;
    const index = finalIds.indexOf(cardId);

    const original = boardLists.find((list) => list.cards.some((card) => card.id === cardId));
    const originalIndex = original?.cards.findIndex((card) => card.id === cardId) ?? -1;
    if (original?.id === toListId && originalIndex === index) {
      setPreview(null); // dropped where it was: no request
      return;
    }
    setPreview({ base: boardLists, lists: moveCardTo(lists, cardId, toListId, index) });
    moveCard.mutate({
      cardId,
      listId: toListId,
      beforeId: finalIds[index - 1] ?? null,
      afterId: finalIds[index + 1] ?? null,
    });
  };

  const onDragCancel = () => {
    end();
    setPreview(null);
  };

  return { lists, activeCard, onDragStart, onDragOver, onDragEnd, onDragCancel };
}
