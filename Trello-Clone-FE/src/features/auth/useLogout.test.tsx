import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { getSocketId } from '@/api/socket-id';
import { getAccessToken, setAccessToken } from '@/api/token-store';
import { joinRoom } from '@/lib/socket';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { pageCases, profilePage } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';
import { renderApp } from '@/testing/render';

import { setSignedOutByUser } from './session';
import { LOGOUT_FAILED_MESSAGE } from './useLogout';

import type { QueryClient } from '@tanstack/react-query';

const LOGOUT_URL = apiUrl('/auth/logout');

/** Signed in (session restored on start) on the profile page, with the user loaded. */
async function openProfileSignedIn() {
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
  );
  const rendered = renderApp(profilePage.path);
  await screen.findByRole('button', { name: `Account menu for ${currentUser.name}` });
  return rendered;
}

/** Nothing of the previous user is left in the cache (a still-mounted query may exist, empty). */
function expectNoCachedData(queryClient: QueryClient) {
  for (const query of queryClient.getQueryCache().getAll()) {
    expect(query.state.data, JSON.stringify(query.queryKey)).toBeUndefined();
  }
}

/** Opens the avatar menu with the keyboard (Radix opens on Enter) and picks "Log out". */
async function logOutFromMenu() {
  const trigger = screen.getByRole('button', { name: `Account menu for ${currentUser.name}` });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Log out' }));
}

describe('useLogout (user menu → Log out)', () => {
  afterEach(() => {
    setAccessToken(null);
    setSignedOutByUser(false);
  });

  it('after logout, a protected page sends the next visitor to a plain /login (page not remembered)', async () => {
    server.use(mswHttp.post(LOGOUT_URL, () => new HttpResponse(null, { status: 204 })));
    const { router } = await openProfileSignedIn();
    await logOutFromMenu();
    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));

    await router.navigate(profilePage.path);

    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));
    expect(router.state.location.search).toBe('');
  });

  it('closes the realtime connection', async () => {
    server.use(mswHttp.post(LOGOUT_URL, () => new HttpResponse(null, { status: 204 })));
    const { router } = await openProfileSignedIn();
    joinRoom('board:join', { boardId: 'clx0000000000000000000031' });
    await waitFor(() => expect(getSocketId()).toBe(realtime().id));
    const socket = realtime();

    await logOutFromMenu();

    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));
    expect(socket.connected).toBe(false);
    expect(getSocketId()).toBeNull();
  });

  it('calls the API, goes to /login, and clears the token and the whole query cache', async () => {
    let logoutCalls = 0;
    server.use(
      mswHttp.post(LOGOUT_URL, () => {
        logoutCalls += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { router, queryClient } = await openProfileSignedIn();
    expect(queryClient.getQueryCache().getAll().length).toBeGreaterThan(0);

    await logOutFromMenu();

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.login.heading }),
    ).toBeInTheDocument();
    expect(logoutCalls).toBe(1);
    expect(router.state.location.pathname).toBe(pageCases.login.path);
    expect(router.state.location.search).toBe(''); // a plain /login, no redirectTo back
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expectNoCachedData(queryClient);
  });

  it('signs out locally even when the server cannot be reached', async () => {
    server.use(mswHttp.post(LOGOUT_URL, () => HttpResponse.error()));
    const { router, queryClient } = await openProfileSignedIn();

    await logOutFromMenu();

    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));
    await waitFor(() => expect(getAccessToken()).toBeNull());
    expectNoCachedData(queryClient);
    expect(await screen.findByText(LOGOUT_FAILED_MESSAGE)).toBeInTheDocument();
  });

  it('does not fetch the user again after logout', async () => {
    server.use(mswHttp.post(LOGOUT_URL, () => new HttpResponse(null, { status: 204 })));
    let meCalls = 0;
    const { router } = await openProfileSignedIn();
    server.use(
      mswHttp.get(apiUrl('/auth/me'), () => {
        meCalls += 1;
        return HttpResponse.json({ data: currentUser });
      }),
    );

    await logOutFromMenu();

    await waitFor(() => expect(router.state.location.pathname).toBe(pageCases.login.path));
    expect(meCalls).toBe(0);
  });
});
