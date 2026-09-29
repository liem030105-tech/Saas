import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken, loginFormInput, loginResponse } from '@/testing/data/auth';
import { pageCases, profilePage } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

const signedInSession = () =>
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
  );

describe('ProtectedRoute', () => {
  afterEach(() => setAccessToken(null));

  it('sends a signed-out visitor to /login?redirectTo=<page>, and back there after login', async () => {
    const { router } = renderApp(profilePage.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.login.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(pageCases.login.path);
    expect(new URLSearchParams(router.state.location.search).get('redirectTo')).toBe(
      profilePage.path,
    );

    server.use(
      mswHttp.post(apiUrl('/auth/login'), () => HttpResponse.json({ data: loginResponse })),
      mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: loginResponse.user })),
    );
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: loginFormInput.email } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: loginFormInput.password },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: profilePage.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(profilePage.path);
  });

  it('renders the page inside the app shell once the session is restored (e.g. after a reload)', async () => {
    signedInSession();

    renderApp(profilePage.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: profilePage.heading }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: `Account menu for ${currentUser.name}` }),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(currentUser.name));
  });
});
