import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { pageCases } from '@/testing/data/routes';
import {
  acmeAs,
  acmeWorkspace,
  alreadyMemberError,
  betaWorkspace,
  createdInvite,
  inviteNotFoundError,
  invitePathFor,
  inviteToken,
  membersWith,
  newInvite,
  pendingInvite,
  workspaceMembersPathFor,
  workspacePathFor,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { ALREADY_MEMBER_MESSAGE, INVITE_INVALID_MESSAGE } from './components/AcceptInvite';
import { LINK_COPIED_MESSAGE } from './components/InviteDialog';

import type { Role, WorkspaceDto } from '@trello-clone/shared';

const INVITES_URL = apiUrl(`/workspaces/${acmeWorkspace.id}/invites`);
const ACCEPT_URL = apiUrl('/invites/accept');

/** Signed in with `workspaces`; invite requests on acmeWorkspace are recorded. */
function signedIn(workspaces: WorkspaceDto[], role: Role = 'OWNER') {
  const state = {
    workspaces: [...workspaces],
    invites: [pendingInvite],
    created: [] as unknown[],
    revoked: [] as string[],
    accepted: [] as unknown[],
    inviteLists: 0,
  };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: state.workspaces })),
    mswHttp.get(apiUrl(`/workspaces/${acmeWorkspace.id}/members`), () =>
      HttpResponse.json({ data: membersWith(role) }),
    ),
    mswHttp.get(INVITES_URL, () => {
      state.inviteLists += 1;
      return HttpResponse.json({ data: state.invites });
    }),
    mswHttp.post(INVITES_URL, async ({ request }) => {
      state.created.push(await request.json());
      state.invites = [createdInvite, ...state.invites];
      return HttpResponse.json({ data: createdInvite }, { status: 201 });
    }),
    mswHttp.delete(`${INVITES_URL}/:inviteId`, ({ params }) => {
      const inviteId = params.inviteId as string;
      state.revoked.push(inviteId);
      state.invites = state.invites.filter((invite) => invite.id !== inviteId);
      return new HttpResponse(null, { status: 204 });
    }),
    mswHttp.post(ACCEPT_URL, async ({ request }) => {
      state.accepted.push(await request.json());
      state.workspaces = [...state.workspaces, acmeAs('MEMBER')];
      return HttpResponse.json({ data: acmeAs('MEMBER') });
    }),
  );
  return state;
}

async function openMembers(role: Role) {
  const state = signedIn([acmeAs(role)], role);
  const rendered = renderApp(workspaceMembersPathFor(acmeWorkspace));
  await screen.findByRole('heading', { level: 1, name: 'Members' });
  await screen.findByRole('list', { name: 'Members' });
  return { ...rendered, state };
}

describe('invitations', () => {
  afterEach(() => setAccessToken(null));

  it.each(['OWNER', 'ADMIN'] as const)(
    'a %s sees "Invite people" and pending invites',
    async (role) => {
      await openMembers(role);

      expect(screen.getByRole('button', { name: 'Invite people' })).toBeInTheDocument();
      const list = await screen.findByRole('list', { name: 'Pending invites' });
      expect(within(list).getByText(pendingInvite.email)).toBeInTheDocument();
    },
  );

  it.each(['MEMBER', 'VIEWER'] as const)(
    'a %s sees no invites and never loads them',
    async (role) => {
      const { state } = await openMembers(role);

      expect(screen.queryByRole('button', { name: 'Invite people' })).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Pending invites' })).not.toBeInTheDocument();
      expect(state.inviteLists).toBe(0);
    },
  );

  it('creating an invite sends the email and role, then shows the link to copy', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { state } = await openMembers('OWNER');

    fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: newInvite.typed.email },
    });
    fireEvent.keyDown(within(dialog).getByRole('button', { name: /^Role/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: newInvite.typed.role }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    const link = await within(dialog).findByLabelText(/^Invite link for/);
    expect(link).toHaveValue(createdInvite.inviteUrl);
    expect(state.created).toEqual([newInvite.sent]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(createdInvite.inviteUrl));
    expect(await screen.findByText(LINK_COPIED_MESSAGE)).toBeInTheDocument();
  });

  it('shows the server message under the email when it is already a member (409)', async () => {
    await openMembers('OWNER');
    server.use(
      mswHttp.post(INVITES_URL, () => HttpResponse.json(alreadyMemberError, { status: 409 })),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Invite people' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: newInvite.sent.email },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    expect(await within(dialog).findByText(alreadyMemberError.error.message)).toBeInTheDocument();
  });

  it('revoking an invite asks first, then drops it', async () => {
    const { state } = await openMembers('ADMIN');

    fireEvent.click(
      await screen.findByRole('button', { name: `Revoke invite for ${pendingInvite.email}` }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => expect(screen.queryByText(pendingInvite.email)).toBeNull());
    expect(state.revoked).toEqual([pendingInvite.id]);
    expect(screen.getByText('No pending invites.')).toBeInTheDocument();
  });

  it('opening an invite link accepts it once and opens the workspace', async () => {
    const state = signedIn([betaWorkspace]);

    const { router } = renderApp(invitePathFor(inviteToken));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace)),
    );
    expect(state.accepted).toEqual([{ token: inviteToken }]);
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    expect(await within(nav).findByRole('link', { name: acmeWorkspace.name })).toBeInTheDocument();
  });

  it('an invalid or expired link says so', async () => {
    signedIn([betaWorkspace]);
    server.use(
      mswHttp.post(ACCEPT_URL, () => HttpResponse.json(inviteNotFoundError, { status: 404 })),
    );

    renderApp(invitePathFor(inviteToken));

    expect(await screen.findByRole('alert')).toHaveTextContent(INVITE_INVALID_MESSAGE);
  });

  it('an existing member is told so', async () => {
    signedIn([acmeAs('MEMBER')]);
    server.use(
      mswHttp.post(ACCEPT_URL, () => HttpResponse.json(alreadyMemberError, { status: 409 })),
    );

    renderApp(invitePathFor(inviteToken));

    expect(await screen.findByRole('alert')).toHaveTextContent(ALREADY_MEMBER_MESSAGE);
  });

  it('a signed-out visitor logs in first, and "Sign up" keeps the invite as redirectTo', async () => {
    const { router } = renderApp(invitePathFor(inviteToken));

    await screen.findByRole('heading', { level: 1, name: pageCases.login.heading });
    const redirect = `?redirectTo=${encodeURIComponent(invitePathFor(inviteToken))}`;
    expect(router.state.location.search).toBe(redirect);
    expect(screen.getByRole('link', { name: 'Sign up' })).toHaveAttribute(
      'href',
      `${pageCases.register.path}${redirect}`,
    );
  });
});
