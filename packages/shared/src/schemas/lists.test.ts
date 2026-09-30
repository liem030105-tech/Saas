import { describe, expect, it } from 'vitest';

import { PositionSchema } from './common';
import {
  CreateListInputSchema,
  ListDtoSchema,
  ListTitleSchema,
  UpdateListInputSchema,
} from './lists';
import data from '../../tests/data/lists.json';

describe('ListTitleSchema', () => {
  it.each(data.validTitles)('accepts $input and trims it', ({ input, normalized }) => {
    expect(ListTitleSchema.parse(input)).toBe(normalized);
  });

  it.each(data.invalidTitles)('rejects %j', (title) => {
    expect(ListTitleSchema.safeParse(title).success).toBe(false);
  });
});

describe('PositionSchema', () => {
  it.each(data.validPositions)('accepts %s', (position) => {
    expect(PositionSchema.safeParse(position).success).toBe(true);
  });

  // JSON has no Infinity or NaN, so the data spells the numbers out.
  it.each(data.invalidPositions)('rejects %s', (spelled) => {
    expect(PositionSchema.safeParse(Number(spelled)).success).toBe(false);
  });

  it('rejects a number sent as text', () => {
    expect(PositionSchema.safeParse(data.notNumberPosition).success).toBe(false);
  });
});

describe('CreateListInputSchema', () => {
  it('takes a title and an optional position', () => {
    expect(CreateListInputSchema.parse({ title: ' To do ' })).toEqual({ title: 'To do' });
    expect(CreateListInputSchema.parse({ title: 'To do', position: 512 })).toEqual({
      title: 'To do',
      position: 512,
    });
  });

  it('rejects an invalid position', () => {
    expect(CreateListInputSchema.safeParse({ title: 'To do', position: 0 }).success).toBe(false);
  });
});

describe('ListDtoSchema', () => {
  it('accepts a list as the API returns it', () => {
    expect(ListDtoSchema.parse(data.listDto)).toEqual(data.listDto);
  });
});

describe('UpdateListInputSchema', () => {
  it.each(data.validUpdates)('accepts %j', (input) => {
    expect(UpdateListInputSchema.safeParse(input).success).toBe(true);
  });

  // `position` alone is not a change yet (LIST-003): it is stripped, leaving no field.
  it.each(data.invalidUpdates)('rejects %j', (input) => {
    expect(UpdateListInputSchema.safeParse(input).success).toBe(false);
  });
});
