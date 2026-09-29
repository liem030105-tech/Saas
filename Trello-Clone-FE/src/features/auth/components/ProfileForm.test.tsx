import { fireEvent, screen, waitFor } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  currentUser,
  freshAccessToken,
  genericProfileError,
  invalidProfileForm,
  profileEdit,
  serverErrorBody,
} from '@/testing/data/auth';
import { profilePage } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { PROFILE_SAVED_MESSAGE } from './ProfileForm';

import type { UserDto } from '@trello-clone/shared';

const USERS_ME_URL = apiUrl('/users/me');

/** Signed in (session restored on start) as `user`, on the profile page. */
async function openProfile(user: UserDto = currentUser) {
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: user })),
  );
  renderApp(profilePage.path);
  await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(user.name));
}

function fillAndSave(values: { name: string; avatarUrl: string }) {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: values.name } });
  fireEvent.change(screen.getByLabelText('Avatar URL'), { target: { value: values.avatarUrl } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
}

describe('ProfileForm', () => {
  afterEach(() => setAccessToken(null));

  it('shows the email read-only and disables saving until something changes', async () => {
    await openProfile();

    expect(screen.getByLabelText('Email')).toHaveValue(currentUser.email);
    expect(screen.getByLabelText('Email')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('shows a message under each invalid field and sends nothing', async () => {
    let requests = 0;
    server.use(
      mswHttp.patch(USERS_ME_URL, () => {
        requests += 1;
        return HttpResponse.json({ data: currentUser });
      }),
    );
    await openProfile();

    fillAndSave(invalidProfileForm.input);

    for (const message of Object.values(invalidProfileForm.messages)) {
      expect(await screen.findByText(message)).toBeInTheDocument();
    }
    expect(requests).toBe(0);
  });

  it('saves: sends the trimmed values, confirms, and updates the header', async () => {
    let sentBody: unknown;
    server.use(
      mswHttp.patch(USERS_ME_URL, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ data: { ...currentUser, ...profileEdit.sent } });
      }),
    );
    await openProfile();

    fillAndSave(profileEdit.typed);

    expect(await screen.findByText(PROFILE_SAVED_MESSAGE)).toBeInTheDocument();
    expect(sentBody).toEqual(profileEdit.sent);
    expect(
      screen.getByRole('button', { name: `Account menu for ${profileEdit.sent.name}` }),
    ).toBeInTheDocument();
  });

  it('sends null when the avatar URL is cleared', async () => {
    let sentBody: unknown;
    server.use(
      mswHttp.patch(USERS_ME_URL, async ({ request }) => {
        sentBody = await request.json();
        return HttpResponse.json({ data: currentUser });
      }),
    );
    await openProfile({ ...currentUser, avatarUrl: profileEdit.sent.avatarUrl });

    fillAndSave({ name: currentUser.name, avatarUrl: '' });

    await waitFor(() => expect(sentBody).toEqual({ name: currentUser.name, avatarUrl: null }));
  });

  it('shows the generic message when saving fails without an API error body', async () => {
    server.use(mswHttp.patch(USERS_ME_URL, () => HttpResponse.error()));
    await openProfile();

    fillAndSave(profileEdit.typed);

    expect(await screen.findByRole('alert')).toHaveTextContent(genericProfileError);
  });

  it('shows the server message for other API errors', async () => {
    server.use(
      mswHttp.patch(USERS_ME_URL, () => HttpResponse.json(serverErrorBody, { status: 500 })),
    );
    await openProfile();

    fillAndSave(profileEdit.typed);

    expect(await screen.findByRole('alert')).toHaveTextContent(serverErrorBody.error.message);
  });
});
