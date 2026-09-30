// List test data (LIST-001).

export const listData = {
  workspaceName: 'Lists',
  boardTitle: 'Roadmap',
  create: { input: { title: '  To do ' }, stored: 'To do' },
  /** Appended in this order; they must come back in the same order. */
  titles: ['To do', 'Doing', 'Done'],
  archivedTitle: 'Old list',
  /** A client-chosen position (e.g. the FE's prediction) is stored as sent. */
  explicit: { title: 'First', position: 512 },
  tenantList: { a: 'A list', b: 'B list' },
  rename: { input: { title: '  Renamed list ' }, stored: 'Renamed list' },
  /** A well-formed list id nothing has, and an id that is not a cuid: both answer 404. */
  unknownListId: 'clx0000000000000000000097',
  malformedListId: 'not-a-cuid',
};

/** One invalid POST /boards/:boardId/lists body per rule; each must fail with 400. */
export const invalidListBodies = [
  { case: 'missing title', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'title over 100 chars', body: { title: 't'.repeat(101) } },
  { case: 'position zero', body: { title: 'To do', position: 0 } },
  { case: 'negative position', body: { title: 'To do', position: -1 } },
  { case: 'position as text', body: { title: 'To do', position: '1024' } },
] as const;

/** One invalid PATCH /lists/:listId body per rule; each must fail with 400. */
export const invalidListUpdates = [
  { case: 'no field', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'archived not a boolean', body: { archived: 'yes' } },
  { case: 'position only (LIST-003)', body: { position: 2048 } },
] as const;
