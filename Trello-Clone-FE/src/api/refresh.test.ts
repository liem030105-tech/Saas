import { http as mswHttp, HttpResponse } from 'msw';

import { apiUrl, sampleResource } from '@/testing/data/api';
import {
  accessTokenExpiredBody,
  forbiddenBody,
  freshAccessToken,
  protectedPath,
  refreshUnauthorizedBody,
  serverErrorBody,
  staleAccessToken,
  tokenReusedBody,
} from '@/testing/data/auth';
import { server } from '@/testing/mocks/server';

import { ApiError, apiClient, onSessionEnded, type SessionEndReason } from './client';
import { getAccessToken, setAccessToken } from './token-store';

import type { Mock } from 'vitest';

const PROTECTED_URL = apiUrl(protectedPath);
const REFRESH_URL = apiUrl('/auth/refresh');

/** The protected endpoint accepts only the fresh token, like the BE after expiry. */
function protectedEndpoint() {
  const seen: (string | null)[] = [];
  server.use(
    mswHttp.get(PROTECTED_URL, ({ request }) => {
      const auth = request.headers.get('Authorization');
      seen.push(auth);
      return auth === `Bearer ${freshAccessToken}`
        ? HttpResponse.json({ data: sampleResource })
        : HttpResponse.json(accessTokenExpiredBody, { status: 401 });
    }),
  );
  return seen;
}

function refreshEndpoint(respond: () => Response) {
  const calls = { count: 0 };
  server.use(
    mswHttp.post(REFRESH_URL, async () => {
      calls.count += 1;
      await new Promise((resolve) => setTimeout(resolve, 10)); // keep it in flight for a moment
      return respond();
    }),
  );
  return calls;
}

const refreshSucceeds = () => HttpResponse.json({ data: { accessToken: freshAccessToken } });

describe('access token and refresh interceptor', () => {
  let sessionEnded: Mock<(reason: SessionEndReason) => void>;
  let unsubscribe: () => void;

  beforeEach(() => {
    setAccessToken(staleAccessToken);
    sessionEnded = vi.fn<(reason: SessionEndReason) => void>();
    unsubscribe = onSessionEnded(sessionEnded);
  });
  afterEach(() => {
    unsubscribe();
    setAccessToken(null);
  });

  it('sends the access token as a Bearer header', async () => {
    setAccessToken(freshAccessToken);
    const seen = protectedEndpoint();

    await apiClient.get(protectedPath);

    expect(seen).toEqual([`Bearer ${freshAccessToken}`]);
  });

  it('on 401 UNAUTHORIZED refreshes once and retries the request with the new token', async () => {
    const seen = protectedEndpoint();
    const refresh = refreshEndpoint(refreshSucceeds);

    await expect(apiClient.get(protectedPath)).resolves.toEqual(sampleResource);

    expect(refresh.count).toBe(1);
    expect(seen).toEqual([`Bearer ${staleAccessToken}`, `Bearer ${freshAccessToken}`]);
    expect(getAccessToken()).toBe(freshAccessToken);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it('two concurrent 401s trigger exactly one refresh, and both requests succeed', async () => {
    protectedEndpoint();
    const refresh = refreshEndpoint(refreshSucceeds);

    const results = await Promise.all([apiClient.get(protectedPath), apiClient.get(protectedPath)]);

    expect(results).toEqual([sampleResource, sampleResource]);
    expect(refresh.count).toBe(1);
  });

  it('a 401 for a token another request already replaced retries with the new token, without refreshing', async () => {
    const seen: (string | null)[] = [];
    server.use(
      mswHttp.get(PROTECTED_URL, ({ request }) => {
        const auth = request.headers.get('Authorization');
        seen.push(auth);
        if (auth === `Bearer ${freshAccessToken}`)
          return HttpResponse.json({ data: sampleResource });
        // A concurrent refresh finished while this request was in flight.
        setAccessToken(freshAccessToken);
        return HttpResponse.json(accessTokenExpiredBody, { status: 401 });
      }),
    );
    const refresh = refreshEndpoint(refreshSucceeds);

    await expect(apiClient.get(protectedPath)).resolves.toEqual(sampleResource);

    expect(refresh.count).toBe(0);
    expect(seen).toEqual([`Bearer ${staleAccessToken}`, `Bearer ${freshAccessToken}`]);
  });

  it('retries only once: a second 401 after the refresh is returned as is', async () => {
    server.use(
      mswHttp.get(PROTECTED_URL, () => HttpResponse.json(accessTokenExpiredBody, { status: 401 })),
    );
    const refresh = refreshEndpoint(refreshSucceeds);

    const error: unknown = await apiClient.get(protectedPath).catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(refresh.count).toBe(1);
    expect(sessionEnded).not.toHaveBeenCalled();
  });

  it('a failed refresh clears the token, ends the session (expired) and rejects the request', async () => {
    protectedEndpoint();
    refreshEndpoint(() => HttpResponse.json(refreshUnauthorizedBody, { status: 401 }));

    const error: unknown = await apiClient.get(protectedPath).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHORIZED' });
    expect(getAccessToken()).toBeNull();
    expect(sessionEnded).toHaveBeenCalledWith('expired');
  });

  it.each([
    ['a 5xx', () => HttpResponse.json(serverErrorBody, { status: 500 })],
    ['a network error', () => HttpResponse.error()],
  ])(
    '%s from the refresh keeps the session and rejects with that error',
    async (_case, respond) => {
      protectedEndpoint();
      refreshEndpoint(respond);

      const error: unknown = await apiClient.get(protectedPath).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).not.toBe(401);
      expect(getAccessToken()).toBe(staleAccessToken);
      expect(sessionEnded).not.toHaveBeenCalled();
    },
  );

  it('TOKEN_REUSED from the refresh ends the session as reused', async () => {
    protectedEndpoint();
    refreshEndpoint(() => HttpResponse.json(tokenReusedBody, { status: 401 }));

    await apiClient.get(protectedPath).catch(() => undefined);

    expect(sessionEnded).toHaveBeenCalledWith('reused');
    expect(getAccessToken()).toBeNull();
  });

  it('never refreshes for the session endpoints themselves (e.g. a failed login)', async () => {
    const refresh = refreshEndpoint(refreshSucceeds);
    server.use(
      mswHttp.post(apiUrl('/auth/login'), () =>
        HttpResponse.json(accessTokenExpiredBody, { status: 401 }),
      ),
    );

    await apiClient.post('/auth/login', {}).catch(() => undefined);

    expect(refresh.count).toBe(0);
  });

  it('does not refresh for other errors (403)', async () => {
    const refresh = refreshEndpoint(refreshSucceeds);
    server.use(mswHttp.get(PROTECTED_URL, () => HttpResponse.json(forbiddenBody, { status: 403 })));

    await apiClient.get(protectedPath).catch(() => undefined);

    expect(refresh.count).toBe(0);
  });
});
