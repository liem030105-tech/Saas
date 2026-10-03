import { formatMention } from '@trello-clone/shared';

import { excerptText } from './describe';

// A comment excerpt in the bell shows mentions as names (D-28).

describe('excerptText', () => {
  it('shows each mention as "@Name"', () => {
    const excerpt = `Please check ${formatMention('Bob Check', 'clx0000000000000000000002')} thanks`;
    expect(excerptText(excerpt)).toBe('Please check @Bob Check thanks');
  });

  it('leaves other links and text alone', () => {
    expect(excerptText('See [docs](https://example.test) @Ada')).toBe(
      'See [docs](https://example.test) @Ada',
    );
  });
});
