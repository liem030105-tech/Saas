import { describe, expect, it } from 'vitest';

import {
  CardDetailDtoSchema,
  CardSummaryDtoSchema,
  CardTitleSchema,
  CreateCardInputSchema,
  MoveCardInputSchema,
  UpdateCardInputSchema,
} from './cards';
import data from '../../tests/data/cards.json';

describe('CardTitleSchema', () => {
  it.each(data.validTitles)('accepts a title and trims it', ({ input, normalized }) => {
    expect(CardTitleSchema.parse(input)).toBe(normalized);
  });

  it.each(data.invalidTitles)('rejects %j', (title) => {
    expect(CardTitleSchema.safeParse(title).success).toBe(false);
  });
});

describe('CreateCardInputSchema', () => {
  it('takes a title and an optional position', () => {
    expect(CreateCardInputSchema.parse({ title: ' Fix login ' })).toEqual({ title: 'Fix login' });
    expect(CreateCardInputSchema.parse({ title: 'Fix login', position: 512 })).toEqual({
      title: 'Fix login',
      position: 512,
    });
  });

  it('rejects an invalid position', () => {
    expect(CreateCardInputSchema.safeParse({ title: 'Fix login', position: -1 }).success).toBe(
      false,
    );
  });
});

describe('CardSummaryDtoSchema', () => {
  it('accepts a card as the board returns it', () => {
    expect(CardSummaryDtoSchema.parse(data.cardSummary)).toEqual(data.cardSummary);
  });
});

describe('UpdateCardInputSchema', () => {
  it.each(data.validUpdates)('accepts %j', (input) => {
    expect(UpdateCardInputSchema.safeParse(input).success).toBe(true);
  });

  it.each(data.invalidUpdates)('rejects %j', (input) => {
    expect(UpdateCardInputSchema.safeParse(input).success).toBe(false);
  });
});

describe('CardDetailDtoSchema', () => {
  it('accepts a card as GET /cards/:cardId returns it', () => {
    expect(CardDetailDtoSchema.parse(data.cardDetail)).toEqual(data.cardDetail);
  });
});

describe('MoveCardInputSchema', () => {
  it.each(data.validMoves)('accepts %j', (input) => {
    expect(MoveCardInputSchema.safeParse(input).success).toBe(true);
  });

  it.each(data.invalidMoves)('rejects %j', (input) => {
    expect(MoveCardInputSchema.safeParse(input).success).toBe(false);
  });
});
