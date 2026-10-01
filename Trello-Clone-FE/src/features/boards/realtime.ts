import type { BoardDetailDto, RealtimeEvent, RealtimeEventType } from '@trello-clone/shared';

// How a board-room event changes the cached board (docs/architecture/realtime.md → FE
// synchronization rules → Applying): small changes are patched in place; anything the event cannot
// describe (a card that arrives from another board, a list brought back with its cards, the board
// deleted) asks for a refetch instead. Events about comments change nothing here.

/** Board-room events this board reacts to. */
export const BOARD_EVENTS = [
  'board:updated',
  'board:deleted',
  'list:created',
  'list:updated',
  'list:moved',
  'list:reordered',
  'list:deleted',
  'card:created',
  'card:updated',
  'card:moved',
  'card:reordered',
  'card:deleted',
] as const satisfies readonly RealtimeEventType[];

type BoardEvent = RealtimeEvent<(typeof BOARD_EVENTS)[number]>;
type List = BoardDetailDto['lists'][number];
type Card = List['cards'][number];

/** The patched board, the same board when nothing changes, or 'refetch'. */
export type BoardUpdate = BoardDetailDto | 'refetch';

const byPosition = <T extends { position: number; id: string }>(items: T[]) =>
  [...items].sort((a, b) => a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

const withLists = (board: BoardDetailDto, lists: List[]): BoardDetailDto => ({
  ...board,
  lists: byPosition(lists),
});

const mapCards = (board: BoardDetailDto, update: (cards: Card[], list: List) => Card[]) =>
  withLists(
    board,
    board.lists.map((list) => ({ ...list, cards: byPosition(update(list.cards, list)) })),
  );

const withoutCard = (board: BoardDetailDto, cardId: string) =>
  mapCards(board, (cards) => cards.filter((card) => card.id !== cardId));

const hasCard = (board: BoardDetailDto, cardId: string) =>
  board.lists.some((list) => list.cards.some((card) => card.id === cardId));

/** An event older than (or as old as) the stored record changes nothing. */
const isStale = (version: number, updatedAt: string) => version <= Date.parse(updatedAt);

export function applyBoardEvent(board: BoardDetailDto, event: BoardEvent): BoardUpdate {
  switch (event.type) {
    case 'board:updated': {
      const { data } = event as RealtimeEvent<'board:updated'>;
      if (isStale(event.version, board.updatedAt)) return board;
      const { title, background, archived, updatedAt } = data;
      return { ...board, title, background, archived, updatedAt };
    }
    case 'board:deleted':
      return 'refetch'; // the refetch answers 404: the page shows "Page not found"
    case 'list:created': {
      const { data } = event as RealtimeEvent<'list:created'>;
      if (data.archived || board.lists.some((list) => list.id === data.id)) return board;
      return withLists(board, [...board.lists, { ...data, cards: [] }]);
    }
    case 'list:updated': {
      const { data } = event as RealtimeEvent<'list:updated'>;
      const list = board.lists.find((item) => item.id === data.id);
      if (!list) return data.archived ? board : 'refetch'; // brought back: its cards are needed
      if (isStale(event.version, list.updatedAt)) return board;
      if (data.archived)
        return withLists(
          board,
          board.lists.filter((item) => item !== list),
        );
      return withLists(
        board,
        board.lists.map((item) => (item === list ? { ...data, cards: list.cards } : item)),
      );
    }
    case 'list:moved': {
      const { data } = event as RealtimeEvent<'list:moved'>;
      if (!board.lists.some((list) => list.id === data.listId)) return board;
      return withLists(
        board,
        board.lists.map((list) =>
          list.id === data.listId ? { ...list, position: data.position } : list,
        ),
      );
    }
    case 'list:reordered': {
      const { positions } = (event as RealtimeEvent<'list:reordered'>).data;
      return withLists(
        board,
        board.lists.map((list) => ({ ...list, position: positions[list.id] ?? list.position })),
      );
    }
    case 'list:deleted': {
      const { listId } = (event as RealtimeEvent<'list:deleted'>).data;
      return withLists(
        board,
        board.lists.filter((list) => list.id !== listId),
      );
    }
    case 'card:created': {
      const { data } = event as RealtimeEvent<'card:created'>;
      if (hasCard(board, data.id)) return board;
      return mapCards(board, (cards, list) => (list.id === data.listId ? [...cards, data] : cards));
    }
    case 'card:updated': {
      const { archived, ...card } = (event as RealtimeEvent<'card:updated'>).data;
      const rest = withoutCard(board, card.id);
      if (archived) return rest;
      return mapCards(rest, (cards, list) => (list.id === card.listId ? [...cards, card] : cards));
    }
    case 'card:moved': {
      const { data } = event as RealtimeEvent<'card:moved'>;
      if (data.toBoardId !== board.id) return withoutCard(board, data.cardId); // left this board
      const moving = board.lists.flatMap((list) => list.cards).find((c) => c.id === data.cardId);
      if (!moving) return 'refetch'; // arrived from another board: only ids are known
      const moved = { ...moving, listId: data.toListId, position: data.position };
      return mapCards(withoutCard(board, data.cardId), (cards, list) =>
        list.id === data.toListId ? [...cards, moved] : cards,
      );
    }
    case 'card:reordered': {
      const { listId, positions } = (event as RealtimeEvent<'card:reordered'>).data;
      return mapCards(board, (cards, list) =>
        list.id === listId
          ? cards.map((card) => ({ ...card, position: positions[card.id] ?? card.position }))
          : cards,
      );
    }
    case 'card:deleted':
      return withoutCard(board, (event as RealtimeEvent<'card:deleted'>).data.cardId);
  }
}
