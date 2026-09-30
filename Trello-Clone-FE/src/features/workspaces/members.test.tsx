import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import {
  acmeAs,
  acmeWorkspace,
  betaWorkspace,
  lastOwnerError,
  membersWith,
  ownerMember,
  plainMember,
  workspaceMembersPathFor,
  workspacePathFor,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { LAST_OWNER_MESSAGE } from './memberErrors';

import type { MemberDto, Role, WorkspaceDto } from '@trello-clone/shared';

const MEMBERS_URL = apiUrl(`/workspaces/${acmeWorkspace.id}/members`);
const memberUrl = (userId: string) => `${MEMBERS_URL}/${userId}`;

/** Signed in as `role` in acmeWorkspace (plus `others`); PATCH and DELETE are recorded. */
function signedInAs(role: Role, others: WorkspaceDto[] = []) {
  const state = {
    workspaces: [acmeAs(role), ...others],
    members: membersWith(role),
    patches: [] as { userId: string; body: unknown }[],
    deletes: [] as string[],
  };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: state.workspaces })),
    mswHttp.get(MEMBERS_URL, () => HttpResponse.json({ data: state.members })),
    mswHttp.patch(`${MEMBERS_URL}/:userId`, async ({ params, request }) => {
      const body = (await request.json()) as { role: Role };
      const userId = params.userId as string;
      state.patches.push({ userId, body });
      state.members = state.members.map((m) =>
        m.user.id === userId ? { ...m, role: body.role } : m,
      );
      return HttpResponse.json({ data: state.members.find((m) => m.user.id === userId) });
    }),
    mswHttp.delete(`${MEMBERS_URL}/:userId`, ({ params }) => {
      const userId = params.userId as string;
      state.deletes.push(userId);
      state.members = state.members.filter((m) => m.user.id !== userId);
      if (userId === currentUser.id) {
        state.workspaces = state.workspaces.filter((w) => w.id !== acmeWorkspace.id);
      }
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openMembers(role: Role, others: WorkspaceDto[] = []) {
  const state = signedInAs(role, others);
  const rendered = renderApp(workspaceMembersPathFor(acmeWorkspace));
  await screen.findByRole('heading', { level: 1, name: 'Members' });
  await screen.findByText(plainMember.user.email);
  return { ...rendered, state };
}

const rowOf = (member: MemberDto) =>
  screen.getByText(member.user.email).closest('li') as HTMLElement;
const roleSelect = (member: MemberDto) =>
  screen.queryByRole('combobox', { name: `Role for ${member.user.name}` });
const removeButton = (member: MemberDto) =>
  screen.queryByRole('button', { name: `Remove ${member.user.name}` });

async function confirmIn(buttonName: string) {
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: buttonName }));
  return dialog;
}

describe('workspace members (/w/:slug/members)', () => {
  afterEach(() => setAccessToken(null));

  it('the workspace page links to its members', async () => {
    signedInAs('OWNER');
    const { router } = renderApp(workspacePathFor(acmeWorkspace));

    fireEvent.click(await screen.findByRole('link', { name: 'Members' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspaceMembersPathFor(acmeWorkspace)),
    );
  });

  it('lists every member with name, email, and role; the caller is marked', async () => {
    await openMembers('MEMBER');

    const list = screen.getByRole('list', { name: 'Members' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(rowOf(ownerMember)).getByText('Owner')).toBeInTheDocument();
    expect(screen.getByText('(you)')).toBeInTheDocument();
  });

  it('an OWNER manages everyone else and may grant Owner', async () => {
    await openMembers('OWNER');

    for (const member of [ownerMember, plainMember]) {
      expect(roleSelect(member)).toBeInTheDocument();
      expect(removeButton(member)).toBeInTheDocument();
    }
    const options = within(roleSelect(plainMember)!).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Owner', 'Admin', 'Member', 'Viewer']);
    expect(screen.queryByRole('combobox', { name: `Role for ${currentUser.name}` })).toBeNull();
  });

  it('an ADMIN cannot touch an OWNER and cannot grant Owner', async () => {
    await openMembers('ADMIN');

    expect(roleSelect(ownerMember)).not.toBeInTheDocument();
    expect(removeButton(ownerMember)).not.toBeInTheDocument();
    const options = within(roleSelect(plainMember)!).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Admin', 'Member', 'Viewer']);
  });

  it.each(['MEMBER', 'VIEWER'] as const)('a %s sees the list read-only', async (role) => {
    await openMembers(role);

    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(removeButton(plainMember)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Leave workspace' })).toBeInTheDocument();
  });

  it('changing a role sends it and updates the row', async () => {
    const { state } = await openMembers('OWNER');

    fireEvent.change(roleSelect(plainMember)!, { target: { value: 'ADMIN' } });

    await waitFor(() =>
      expect(state.patches).toEqual([{ userId: plainMember.user.id, body: { role: 'ADMIN' } }]),
    );
    await waitFor(() => expect(roleSelect(plainMember)).toHaveValue('ADMIN'));
  });

  it('removing a member asks first, then drops the row', async () => {
    const { state } = await openMembers('OWNER');

    fireEvent.click(removeButton(plainMember)!);
    await confirmIn('Remove');

    await waitFor(() => expect(screen.queryByText(plainMember.user.email)).toBeNull());
    expect(state.deletes).toEqual([plainMember.user.id]);
  });

  it('leaving asks first, then opens the next workspace', async () => {
    const { router, state } = await openMembers('MEMBER', [betaWorkspace]);

    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    await confirmIn('Leave workspace');

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(betaWorkspace)),
    );
    expect(state.deletes).toEqual([currentUser.id]);
  });

  it('the last OWNER is told why they cannot leave', async () => {
    const { router } = await openMembers('OWNER');
    server.use(
      mswHttp.delete(memberUrl(currentUser.id), () =>
        HttpResponse.json(lastOwnerError, { status: 422 }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Leave workspace' }));
    const dialog = await confirmIn('Leave workspace');

    expect(await within(dialog).findByText(LAST_OWNER_MESSAGE)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(workspaceMembersPathFor(acmeWorkspace));
  });
});
