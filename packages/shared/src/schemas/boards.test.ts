import { describe, expect, it } from 'vitest';

import {
  BoardDetailDtoSchema,
  BoardDtoSchema,
  BoardTitleSchema,
  CreateBoardInputSchema,
  ListBoardsQuerySchema,
  UpdateBoardInputSchema,
} from './boards';
import { HexColorSchema } from './common';
import data from '../../tests/data/boards.json';
import { ACTIVITY_TYPES } from '../constants/activity';

describe('BoardTitleSchema', () => {
  it.each(data.validTitles)('accepts $input and trims it', ({ input, normalized }) => {
    expect(BoardTitleSchema.parse(input)).toBe(normalized);
  });

  it.each(data.invalidTitles)('rejects %j', (title) => {
    expect(BoardTitleSchema.safeParse(title).success).toBe(false);
  });
});

describe('HexColorSchema', () => {
  it.each(data.validColors)('accepts %s', (color) => {
    expect(HexColorSchema.safeParse(color).success).toBe(true);
  });

  it.each(data.invalidColors)('rejects %j', (color) => {
    expect(HexColorSchema.safeParse(color).success).toBe(false);
  });
});

describe('CreateBoardInputSchema / ListBoardsQuerySchema / BoardDtoSchema', () => {
  it('keeps the title and optional background only', () => {
    expect(
      CreateBoardInputSchema.parse({ title: ' Roadmap ', archived: true, workspaceId: 'x' }),
    ).toEqual({ title: 'Roadmap' });
  });

  it('reads archived as a boolean, false by default', () => {
    expect(ListBoardsQuerySchema.parse({})).toEqual({ archived: false });
    expect(ListBoardsQuerySchema.parse({ archived: 'true' })).toEqual({ archived: true });
    expect(ListBoardsQuerySchema.safeParse({ archived: 'yes' }).success).toBe(false);
  });

  it('parses a board', () => {
    expect(BoardDtoSchema.parse(data.boardDto)).toEqual(data.boardDto);
  });

  it('lists the activity types logged so far', () => {
    expect(ACTIVITY_TYPES).toEqual([
      'BOARD_CREATED',
      'BOARD_UPDATED',
      'LIST_CREATED',
      'LIST_UPDATED',
      'LIST_ARCHIVED',
      'LIST_MOVED',
      'CARD_CREATED',
      'CARD_UPDATED',
      'CARD_ARCHIVED',
      'CARD_MOVED',
      'MEMBER_ADDED',
      'MEMBER_REMOVED',
    ]);
  });
});

describe('UpdateBoardInputSchema / BoardDetailDtoSchema', () => {
  it.each(data.validUpdates)('accepts %j', (input) => {
    expect(UpdateBoardInputSchema.safeParse(input).success).toBe(true);
  });

  it.each(data.invalidUpdates)('rejects %j', (input) => {
    expect(UpdateBoardInputSchema.safeParse(input).success).toBe(false);
  });

  it('parses a board detail with (for now) no lists or labels', () => {
    const detail = { ...data.boardDto, lists: [], labels: [] };
    expect(BoardDetailDtoSchema.parse(detail)).toEqual(detail);
  });
});
