import { describe, expect, it } from 'vitest';

import { formatMention, mentionedUserIds } from './mentions';

// D-28: mention tokens in comments.

const ada = 'clx0000000000000000000001';
const bob = 'clx0000000000000000000002';

describe('mentions', () => {
  it('formats a mention token, dropping brackets from the name', () => {
    expect(formatMention('Ada Lovelace', ada)).toBe(`@[Ada Lovelace](mention:${ada})`);
    expect(formatMention('Ada [admin]', ada)).toBe(`@[Ada admin](mention:${ada})`);
  });

  it('reads the mentioned ids once each, in order; ignores look-alikes', () => {
    const content = [
      `Hi ${formatMention('Bob', bob)} and ${formatMention('Ada', ada)}`,
      `again ${formatMention('Bob', bob)}`,
      `[Ada](mention:${ada}) without @, @[x](https://example.test), @[y](mention:short)`,
    ].join('\n');
    expect(mentionedUserIds(content)).toEqual([bob, ada]);
  });
});
