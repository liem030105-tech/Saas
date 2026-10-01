import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useQueryClient } from '@tanstack/react-query';

import { boardKeys } from '@/features/boards';
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

/**
 * The board's lists as a horizontal sortable row (docs/design/ui.md → Drag and drop): drag a list
 * by its handle with the pointer, or focus the handle and use Space, the arrow keys and Space
 * (Escape cancels). Dropping computes the position between the new neighbours with the shared
 * helpers and moves the list optimistically.
 */
export function SortableLists({ boardId, lists, canEdit }: SortableListsProps) {
  const queryClient = useQueryClient();
  const moveList = useMoveList(boardId);
  const sensors = useSensors(
    // A click on the handle is not a drag; buttons inside the list keep working.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const titleOf = (id: string | number) => lists.find((list) => list.id === id)?.title ?? '';
  const placeOf = (id: string | number) => lists.findIndex((list) => list.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up list ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `List ${titleOf(active.id)} is at position ${placeOf(over.id)} of ${lists.length}.`
        : `List ${titleOf(active.id)} is no longer over a position.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `List ${titleOf(active.id)} was dropped at position ${placeOf(over.id)} of ${lists.length}.`
        : `List ${titleOf(active.id)} was dropped.`,
    onDragCancel: ({ active }) => `Moving list ${titleOf(active.id)} was cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
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
      collisionDetection={closestCenter}
      accessibility={{ announcements }}
      // While a list is dragged, a refetch must not reorder the row under the pointer.
      onDragStart={() => void queryClient.cancelQueries({ queryKey: boardKeys.detail(boardId) })}
      onDragEnd={onDragEnd}
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
  } = useSortable({ id: list.id, disabled: !canEdit });

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
