// Label test data (CARD-005).

export const labelData = {
  /** The six labels a new board starts with, in order (docs/api/boards.md → Labels). */
  defaults: ['#61bd4f', '#f2d600', '#ff9f1a', '#eb5a46', '#c377e0', '#0079bf'],
  create: {
    input: { name: '  Bug ', color: '#344563' },
    stored: { name: 'Bug', color: '#344563' },
  },
  colourOnly: { input: { color: '#ff78cb' }, stored: { name: '', color: '#ff78cb' } },
  update: {
    input: { name: ' Urgent ', color: '#eb5a46' },
    stored: { name: 'Urgent', color: '#eb5a46' },
  },
  /** A well-formed label id nothing has, and an id that is not a cuid: both answer 404. */
  unknownLabelId: 'clx0000000000000000000094',
  malformedLabelId: 'not-a-cuid',
};

/** One invalid POST /boards/:boardId/labels body per rule; each must fail with 400. */
export const invalidLabelBodies = [
  { case: 'missing color', body: { name: 'Bug' } },
  { case: 'color not hex', body: { color: 'red' } },
  { case: 'name over 50 chars', body: { name: 'n'.repeat(51), color: '#344563' } },
] as const;

/** One invalid PATCH /labels/:labelId body per rule; each must fail with 400. */
export const invalidLabelUpdates = [
  { case: 'no field', body: {} },
  { case: 'color not hex', body: { color: '#12345' } },
  { case: 'name over 50 chars', body: { name: 'n'.repeat(51) } },
] as const;
