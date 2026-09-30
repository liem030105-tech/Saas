import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { firstWorkspacePage } from '@/testing/data/routes';
import {
  acmeAs,
  acmeWorkspace,
  betaWorkspace,
  slugTakenError,
  workspacePathFor,
  workspaceRename,
  workspaceSettingsPathFor,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { SLUG_TAKEN_MESSAGE } from './components/WorkspaceDetailsForm';
import { READ_ONLY_SETTINGS_MESSAGE } from './components/WorkspaceSettings';
import { workspaceKeys } from './queries';

import type { WorkspaceDto } from '@trello-clone/shared';

const WORKSPACES_URL = apiUrl('/workspaces');
const ACME_URL = apiUrl(`/workspaces/${acmeWorkspace.id}`);
const SETTINGS_HEADING = 'Workspace settings';

/** Signed in with `workspaces`; PATCH and DELETE on acmeWorkspace are recorded. */
function signedInWith(workspaces: WorkspaceDto[]) {
  const state = { list: [...workspaces], patches: [] as unknown[], deletes: 0 };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(WORKSPACES_URL, () => HttpResponse.json({ data: state.list })),
    mswHttp.patch(ACME_URL, async ({ request }) => {
      state.patches.push(await request.json());
      state.list = state.list.map((w) => (w.id === acmeWorkspace.id ? workspaceRename.renamed : w));
      return HttpResponse.json({ data: workspaceRename.renamed });
    }),
    mswHttp.delete(ACME_URL, () => {
      state.deletes += 1;
      state.list = state.list.filter((w) => w.id !== acmeWorkspace.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openSettings(workspaces: WorkspaceDto[]) {
  const state = signedInWith(workspaces);
  const rendered = renderApp(workspaceSettingsPathFor(acmeWorkspace));
  await screen.findByRole('heading', { level: 1, name: SETTINGS_HEADING });
  return { ...rendered, state };
}

const deleteButton = () => screen.queryByRole('button', { name: 'Delete workspace' });

describe('workspace settings (/w/:slug/settings)', () => {
  afterEach(() => setAccessToken(null));

  it('the workspace page links to its settings', async () => {
    signedInWith([acmeWorkspace]);
    const { router } = renderApp(workspacePathFor(acmeWorkspace));

    fireEvent.click(await screen.findByRole('link', { name: 'Settings' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspaceSettingsPathFor(acmeWorkspace)),
    );
  });

  it('an OWNER can edit the details and delete the workspace', async () => {
    await openSettings([acmeWorkspace]);

    expect(screen.getByLabelText('Name')).toHaveValue(acmeWorkspace.name);
    expect(screen.getByLabelText('URL')).toHaveValue(acmeWorkspace.slug);
    expect(deleteButton()).toBeInTheDocument();
  });

  it('an ADMIN can edit the details but not delete', async () => {
    await openSettings([acmeAs('ADMIN')]);

    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it.each(['MEMBER', 'VIEWER'] as const)('a %s sees the settings read-only', async (role) => {
    await openSettings([acmeAs(role)]);

    expect(screen.getByText(READ_ONLY_SETTINGS_MESSAGE)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it('renaming and changing the URL saves both and moves to the new URL', async () => {
    const { router, state } = await openSettings([acmeWorkspace]);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: workspaceRename.typed.name },
    });
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: workspaceRename.typed.slug },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        workspaceSettingsPathFor(workspaceRename.renamed),
      ),
    );
    expect(state.patches).toEqual([workspaceRename.sent]);
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    expect(
      await within(nav).findByRole('link', { name: workspaceRename.renamed.name }),
    ).toBeInTheDocument();
    expect(await screen.findByLabelText('Name')).toHaveValue(workspaceRename.renamed.name);
  });

  it('sends only the changed field', async () => {
    const { state } = await openSettings([acmeWorkspace]);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: workspaceRename.typed.name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(state.patches).toEqual([{ name: workspaceRename.sent.name }]));
  });

  it('shows a field error when the URL is taken (409)', async () => {
    await openSettings([acmeWorkspace]);
    server.use(mswHttp.patch(ACME_URL, () => HttpResponse.json(slugTakenError, { status: 409 })));

    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: workspaceRename.typed.slug },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText(SLUG_TAKEN_MESSAGE)).toBeInTheDocument();
  });

  it('deleting needs the exact name, then opens the next workspace', async () => {
    const { router, state } = await openSettings([acmeWorkspace, betaWorkspace]);

    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Delete workspace' });
    expect(confirm).toBeDisabled();
    const input = within(dialog).getByLabelText(`Type ${acmeWorkspace.name} to confirm`);
    fireEvent.change(input, { target: { value: acmeWorkspace.name.toLowerCase() } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: acmeWorkspace.name } });
    fireEvent.click(confirm);

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(betaWorkspace)),
    );
    expect(state.deletes).toBe(1);
  });

  it('deleting the last workspace shows "Create your first workspace"', async () => {
    await openSettings([acmeWorkspace]);

    fireEvent.click(deleteButton()!);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(`Type ${acmeWorkspace.name} to confirm`), {
      target: { value: acmeWorkspace.name },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading }),
    ).toBeInTheDocument();
  });

  it('follows a URL change made in another tab', async () => {
    const { router, queryClient, state } = await openSettings([acmeWorkspace]);

    state.list = [workspaceRename.renamed];
    await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(
        workspaceSettingsPathFor(workspaceRename.renamed),
      ),
    );
  });

  it('goes to / when the workspace was deleted in another tab', async () => {
    const { router, queryClient, state } = await openSettings([acmeWorkspace, betaWorkspace]);

    state.list = [betaWorkspace];
    await queryClient.invalidateQueries({ queryKey: workspaceKeys.all });

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(betaWorkspace)),
    );
  });
});
