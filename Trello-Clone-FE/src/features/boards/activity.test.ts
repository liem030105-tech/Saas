import { describeActivity, type ActivityNames } from './activity';

import type { ActivityDto } from '@trello-clone/shared';

const ada = { id: 'clx0000000000000000000021', name: 'Ada Owner', avatarUrl: null };
const linus = 'clx0000000000000000000022';
const todo = 'clx0000000000000000000041';
const doing = 'clx0000000000000000000042';
const card = 'clx0000000000000000000061';
const board = 'clx0000000000000000000031';
const urgent = 'clx0000000000000000000071';
const green = 'clx0000000000000000000072';

const names: ActivityNames = {
  lists: new Map([
    [todo, 'To do'],
    [doing, 'Doing'],
  ]),
  cards: new Map([[card, 'Fix login']]),
  members: new Map([[linus, 'Linus Member']]),
  labels: new Map([
    [urgent, { name: 'Urgent', color: '#eb5a46' }],
    [green, { name: '', color: '#61bd4f' }],
  ]),
  labelText: (label) => label.name || (label.color === '#61bd4f' ? 'Green label' : 'Red label'),
};

const entry = (
  type: ActivityDto['type'],
  data: Record<string, unknown>,
  cardId: string | null = card,
): ActivityDto => ({
  id: 'clx0000000000000000000201',
  type,
  data,
  createdAt: '2026-10-01T10:00:00.000Z',
  cardId,
  user: ada,
});

describe('describeActivity', () => {
  it.each([
    ['BOARD_CREATED', {}, null, 'created this board'],
    ['BOARD_UPDATED', { title: 'Q4' }, null, 'renamed this board to Q4'],
    ['BOARD_UPDATED', { archived: true }, null, 'archived this board'],
    ['BOARD_UPDATED', { background: '#0079bf' }, null, 'changed the board colour'],
    ['LIST_CREATED', { listId: todo, title: 'To do' }, null, 'added list To do'],
    ['LIST_UPDATED', { listId: todo, title: 'Backlog' }, null, 'renamed a list to Backlog'],
    ['LIST_ARCHIVED', { listId: 'gone', archived: true }, null, 'archived a list'],
    ['LIST_MOVED', { listId: doing, position: 1 }, null, 'moved list Doing'],
    ['CARD_CREATED', { listId: todo, title: 'Fix login' }, card, 'added Fix login to To do'],
    ['CARD_UPDATED', { title: 'Fix it' }, card, 'renamed Fix login to Fix it'],
    ['CARD_UPDATED', { completed: true }, card, 'marked Fix login as complete'],
    ['CARD_UPDATED', { dueDate: null }, card, 'removed the due date of Fix login'],
    ['CARD_UPDATED', { description: true }, card, 'updated the description of Fix login'],
    ['CARD_ARCHIVED', { archived: true }, card, 'archived Fix login'],
    [
      'CARD_MOVED',
      { fromListId: todo, toListId: doing, fromBoardId: board, toBoardId: board },
      card,
      'moved Fix login from To do to Doing',
    ],
    [
      'CARD_MOVED',
      { fromListId: 'x', toListId: doing, fromBoardId: 'other', toBoardId: board },
      card,
      'moved Fix login to Doing from another board',
    ],
    ['MEMBER_ADDED', { userId: linus }, card, 'added Linus Member to Fix login'],
    ['MEMBER_ADDED', { userId: ada.id }, card, 'joined Fix login'],
    ['MEMBER_REMOVED', { userId: 'gone' }, card, 'removed a former member from Fix login'],
    ['COMMENT_ADDED', { commentId: 'c' }, card, 'commented on Fix login'],
    [
      'LABEL_ADDED',
      { labelId: urgent, name: 'Old', color: '#eb5a46' },
      card,
      'added label Urgent to Fix login',
    ],
    [
      'LABEL_ADDED',
      { labelId: green, name: '', color: '#61bd4f' },
      card,
      'added the green label to Fix login',
    ],
    [
      'LABEL_REMOVED',
      { labelId: 'gone', name: 'Bug', color: '#eb5a46' },
      card,
      'removed label Bug from Fix login',
    ],
    [
      'LABEL_REMOVED',
      { labelId: 'gone', name: '', color: '#eb5a46' },
      card,
      'removed the red label from Fix login',
    ],
    [
      'LABEL_REMOVED',
      { labelId: 'gone', name: null, color: null },
      card,
      'removed a label from Fix login',
    ],
    [
      'CHECKLIST_ADDED',
      { checklistId: 'k', title: 'Launch' },
      card,
      'added checklist Launch to Fix login',
    ],
    [
      'CHECKLIST_REMOVED',
      { checklistId: 'k', title: 'Launch' },
      card,
      'removed checklist Launch from Fix login',
    ],
    [
      'CHECKLIST_ITEM_CHECKED',
      { checklistId: 'k', itemId: 'i', content: 'Ship it', done: true },
      card,
      'completed Ship it on Fix login',
    ],
    [
      'CHECKLIST_ITEM_CHECKED',
      { checklistId: 'k', itemId: 'i', content: 'Ship it', done: false },
      card,
      'marked Ship it incomplete on Fix login',
    ],
  ] as const)('%s %j reads "%s"', (type, data, cardId, expected) => {
    expect(describeActivity(entry(type, data, cardId), names)).toBe(expected);
  });

  it('calls the card of a card feed "this card"', () => {
    const moved = entry('CARD_MOVED', {
      fromListId: todo,
      toListId: doing,
      fromBoardId: board,
      toBoardId: board,
    });

    expect(describeActivity(moved, { ...names, cardId: card })).toBe(
      'moved this card from To do to Doing',
    );
  });

  it('names a card no longer on the board (or deleted) by its logged title, or "a card"', () => {
    const unknown = 'clx0000000000000000000069';

    expect(
      describeActivity(entry('CARD_CREATED', { listId: todo, title: 'Old' }, unknown), names),
    ).toBe('added Old to To do');
    expect(
      describeActivity(entry('CARD_CREATED', { listId: todo, title: 'Gone' }, null), names),
    ).toBe('added Gone to To do');
    expect(describeActivity(entry('CARD_ARCHIVED', {}, null), names)).toBe('archived a card');
    // A rename logs the new title: it never names the card it renamed.
    expect(describeActivity(entry('CARD_UPDATED', { title: 'New' }, unknown), names)).toBe(
      'renamed a card to New',
    );
  });
});
