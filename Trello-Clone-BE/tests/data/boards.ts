// Board test data (BOARD-001).

export const boardData = {
  create: { input: { title: '  Roadmap ', background: '#d29034' }, stored: 'Roadmap' },
  defaultBackground: '#0079bf',
  workspaceName: 'Boards',
  titles: ['First', 'Second', 'Third'],
  archivedTitle: 'Old sprint',
  /** A body that passes validation, for requests that must fail before creating anything. */
  anyBody: { title: 'Any board' },
  invalidArchivedQuery: 'archived=maybe',
  /** A well-formed board id nothing has. */
  unknownBoardId: 'clx0000000000000000000098',
  tenantBoard: { a: 'A board', b: 'B board' },
};

/** One invalid POST …/boards body per rule; each must fail with 400. */
export const invalidBoardBodies = [
  { case: 'missing title', body: {} },
  { case: 'blank title', body: { title: '   ' } },
  { case: 'title over 100 chars', body: { title: 't'.repeat(101) } },
  { case: 'background not a hex colour', body: { title: 'Roadmap', background: 'blue' } },
] as const;
