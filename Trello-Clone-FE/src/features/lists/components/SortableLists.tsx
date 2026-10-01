import {
  closestCenter,
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  pointerWithin,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
  type Active,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { boardKeys } from '@/features/boards';
import { acceptsDrop, CardItem, useCardDrag } from '@/features/cards';
import { cn } from '@/lib/utils';

import { useMoveList } from '../hooks/useMoveList';
import { isOptimisticList } from '../queries';
import { ListColumn } from './ListColumn';

import type { BoardDetailDto } from '@trello-clone/shared';

type BoardList = BoardDetailDto['lists'][number];

interface SortableListsProps {
  boardId: string;
  lists: BoardList[];
  canEdit: boolean;
}

const typeOf = (item: { data: { current?: Record<string, unknown> } } | null | undefined) =>
  item?.data.current?.type;

/**
 * Lists collide with the closest list. A card first finds the list under the pointer (or under
 * the card, when moved by keyboard), then the closest card in it; an empty list is the drop target
 * itself.
 */
const collisionDetection: CollisionDetection = (args) => {
  const activeType = typeOf(args.active);
  const accepted = args.droppableContainers.filter((container) =>
    acceptsDrop(activeType, typeOf(container)),
  );
  if (activeType !== 'card') return closestCenter({ ...args, droppableContainers: accepted });

  const areas = accepted.filter((container) => typeOf(container) === 'card-list');
  const withAreas = { ...args, droppableContainers: areas };
  const hits = pointerWithin(withAreas);
  const [area] = hits.length > 0 ? hits : rectIntersection(withAreas);
  const listId = areas.find((container) => container.id === area?.id)?.data.current?.listId;
  if (!area || !listId) return closestCorners(withAreas);
  const cards = accepted.filter(
    (container) => typeOf(container) === 'card' && container.data.current?.listId === listId,
  );
  return cards.length > 0 ? closestCenter({ ...args, droppableContainers: cards }) : [area];
};

/**
 * The board's lists as a horizontal sortable row with their cards (docs/design/ui.md → Drag and
 * drop). One DndContext serves both: drag a list by its handle, or a card by its tile, with the
 * pointer; or focus the handle or the card and use Space, the arrow keys and Space (Escape
 * cancels; Enter still opens a card). Dropping sends the new neighbours, and the item moves at once.
 */
export function SortableLists({ boardId, lists: boardLists, canEdit }: SortableListsProps) {
  const queryClient = useQueryClient();
  const moveList = useMoveList(boardId);
  const cardDrag = useCardDrag(boardId, boardLists);
  const { lists } = cardDrag;
  const listsRef = useRef(lists);
  listsRef.current = lists;

  // The keyboard moves an item only between places of its own kind: a list among lists; a card
  // up and down within its list, or left and right into the next list (onto its closest card, or
  // into it when it is empty).
  const keyboardCoordinates = useRef<KeyboardCoordinateGetter>((event, args) => {
    const { active, droppableContainers } = args.context;
    const activeType = typeOf(active);
    const fromListId = active?.data.current?.listId;
    const sideways = event.code === 'ArrowLeft' || event.code === 'ArrowRight';
    // Sideways goes to the adjacent list only (a closer card two lists over must not win).
    const from = listsRef.current.findIndex((list) => list.id === fromListId);
    const step = event.code === 'ArrowLeft' ? -1 : 1;
    const targetListId = sideways ? listsRef.current[from + step]?.id : fromListId;
    const isEmptyList = (listId: unknown) =>
      listsRef.current
        .find((list) => list.id === listId)
        ?.cards.every((card) => card.id === active?.id) ?? false;
    const enabled = droppableContainers.getEnabled().filter((container) => {
      const type = typeOf(container);
      if (!acceptsDrop(activeType, type)) return false;
      if (activeType !== 'card') return true;
      const listId = container.data.current?.listId;
      if (targetListId === undefined || listId !== targetListId) return false;
      return type !== 'card-list' || isEmptyList(listId);
    });
    const filtered = {
      getEnabled: () => enabled,
      get: (id: UniqueIdentifier) => droppableContainers.get(id),
    } as unknown as typeof droppableContainers;
    return sortableKeyboardCoordinates(event, {
      ...args,
      context: { ...args.context, droppableContainers: filtered },
    });
  }).current;

  const sensors = useSensors(
    // A click is not a drag: buttons and card links keep working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: keyboardCoordinates,
      // Enter opens a card (it is a link), so only Space picks up and drops.
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space'] },
    }),
  );

  const listTitle = (id: UniqueIdentifier) => lists.find((list) => list.id === id)?.title ?? '';
  const listPlace = (id: UniqueIdentifier) => lists.findIndex((list) => list.id === id) + 1;
  const cardTitle = (id: UniqueIdentifier) =>
    lists.flatMap((list) => list.cards).find((card) => card.id === id)?.title ?? '';
  /** Where a card is over: "at position 2 of 3 in Doing", or "in Doing" for a list's card area. */
  const cardPlace = (overId: UniqueIdentifier, listId: unknown) => {
    const list = lists.find((item) => item.id === listId);
    if (!list) return '';
    const index = list.cards.findIndex((card) => card.id === overId);
    return index >= 0
      ? `at position ${index + 1} of ${list.cards.length} in ${list.title}`
      : `in ${list.title}`;
  };
  const isCard = (active: Active) => typeOf(active) === 'card';
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      isCard(active)
        ? `Picked up card ${cardTitle(active.id)}.`
        : `Picked up list ${listTitle(active.id)}.`,
    onDragOver: ({ active, over }) => {
      if (isCard(active)) {
        return over
          ? `Card ${cardTitle(active.id)} is ${cardPlace(over.id, over.data.current?.listId)}.`
          : `Card ${cardTitle(active.id)} is no longer over a list.`;
      }
      return over
        ? `List ${listTitle(active.id)} is at position ${listPlace(over.id)} of ${lists.length}.`
        : `List ${listTitle(active.id)} is no longer over a position.`;
    },
    onDragEnd: ({ active, over }) => {
      if (isCard(active)) {
        return over
          ? `Card ${cardTitle(active.id)} was dropped ${cardPlace(over.id, over.data.current?.listId)}.`
          : `Card ${cardTitle(active.id)} was dropped.`;
      }
      return over
        ? `List ${listTitle(active.id)} was dropped at position ${listPlace(over.id)} of ${lists.length}.`
        : `List ${listTitle(active.id)} was dropped.`;
    },
    onDragCancel: ({ active }) =>
      isCard(active)
        ? `Moving card ${cardTitle(active.id)} was cancelled.`
        : `Moving list ${listTitle(active.id)} was cancelled.`,
  };

  const onListDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return; // dropped in place: no request
    const from = lists.findIndex((list) => list.id === active.id);
    const to = lists.findIndex((list) => list.id === over.id);
    if (from < 0 || to < 0) return;
    // The new neighbours: in the order without the dragged list, it goes in at index `to`.
    const siblings = lists.filter((list) => list.id !== active.id);
    moveList.mutate({
      listId: String(active.id),
      beforeId: siblings[to - 1]?.id ?? null,
      afterId: siblings[to]?.id ?? null,
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      accessibility={{ announcements }}
      onDragStart={({ active }) => {
        // While something is dragged, a refetch must not reorder the board under the pointer.
        void queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) });
        if (isCard(active)) cardDrag.onDragStart(active);
      }}
      onDragOver={(event) => isCard(event.active) && cardDrag.onDragOver(event)}
      onDragEnd={(event) =>
        isCard(event.active) ? cardDrag.onDragEnd(event) : onListDragEnd(event)
      }
      onDragCancel={({ active }) => isCard(active) && cardDrag.onDragCancel()}
    >
      <SortableContext
        items={lists.map((list) => list.id)}
        strategy={horizontalListSortingStrategy}
      >
        <ol aria-label="Lists" className="flex items-start gap-3">
          {lists.map((list) => (
            <SortableList
              key={list.id}
              list={list}
              // A list still being created has no real id yet: read-only until the server answers.
              canEdit={canEdit && !isOptimisticList(list)}
            />
          ))}
        </ol>
      </SortableContext>
      {/* The tilted copy that follows a dragged card; the tile stays behind as the placeholder. */}
      <DragOverlay>
        {cardDrag.activeCard && <CardItem boardId={boardId} card={cardDrag.activeCard} overlay />}
      </DragOverlay>
    </DndContext>
  );
}

function SortableList({ list, canEdit }: { list: BoardList; canEdit: boolean }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: list.id, data: { type: 'list' }, disabled: !canEdit });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      <ListColumn
        list={list}
        canEdit={canEdit}
        dragHandle={
          canEdit ? { ref: setActivatorNodeRef, props: { ...attributes, ...listeners } } : undefined
        }
      />
    </li>
  );
}
