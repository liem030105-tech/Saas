import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { getAccessToken, setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  emailTakenBody,
  genericRegisterError,
  invalidRegisterForm,
  proxyErrorPage,
  registerFormInput,
  registerResponse,
  safeRedirect,
} from '@/testing/data/auth';
import { firstWorkspacePage, pageCases } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

const REGISTER_URL = apiUrl('/auth/register');

const SUBMIT = 'Create account';

async function fillAndSubmit(values: { name: string; email: string; password: string }) {
  // The page renders once the root loader has tried to restore the session.
  await screen.findByRole('button', { name: SUBMIT });
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: values.email } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: values.password } });
  fireEvent.click(screen.getByRole('button', { name: SUBMIT }));
}

describe('RegisterForm', () => {
  afterEach(() => setAccessToken(null));

  it('shows a message under each invalid field and sends nothing', async () => {
    let requests = 0;
    server.use(
      mswHttp.post(REGISTER_URL, () => {
        requests += 1;
        return HttpResponse.json({ data: registerResponse }, { status: 201 });
      }),
    );
    renderApp(pageCases.register.path);

    await fillAndSubmit(invalidRegisterForm.input);

    for (const message of Object.values(invalidRegisterForm.messages)) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(requests).toBe(0);
  });

  it('shows the server message when the email is already registered (409)', async () => {
    server.use(
      mswHttp.post(REGISTER_URL, () => HttpResponse.json(emailTakenBody, { status: 409 })),
    );
    renderApp(pageCases.register.path);

    await fillAndSubmit(registerFormInput);

    expect(await screen.findByRole('alert')).toHaveTextContent(emailTakenBody.error.message);
    expect(screen.getByRole('heading', { name: pageCases.register.heading })).toBeInTheDocument();
    expect(getAccessToken()).toBeNull();
  });

  it('shows the generic message, not technical text, when the response has no API error body', async () => {
    server.use(
      mswHttp.post(REGISTER_URL, () =>
        HttpResponse.html(proxyErrorPage.html, { status: proxyErrorPage.status }),
      ),
    );
    renderApp(pageCases.register.path);

    await fillAndSubmit(registerFormInput);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(genericRegisterError);
    expect(alert).not.toHaveTextContent(String(proxyErrorPage.status));
  });

  it('signs in on success: keeps the access token in memory and goes to /', async () => {
    let sentBody: unknown;
    server.use(
      mswHttp.post(REGISTER_URL, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ data: registerResponse }, { status: 201 });
      }),
    );
    renderApp(pageCases.register.path);

    await fillAndSubmit(registerFormInput);

    expect(
      await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading }),
    ).toBeInTheDocument();
    expect(sentBody).toEqual(registerFormInput);
    await waitFor(() => expect(getAccessToken()).toBe(registerResponse.accessToken));
  });

  it('after signing up, returns to a safe redirectTo (e.g. an invite link)', async () => {
    server.use(
      mswHttp.post(REGISTER_URL, () =>
        HttpResponse.json({ data: registerResponse }, { status: 201 }),
      ),
    );
    const { router } = renderApp(
      `${pageCases.register.path}?redirectTo=${encodeURIComponent(safeRedirect.redirectTo)}`,
    );

    await fillAndSubmit(registerFormInput);

    await waitFor(() => expect(router.state.location.pathname).toBe(safeRedirect.path));
  });
});
