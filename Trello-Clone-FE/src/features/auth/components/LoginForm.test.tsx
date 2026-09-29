import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { getAccessToken, setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  genericLoginError,
  invalidCredentialsBody,
  invalidLoginForm,
  loginFormInput,
  loginResponse,
  proxyErrorPage,
  safeRedirect,
  unsafeRedirects,
} from '@/testing/data/auth';
import { pageCases } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

const LOGIN_URL = apiUrl('/auth/login');

const SUBMIT = 'Log in';

async function fillAndSubmit(values: { email: string; password: string }) {
  // The page renders once the root loader has tried to restore the session.
  await screen.findByRole('button', { name: SUBMIT });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } });
  fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
}

const loginSucceeds = () =>
  server.use(mswHttp.post(LOGIN_URL, () => HttpResponse.json({ data: loginResponse })));

const withRedirect = (redirectTo: string) =>
  `${pageCases.login.path}?redirectTo=${encodeURIComponent(redirectTo)}`;

describe('LoginForm', () => {
  afterEach(() => setAccessToken(null));

  it('shows a message under each invalid field and sends nothing', async () => {
    let requests = 0;
    server.use(
      mswHttp.post(LOGIN_URL, () => {
        requests += 1;
        return HttpResponse.json({ data: loginResponse });
      }),
    );
    renderApp(pageCases.login.path);

    await fillAndSubmit(invalidLoginForm.input);

    for (const message of Object.values(invalidLoginForm.messages)) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(requests).toBe(0);
  });

  it('shows the server message above the button for invalid credentials (401)', async () => {
    server.use(
      mswHttp.post(LOGIN_URL, () => HttpResponse.json(invalidCredentialsBody, { status: 401 })),
    );
    renderApp(pageCases.login.path);

    await fillAndSubmit(loginFormInput);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      invalidCredentialsBody.error.message,
    );
    expect(screen.getByRole('heading', { name: pageCases.login.heading })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('shows the generic message when the response has no API error body', async () => {
    server.use(
      mswHttp.post(LOGIN_URL, () =>
        HttpResponse.html(proxyErrorPage.html, { status: proxyErrorPage.status }),
      ),
    );
    renderApp(pageCases.login.path);

    await fillAndSubmit(loginFormInput);

    expect(await screen.findByRole('alert')).toHaveTextContent(genericLoginError);
  });

  it('signs in: keeps the access token in memory and goes to /', async () => {
    let sentBody: unknown;
    server.use(
      mswHttp.post(LOGIN_URL, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ data: loginResponse });
      }),
    );
    renderApp(pageCases.login.path);

    await fillAndSubmit(loginFormInput);

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.home.heading }),
    ).toBeInTheDocument();
    expect(sentBody).toEqual(loginFormInput);
    await waitFor(() => expect(getAccessToken()).toBe(loginResponse.accessToken));
  });

  it('goes to a safe redirectTo after signing in', async () => {
    loginSucceeds();
    const { router } = renderApp(withRedirect(safeRedirect.redirectTo));

    await fillAndSubmit(loginFormInput);

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.register.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(safeRedirect.path);
  });

  it.each(unsafeRedirects)('ignores the unsafe redirectTo %j and goes to /', async (redirectTo) => {
    loginSucceeds();
    const { router } = renderApp(withRedirect(redirectTo));

    await fillAndSubmit(loginFormInput);

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.home.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});
