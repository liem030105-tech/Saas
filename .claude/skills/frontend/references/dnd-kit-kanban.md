# Kanban drag and drop with @dnd-kit (LIST-003, CARD-004)

Behaviour: [design/ui.md → Drag and drop](../../../../docs/design/ui.md#drag-and-drop-behaviour). Ordering: [relationships.md → Ordering](../../../../docs/database/relationships.md#ordering-position). Packages: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`.

## Structure
```
<DndContext sensors collisionDetection={closestCorners} onDragStart onDragOver onDragEnd onDragCancel>
  <SortableContext items={listIds} strategy={horizontalListSortingStrategy}>   // lists
    {lists.map((list) => (
      <SortableList key={list.id} list={list}>
        <SortableContext items={cardIdsOf(list)} strategy={verticalListSortingStrategy}>   // cards per list
          {cards.map((card) => <SortableCard key={card.id} card={card} />)}
        </SortableContext>
      </SortableList>
    ))}
  </SortableContext>
  <DragOverlay>{active && <CardTile card={active} dragging />}</DragOverlay>
</DndContext>
```
- Give every draggable `data: { type: 'card' | 'list', listId }` so handlers know what is being dragged and where it came from.
- An empty list must still be a drop target: make the list body a `useDroppable({ id: list.id, data: { type: 'list' } })`.

## Sensors (mouse, touch, keyboard)
```ts
const sensors = useSensors(
  useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), // a click still opens the card
  useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
);
```
Provide `accessibility.announcements` with human text ("Picked up card Fix login. Moved to Doing, position 2 of 5.").

## Handlers
- `onDragStart`: remember the active item and a snapshot of the board cache; pause applying refetches for this board.
- `onDragOver` (cards only): when the card enters another list, move it **in local preview state** (not the Query cache) so the placeholder follows the pointer.
- `onDragEnd`: compute the final neighbours in the target list **without** the dragged card, then the position with the shared helpers:
```ts
import { initialPosition, positionAfter, positionBefore, positionBetween } from '@trello-clone/shared';

function positionAt(siblings: { position: number }[], index: number) {
  const prev = siblings[index - 1];
  const next = siblings[index];
  if (!prev && !next) return initialPosition();
  if (!prev) return positionBefore(next!.position);
  if (!next) return positionAfter(prev.position);
  return positionBetween(prev.position, next.position);
}
```
  Then call the move mutation (optimistic update per [tanstack-query.md](tanstack-query.md)). Keep the optimistic order until the `onSettled` refetch: after a rebalance the server renumbers every sibling, so patching only the moved item with its final position would tie it with stale neighbours and make it jump (LIST-003, `useMoveList`).
- `onDragCancel` (Escape): restore the snapshot; no request.
- Dropping in the same place: no request.

## Pitfalls
- Never compute positions from array indexes alone: positions are floats that drift closer together as items are inserted between rebalances (a rebalance respaces them evenly).
- Sort by `position, id` everywhere (the same tie-break as the server).
- Memoize `SortableCard`: re-rendering every card on each `onDragOver` makes large boards stutter.
- VIEWER: render without `useSortable` listeners (no drag handles); the API would reject the move anyway.

## Tests
Hook test (MSW): optimistic move, server-position reconciliation, rollback with a toast on 403/500. E2E scenario 4: drag between lists, reload, order persisted. Keyboard move covered by one E2E step.
