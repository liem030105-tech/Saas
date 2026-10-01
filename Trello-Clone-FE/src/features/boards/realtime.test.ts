import { roadmapBoard } from '@/testing/data/boards';
import { loginCard, roadmapWithCards, signupCard } from '@/testing/data/cards';
import { doingList, todoList } from '@/testing/data/lists';

import { applyBoardEvent } from './realtime';

import type { BoardDetailDto, RealtimeEvent, RealtimeEventType } from '@trello-clone/shared';

const LATER = Date.parse('2026-10-01T00:00:00.000Z');
const OLDER = Date.parse('2026-09-01T00:00:00.000Z');
const otherBoard = 'clx0000000000000000000039';

const event = <T extends RealtimeEventType>(
  type: T,
  data: RealtimeEvent<T>['data'],
  version = LATER,
): RealtimeEvent<T> => ({
  eventId: 'e1',
  type,
  boardId: roadmapBoard.id,
  workspaceId: roadmapBoard.workspaceId,
  actorId: 'someone-else',
  version,
  data,
});

const board = () => structuredClone(roadmapWithCards);
const apply = (b: BoardDetailDto, e: RealtimeEvent) =>
  applyBoardEvent(b, e as Parameters<typeof applyBoardEvent>[1]);
const titles = (b: unknown) => (b as BoardDetailDto).lists.map((list) => list.title);
const cardsOf = (b: unknown, listId: string) =>
  (b as BoardDetailDto).lists.find((list) => list.id === listId)!.cards.map((card) => card.title);

describe('applyBoardEvent', () => {
  it('board:updated applies a newer board and ignores a stale one', () => {
    const renamed = { ...roadmapBoard, title: 'Q4', updatedAt: new Date(LATER).toISOString() };
    expect((apply(board(), event('board:updated', renamed)) as BoardDetailDto).title).toBe('Q4');
    const current = board();
    expect(apply(current, event('board:updated', renamed, OLDER))).toBe(current);
  });

  it('board:deleted asks for a refetch', () => {
    expect(apply(board(), event('board:deleted', { boardId: roadmapBoard.id }))).toBe('refetch');
  });

  it('lists: created in order, renamed, archived away, moved, reordered and deleted', () => {
    const added = apply(
      board(),
      event('list:created', {
        ...todoList,
        id: 'clx00000000000000000000l3',
        title: 'Done',
        position: 1500,
      }),
    );
    expect(titles(added)).toEqual(['To do', 'Done', 'Doing']);
    // The same list again (e.g. a repeat) changes nothing.
    expect(apply(added as BoardDetailDto, event('list:created', { ...todoList }))).toBe(added);

    const renamed = apply(
      board(),
      event('list:updated', {
        ...todoList,
        title: 'Backlog',
        updatedAt: new Date(LATER).toISOString(),
      }),
    );
    expect(titles(renamed)).toEqual(['Backlog', 'Doing']);
    expect(cardsOf(renamed, todoList.id)).toEqual(['Fix login', 'Sign-up form']);

    const archived = apply(board(), event('list:updated', { ...todoList, archived: true }));
    expect(titles(archived)).toEqual(['Doing']);
    // A list brought back needs its cards: refetch.
    expect(apply(withoutTodo(), event('list:updated', { ...todoList, archived: false }))).toBe(
      'refetch',
    );

    const moved = apply(board(), event('list:moved', { listId: todoList.id, position: 4096 }));
    expect(titles(moved)).toEqual(['Doing', 'To do']);

    const reordered = apply(
      board(),
      event('list:reordered', { positions: { [todoList.id]: 2, [doingList.id]: 1 } }),
    );
    expect(titles(reordered)).toEqual(['Doing', 'To do']);

    expect(titles(apply(board(), event('list:deleted', { listId: todoList.id })))).toEqual([
      'Doing',
    ]);
  });

  it('cards: created, updated in place, archived away, deleted and reordered', () => {
    const created = apply(
      board(),
      event('card:created', {
        ...loginCard,
        id: 'clx00000000000000000000c3',
        title: 'New',
        listId: doingList.id,
      }),
    );
    expect(cardsOf(created, doingList.id)).toEqual(['New']);

    const updated = apply(
      board(),
      event('card:updated', { ...loginCard, title: 'Fixed', archived: false }),
    );
    expect(cardsOf(updated, todoList.id)).toEqual(['Fixed', 'Sign-up form']);

    const archived = apply(board(), event('card:updated', { ...loginCard, archived: true }));
    expect(cardsOf(archived, todoList.id)).toEqual(['Sign-up form']);
    // Unarchived: the tile comes back where it belongs.
    expect(
      cardsOf(
        apply(archived as BoardDetailDto, event('card:updated', { ...loginCard, archived: false })),
        todoList.id,
      ),
    ).toEqual(['Fix login', 'Sign-up form']);

    expect(
      cardsOf(
        apply(board(), event('card:deleted', { cardId: loginCard.id, listId: todoList.id })),
        todoList.id,
      ),
    ).toEqual(['Sign-up form']);

    const reordered = apply(
      board(),
      event('card:reordered', {
        listId: todoList.id,
        positions: { [loginCard.id]: 2, [signupCard.id]: 1 },
      }),
    );
    expect(cardsOf(reordered, todoList.id)).toEqual(['Sign-up form', 'Fix login']);
  });

  it('card:moved within the board, away to another board, and in from another board', () => {
    const moved = {
      cardId: loginCard.id,
      fromListId: todoList.id,
      toListId: doingList.id,
      fromBoardId: roadmapBoard.id,
      toBoardId: roadmapBoard.id,
      position: 1024,
    };
    const within = apply(board(), event('card:moved', moved));
    expect(cardsOf(within, todoList.id)).toEqual(['Sign-up form']);
    expect(cardsOf(within, doingList.id)).toEqual(['Fix login']);

    const away = apply(board(), event('card:moved', { ...moved, toBoardId: otherBoard }));
    expect(cardsOf(away, todoList.id)).toEqual(['Sign-up form']);
    expect(cardsOf(away, doingList.id)).toEqual([]);

    const arriving = { ...moved, cardId: 'clx00000000000000000000c9', fromBoardId: otherBoard };
    expect(apply(board(), event('card:moved', arriving))).toBe('refetch');
  });
});

function withoutTodo(): BoardDetailDto {
  const b = board();
  return { ...b, lists: b.lists.filter((list) => list.id !== todoList.id) };
}
