// Drag-and-drop ids and data shared by the board's DndContext (features/lists/SortableLists) and
// the card sortables here. List and card ids are cuids; a list's card area gets its own id.

/** `data.type` of every draggable or droppable on the board. */
export type BoardDndType = 'list' | 'card' | 'card-list';

/** The droppable area holding a list's cards (an empty list is still a drop target). */
export const cardsDropId = (listId: string) => `cards-of-${listId}`;

/** What a dragged item of `active` type may land on. */
export const acceptsDrop = (active: unknown, over: unknown) =>
  active === 'card' ? over === 'card' || over === 'card-list' : active === over;
