import { describe, expect, it } from 'vitest';

import { CuidSchema, ErrorResponseSchema, PaginationQuerySchema } from './common';
import errorResponses from '../../tests/data/error-responses.json';
import pagination from '../../tests/data/pagination.json';
import { ERROR_CODES } from '../constants/error-codes';
import { PAGINATION } from '../constants/pagination';

describe('PaginationQuerySchema', () => {
  it.each(Object.entries(pagination.validQueries))('parses %s', (_name, { input, expected }) => {
    expect(PaginationQuerySchema.parse(input)).toEqual(expected);
  });

  it('defaults limit to D-14 default and caps it at the D-14 max', () => {
    expect(PaginationQuerySchema.parse({}).limit).toBe(PAGINATION.defaultLimit);
    expect(PaginationQuerySchema.parse({ limit: String(PAGINATION.maxLimit) }).limit).toBe(
      PAGINATION.maxLimit,
    );
    expect(
      PaginationQuerySchema.safeParse({ limit: String(PAGINATION.maxLimit + 1) }).success,
    ).toBe(false);
  });

  it('keeps a cuid cursor', () => {
    expect(PaginationQuerySchema.parse({ cursor: pagination.cuid }).cursor).toBe(pagination.cuid);
  });

  it.each(Object.entries(pagination.invalidQueries))('rejects %s', (_name, input) => {
    expect(PaginationQuerySchema.safeParse(input).success).toBe(false);
  });
});

describe('CuidSchema', () => {
  it('accepts a cuid and rejects other strings', () => {
    expect(CuidSchema.safeParse(pagination.cuid).success).toBe(true);
    expect(CuidSchema.safeParse(pagination.invalidQueries.cursorNotACuid.cursor).success).toBe(
      false,
    );
  });
});

describe('ErrorResponseSchema', () => {
  it.each(Object.entries(errorResponses.real))('parses the real BE response %s', (_name, body) => {
    expect(ErrorResponseSchema.parse(body)).toEqual(body);
  });

  it.each(Object.entries(errorResponses.invalid))('rejects %s', (_name, body) => {
    expect(ErrorResponseSchema.safeParse(body).success).toBe(false);
  });

  it('accepts every documented error code', () => {
    const [sample] = Object.values(errorResponses.real);
    for (const code of ERROR_CODES) {
      const body = { error: { ...sample!.error, code } };
      expect(ErrorResponseSchema.safeParse(body).success).toBe(true);
    }
  });
});
