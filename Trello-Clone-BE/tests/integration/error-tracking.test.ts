import * as Sentry from '@sentry/node';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { API_PREFIX } from '../../src/app';
import { prisma } from '../../src/config/prisma';
import { initErrorTracking } from '../../src/lib/error-tracking';
import { sensitiveRequest, testSentryDsn } from '../data/error-tracking';
import { invalidBody, paths } from '../data/http';
import { createTestApp } from '../helpers/test-app';

import type { ErrorEvent, NodeOptions } from '@sentry/node';
import type { Express } from 'express';

type Envelope = Parameters<ReturnType<NonNullable<NodeOptions['transport']>>['send']>[0];

const testPath = (path: string) => `${API_PREFIX}${path}`;

describe('error tracking', () => {
  let app: Express;
  const sent: Envelope[] = [];

  /** The error events Sentry would have sent, once its queue is flushed. */
  async function sentEvents(): Promise<ErrorEvent[]> {
    await Sentry.flush(2000);
    return sent.flatMap(([, items]) =>
      items
        .filter(([header]) => header.type === 'event')
        .map(([, payload]) => payload as ErrorEvent),
    );
  }

  beforeAll(() => {
    initErrorTracking({
      dsn: testSentryDsn,
      transport: () => ({
        send: (envelope) => {
          sent.push(envelope);
          return Promise.resolve({});
        },
        flush: () => Promise.resolve(true),
      }),
    });
    app = createTestApp();
  });

  beforeEach(() => {
    sent.length = 0;
  });

  afterAll(async () => {
    await Sentry.close();
    await prisma.$disconnect();
  });

  it('reports a 5xx with its request id and without headers, cookies or the query', async () => {
    const res = await request(app)
      .get(`${testPath(paths.throws)}${sensitiveRequest.query}`)
      .set('Authorization', sensitiveRequest.authorization)
      .set('Cookie', sensitiveRequest.cookie);

    expect(res.status).toBe(500);
    const events = await sentEvents();
    expect(events).toHaveLength(1);
    const [event] = events;
    expect(event?.tags).toMatchObject({ requestId: res.headers['x-request-id'] });
    expect(event?.request).toEqual({ method: 'GET', url: expect.stringContaining(paths.throws) });
    expect(event?.user).toBeUndefined();
    const serialized = JSON.stringify(event);
    for (const secret of Object.values(sensitiveRequest)) {
      expect(serialized).not.toContain(secret.split('=').at(-1));
    }
  });

  it('does not report client errors (4xx)', async () => {
    await request(app).post(testPath(paths.validate)).send(invalidBody).expect(400);
    await request(app).get(paths.unknown).expect(404);

    expect(await sentEvents()).toEqual([]);
  });
});
