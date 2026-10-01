// Card test data (CARD-001).

export const cardData = {
  workspaceName: 'Cards',
  boardTitle: 'Roadmap',
  listTitle: 'To do',
  create: { input: { title: '  Fix login ' }, stored: 'Fix login' },
  /** Appended in this order; they must come back in the same order. */
  titles: ['First', 'Second', 'Third'],
  archivedTitle: 'Old card',
  tenantCard: { a: 'A card', b: 'B card' },
  /** A well-formed list id nothing has, and an id that is not a cuid: both answer 404. */
  unknownListId: 'clx0000000000000000000096',
  malformedListId: 'not-a-cuid',
  /** A well-formed card id nothing has, and an id that is not a cuid: both answer 404. */
  unknownCardId: 'clx0000000000000000000095',
  malformedCardId: 'not-a-cuid',
  update: {
    input: {
      title: '  Fix the login form ',
      description: '**Steps**\n1. Open /login',
      dueDate: '2026-10-12T09:30:00+07:00',
      completed: true,
    },
    stored: {
      title: 'Fix the login form',
      description: '**Steps**\n1. Open /login',
      dueDate: '2026-10-12T02:30:00.000Z',
      completed: true,
    },
  },
};

/** One invalid POST /lists/:listId/cards body per rule; each must fail with 400. */
export const invalidCardBodies = [
  { case: 'missing title', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'title over 200 chars', body: { title: 't'.repeat(201) } },
  { case: 'position zero', body: { title: 'Card', position: 0 } },
  { case: 'position as text', body: { title: 'Card', position: '1024' } },
] as const;

/** One invalid PATCH /cards/:cardId body per rule; each must fail with 400. */
export const invalidCardUpdates = [
  { case: 'no field', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'title over 200 chars', body: { title: 't'.repeat(201) } },
  { case: 'description over 10 000 chars', body: { description: 'd'.repeat(10_001) } },
  { case: 'dueDate without a time', body: { dueDate: '2026-10-12' } },
  { case: 'dueDate not a date', body: { dueDate: 'tomorrow' } },
  { case: 'completed not a boolean', body: { completed: 'yes' } },
] as const;
