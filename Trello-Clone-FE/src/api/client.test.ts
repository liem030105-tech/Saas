import { http as mswHttp, HttpResponse } from 'msw';

import { apiUrl, buildErrorBody, nonCanonicalErrorBody, sampleResource } from '@/testing/data/api';
import { testEnv } from '@/testing/data/env';
import { server } from '@/testing/mocks/server';

import { ApiError, apiClient, http, NETWORK_ERROR_CODE } from './client';

describe('apiClient', () => {
  it('targets VITE_API_URL and sends cookies', () => {
    expect(http.defaults.baseURL).toBe(testEnv.VITE_API_URL);
    expect(http.defaults.withCredentials).toBe(true);
  });

  it('unwraps the { data } envelope', async () => {
    server.use(mswHttp.get(apiUrl('/things/1'), () => HttpResponse.json({ data: sampleResource })));

    await expect(apiClient.get('/things/1')).resolves.toEqual(sampleResource);
  });

  it('keeps nextCursor next to the data of a paginated list', async () => {
    server.use(
      mswHttp.get(apiUrl('/things'), ({ request }) =>
        HttpResponse.json({
          data: [sampleResource],
          nextCursor: new URL(request.url).searchParams.get('cursor') ? null : sampleResource.id,
        }),
      ),
    );

    await expect(apiClient.getPage('/things')).resolves.toEqual({
      data: [sampleResource],
      nextCursor: sampleResource.id,
    });
    await expect(
      apiClient.getPage('/things', { params: { cursor: sampleResource.id } }),
    ).resolves.toEqual({ data: [sampleResource], nextCursor: null });
  });

  it('sends the JSON body', async () => {
    let received: unknown;
    server.use(
      mswHttp.post(apiUrl('/things'), async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({ data: sampleResource }, { status: 201 });
      }),
    );

    await apiClient.post('/things', { title: sampleResource.title });

    expect(received).toEqual({ title: sampleResource.title });
  });

  it('resolves to undefined for 204 No Content', async () => {
    server.use(mswHttp.delete(apiUrl('/things/1'), () => new HttpResponse(null, { status: 204 })));

    await expect(apiClient.delete('/things/1')).resolves.toBeUndefined();
  });

  it('converts the canonical error into an ApiError', async () => {
    const body = buildErrorBody();
    server.use(mswHttp.get(apiUrl('/things/1'), () => HttpResponse.json(body, { status: 400 })));

    const error: unknown = await apiClient.get('/things/1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 400,
      code: body.error.code,
      message: body.error.message,
      details: body.error.details,
      requestId: body.error.requestId,
    });
  });

  it('maps a non-canonical failure to a network ApiError', async () => {
    server.use(mswHttp.get(apiUrl('/things/1'), () => HttpResponse.error()));

    await expect(apiClient.get('/things/1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      code: NETWORK_ERROR_CODE,
    });
  });

  it('keeps the status but not the body when an error response is not canonical', async () => {
    server.use(
      mswHttp.get(apiUrl('/things/1'), () =>
        HttpResponse.json(nonCanonicalErrorBody, { status: 502 }),
      ),
    );

    await expect(apiClient.get('/things/1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 502,
      code: NETWORK_ERROR_CODE,
      details: [],
    });
  });
});
