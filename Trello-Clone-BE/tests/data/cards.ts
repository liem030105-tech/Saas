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
};

/** One invalid POST /lists/:listId/cards body per rule; each must fail with 400. */
export const invalidCardBodies = [
  { case: 'missing title', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'title over 200 chars', body: { title: 't'.repeat(201) } },
  { case: 'position zero', body: { title: 'Card', position: 0 } },
  { case: 'position as text', body: { title: 'Card', position: '1024' } },
] as const;
