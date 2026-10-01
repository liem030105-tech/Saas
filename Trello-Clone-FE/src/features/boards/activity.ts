import type { ActivityDto, BoardDetailDto, UserSummary } from '@trello-clone/shared';

// How an activity entry reads in a feed (docs/design/ui.md → Activity): "{actor} {what they did}".
// `data` is the event as logged (docs/api/boards.md → GET /boards/:boardId/activities); names come
// from what the page already has, with a neutral fallback for lists, cards and people it does not.

/** What the feed knows by id, to name lists, cards and members. */
export interface ActivityNames {
  lists: ReadonlyMap<string, string>;
  cards: ReadonlyMap<string, string>;
  members: ReadonlyMap<string, string>;
  /** The card whose feed this is: it reads as "this card". */
  cardId?: string;
}

const text = (value: unknown) => (typeof value === 'string' ? value : undefined);

/** What the actor did, e.g. "moved this card from To do to Doing". */
export function describeActivity(activity: ActivityDto, names: ActivityNames): string {
  const { data } = activity;
  const list = (id: unknown) => names.lists.get(text(id) ?? '') ?? 'a list';
  /** "list Doing", or "a list" for one the page does not show (archived or deleted). */
  const listRef = (id: unknown) => {
    const title = names.lists.get(text(id) ?? '');
    return title ? `list ${title}` : 'a list';
  };
  // A card the page does not show (archived or deleted) keeps the title logged when it was added.
  const card =
    activity.cardId !== null && activity.cardId === names.cardId
      ? 'this card'
      : ((activity.cardId !== null ? names.cards.get(activity.cardId) : undefined) ??
        (activity.type === 'CARD_CREATED' ? text(data.title) : undefined) ??
        'a card');
  const member = (id: unknown) => names.members.get(text(id) ?? '') ?? 'a former member';
  const self = data.userId === activity.user.id;

  switch (activity.type) {
    case 'BOARD_CREATED':
      return 'created this board';
    case 'BOARD_UPDATED':
      if (text(data.title)) return `renamed this board to ${text(data.title)}`;
      if (data.archived === true) return 'archived this board';
      if (data.archived === false) return 'unarchived this board';
      if (data.background !== undefined) return 'changed the board colour';
      return 'updated this board';
    case 'LIST_CREATED':
      return `added list ${text(data.title) ?? list(data.listId)}`;
    case 'LIST_UPDATED':
      if (text(data.title)) return `renamed a list to ${text(data.title)}`;
      if (data.archived === false) return `unarchived ${listRef(data.listId)}`;
      return `updated ${listRef(data.listId)}`;
    case 'LIST_ARCHIVED':
      return `archived ${listRef(data.listId)}`;
    case 'LIST_MOVED':
      return `moved ${listRef(data.listId)}`;
    case 'CARD_CREATED':
      return `added ${card} to ${list(data.listId)}`;
    case 'CARD_UPDATED':
      if (text(data.title)) return `renamed ${card} to ${text(data.title)}`;
      if (data.completed === true) return `marked ${card} as complete`;
      if (data.completed === false) return `marked ${card} as incomplete`;
      if (data.dueDate === null) return `removed the due date of ${card}`;
      if (data.dueDate !== undefined) return `changed the due date of ${card}`;
      if (data.description !== undefined) return `updated the description of ${card}`;
      if (data.archived === false) return `unarchived ${card}`;
      return `updated ${card}`;
    case 'CARD_ARCHIVED':
      return `archived ${card}`;
    case 'CARD_MOVED':
      return data.fromBoardId !== data.toBoardId
        ? `moved ${card} to ${list(data.toListId)} from another board`
        : `moved ${card} from ${list(data.fromListId)} to ${list(data.toListId)}`;
    case 'MEMBER_ADDED':
      return self ? `joined ${card}` : `added ${member(data.userId)} to ${card}`;
    case 'MEMBER_REMOVED':
      return self ? `left ${card}` : `removed ${member(data.userId)} from ${card}`;
    case 'COMMENT_ADDED':
      return `commented on ${card}`;
  }
}

/** The names a board's feed can show: its open lists and cards, and the workspace's members. */
export function namesOf(board: BoardDetailDto, members: readonly UserSummary[]): ActivityNames {
  return {
    lists: new Map(board.lists.map((list) => [list.id, list.title])),
    cards: new Map(
      board.lists.flatMap((list) => list.cards.map((card) => [card.id, card.title] as const)),
    ),
    members: new Map(members.map((user) => [user.id, user.name])),
  };
}
