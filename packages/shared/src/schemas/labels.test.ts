import { describe, expect, it } from 'vitest';

import { CreateLabelInputSchema, LabelNameSchema, UpdateLabelInputSchema } from './labels';

describe('LabelNameSchema', () => {
  it.each([
    { input: '  Bug ', normalized: 'Bug' },
    { input: '', normalized: '' },
    { input: '   ', normalized: '' },
    { input: 'x'.repeat(50), normalized: 'x'.repeat(50) },
  ])('accepts $input and trims it', ({ input, normalized }) => {
    expect(LabelNameSchema.parse(input)).toBe(normalized);
  });

  it.each(['x'.repeat(51), 42, null])('rejects %j', (name) => {
    expect(LabelNameSchema.safeParse(name).success).toBe(false);
  });
});

describe('CreateLabelInputSchema', () => {
  it('a colour alone makes a colour-only label', () => {
    expect(CreateLabelInputSchema.parse({ color: '#61bd4f' })).toEqual({
      name: '',
      color: '#61bd4f',
    });
  });

  it.each([{ name: 'Bug' }, { name: 'Bug', color: 'green' }, { name: 'Bug', color: '#61bd4' }])(
    'rejects %j',
    (input) => {
      expect(CreateLabelInputSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe('UpdateLabelInputSchema', () => {
  it.each([{ name: 'Bug' }, { color: '#eb5a46' }, { name: '', color: '#eb5a46' }])(
    'accepts %j',
    (input) => {
      expect(UpdateLabelInputSchema.safeParse(input).success).toBe(true);
    },
  );

  it.each([{}, { color: 'red' }])('rejects %j', (input) => {
    expect(UpdateLabelInputSchema.safeParse(input).success).toBe(false);
  });
});
