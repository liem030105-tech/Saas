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
