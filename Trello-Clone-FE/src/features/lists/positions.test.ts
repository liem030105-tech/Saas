import { positionAt, positionBetweenNeighbours } from './positions';

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

describe('positionBetweenNeighbours', () => {
  it.each([
    { case: 'no neighbours', before: undefined, after: undefined, expected: 1024 },
    { case: 'only an after', before: undefined, after: 1024, expected: 512 },
    { case: 'only a before', before: 1024, after: undefined, expected: 2048 },
    { case: 'both', before: 1024, after: 2048, expected: 1536 },
  ])('$case', ({ before, after, expected }) => {
    expect(positionBetweenNeighbours(before, after)).toBe(expected);
  });
});
