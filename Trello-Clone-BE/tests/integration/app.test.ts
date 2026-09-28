import request from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { API_PREFIX } from '../../src/app';
import {
  clientRequestId,
  internalErrorMessage,
  invalidBody,
  malformedJson,
  paths,
  unsafeRequestId,
  validBody,
} from '../data/http';
import { createTestApp } from '../helpers/test-app';

import type { Express } from 'express';

const testPath = (path: string) => `${API_PREFIX}${path}`;

function expectCanonicalError(res: request.Response, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({
    error: {
      code,
      message: expect.any(String),
      details: expect.any(Array),
      requestId: res.headers['x-request-id'],
    },
  });
  expect(res.headers['x-request-id']).toEqual(expect.any(String));
}

describe('app', () => {
  let app: Express;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('GET /api/v1/health', () => {
    it('returns 200 with status ok and a request id', async () => {
      const res = await request(app).get(paths.health);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: { status: 'ok' } });
      expect(res.headers['x-request-id']).toEqual(expect.any(String));
    });

    it('applies Helmet headers and the CORS allowlist', async () => {
      const res = await request(app).get(paths.health).set('Origin', process.env.CLIENT_URL!);

      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['access-control-allow-origin']).toBe(process.env.CLIENT_URL);
      expect(res.headers['access-control-allow-credentials']).toBe('true');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('does not allow other origins', async () => {
      const res = await request(app).get(paths.health).set('Origin', 'https://evil.example');

      expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
      expect(res.headers['access-control-allow-origin']).not.toBe('*');
    });
  });

  describe('request id', () => {
    it('echoes a safe caller-supplied X-Request-Id', async () => {
      const res = await request(app).get(paths.health).set('X-Request-Id', clientRequestId);

      expect(res.headers['x-request-id']).toBe(clientRequestId);
    });

    it('replaces an unsafe X-Request-Id', async () => {
      const res = await request(app).get(paths.health).set('X-Request-Id', unsafeRequestId);

      expect(res.headers['x-request-id']).not.toBe(unsafeRequestId);
    });
  });

  it('returns 404 NOT_FOUND in the canonical format for an unknown route', async () => {
    const res = await request(app).get(paths.unknown);

    expectCanonicalError(res, 404, 'NOT_FOUND');
  });

  describe('validate', () => {
    it('passes a valid body through', async () => {
      const res = await request(app).post(testPath(paths.validate)).send(validBody);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ data: validBody });
    });

    it('strips unknown fields', async () => {
      const res = await request(app)
        .post(testPath(paths.validate))
        .send({ ...validBody, extra: 'x' });

      expect(res.body).toEqual({ data: validBody });
    });

    it('returns 400 VALIDATION_ERROR with details', async () => {
      const res = await request(app).post(testPath(paths.validate)).send(invalidBody);

      expectCanonicalError(res, 400, 'VALIDATION_ERROR');
      expect(res.body.error.details).toEqual([{ path: 'title', message: expect.any(String) }]);
    });

    it('returns 400 VALIDATION_ERROR for malformed JSON', async () => {
      const res = await request(app)
        .post(testPath(paths.validate))
        .set('Content-Type', 'application/json')
        .send(malformedJson);

      expectCanonicalError(res, 400, 'VALIDATION_ERROR');
    });
  });

  it('returns 500 INTERNAL_ERROR without a stack trace when an async handler throws', async () => {
    const res = await request(app).get(testPath(paths.throws));

    expectCanonicalError(res, 500, 'INTERNAL_ERROR');
    expect(JSON.stringify(res.body)).not.toContain(internalErrorMessage);
    expect(JSON.stringify(res.body)).not.toMatch(/stack|at .+\(/);
  });
});
