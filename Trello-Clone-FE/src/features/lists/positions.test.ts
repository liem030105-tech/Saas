import { positionAt } from './positions';

const siblings = [{ position: 1024 }, { position: 2048 }];

describe('positionAt', () => {
  it.each([
    { case: 'an empty list', siblings: [], index: 0, expected: 1024 },
    { case: 'the start', siblings, index: 0, expected: 512 },
    { case: 'between two', siblings, index: 1, expected: 1536 },
    { case: 'the end', siblings, index: 2, expected: 3072 },
  ])('drops at $case', ({ siblings: items, index, expected }) => {
    expect(positionAt(items, index)).toBe(expected);
  });
});
