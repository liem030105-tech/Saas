import { screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { apiClient } from '@/api/client';
import { getAccessToken, setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  accessTokenExpiredBody,
  freshAccessToken,
  protectedPath,
  refreshUnauthorizedBody,
  serverErrorBody,
  sessionExpiredMessage,
  staleAccessToken,
} from '@/testing/data/auth';
import { firstWorkspacePage, pageCases } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { loginPathFor, restoreSession } from './session';

const REFRESH_URL = apiUrl('/auth/refresh');

describe('session', () => {
  afterEach(() => setAccessToken(null));

  describe('restoreSession', () => {
    it('restores the access token from the refresh cookie', async () => {
      server.use(
        mswHttp.post(REFRESH_URL, () =>
          HttpResponse.json({ data: { accessToken: freshAccessToken } }),
        ),
      );

      await restoreSession();

      expect(getAccessToken()).toBe(freshAccessToken);
    });

    it('treats a failed refresh as signed out, without throwing', async () => {
      await expect(restoreSession()).resolves.toBeNull();
      expect(getAccessToken()).toBeNull();
    });

    it('throws when the API is down, instead of reporting a signed-out user', async () => {
      server.use(
        mswHttp.post(REFRESH_URL, () => HttpResponse.json(serverErrorBody, { status: 500 })),
      );

      await expect(restoreSession()).rejects.toMatchObject({ status: 500 });
    });

    it('does nothing when a token is already in memory', async () => {
      let calls = 0;
      server.use(
        mswHttp.post(REFRESH_URL, () => {
          calls += 1;
          return HttpResponse.json({ data: { accessToken: freshAccessToken } });
        }),
      );
      setAccessToken(staleAccessToken);

      await restoreSession();

      expect(calls).toBe(0);
    });
  });

  it('on app start (e.g. a reload) refreshes once, before the page renders', async () => {
    let calls = 0;
    server.use(
      mswHttp.post(REFRESH_URL, () => {
        calls += 1;
        return HttpResponse.json({ data: { accessToken: freshAccessToken } });
      }),
    );

    renderApp(pageCases.home.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading }),
    ).toBeInTheDocument();
    expect(getAccessToken()).toBe(freshAccessToken);
    expect(calls).toBe(1);
  });

  it('on app start with the API down, shows the error page with a reload button', async () => {
    server.use(
      mswHttp.post(REFRESH_URL, () => HttpResponse.json(serverErrorBody, { status: 500 })),
    );

    renderApp(pageCases.login.path);

    expect(await screen.findByRole('button', { name: 'Reload' })).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: pageCases.login.heading }),
    ).not.toBeInTheDocument();
  });

  it('when a request cannot refresh, shows "session expired" and goes to /login?redirectTo=…', async () => {
    const { router } = renderApp(`${pageCases.register.path}?from=test`);
    await screen.findByRole('heading', { level: 1, name: pageCases.register.heading });
    setAccessToken(staleAccessToken);
    server.use(
      mswHttp.get(apiUrl(protectedPath), () =>
        HttpResponse.json(accessTokenExpiredBody, { status: 401 }),
      ),
      mswHttp.post(REFRESH_URL, () => HttpResponse.json(refreshUnauthorizedBody, { status: 401 })),
    );

    await apiClient.get(protectedPath).catch(() => undefined);

    expect(await screen.findByText(sessionExpiredMessage)).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));
    expect(new URLSearchParams(router.state.location.search).get('redirectTo')).toBe(
      `${pageCases.register.path}?from=test`,
    );
  });

  it('loginPathFor does not nest redirects when already on /login', () => {
    expect(
      loginPathFor({
        pathname: '/login',
        search: '?redirectTo=%2Fx',
        hash: '',
        state: null,
        key: 'k',
      }),
    ).toBe('/login');
    expect(loginPathFor({ pathname: '/b/1', search: '', hash: '#c', state: null, key: 'k' })).toBe(
      '/login?redirectTo=%2Fb%2F1%23c',
    );
  });
});
