import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { firstWorkspacePage, notFoundCase, pageCases } from '@/testing/data/routes';
import {
  acmeWorkspace,
  betaWorkspace,
  blankNameMessage,
  newWorkspaceInput,
  unknownWorkspaceSlug,
  workspacePathFor,
  workspaceServerError,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { WorkspaceDto } from '@trello-clone/shared';

const WORKSPACES_URL = apiUrl('/workspaces');

/** Signed in (session restored on start) with `workspaces`; POST /workspaces is recorded. */
function signedInWith(workspaces: WorkspaceDto[]) {
  const created: unknown[] = [];
  let list = [...workspaces];
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(WORKSPACES_URL, () => HttpResponse.json({ data: list })),
    mswHttp.post(WORKSPACES_URL, async ({ request }) => {
      created.push(await request.json());
      list = [...list, acmeWorkspace];
      return HttpResponse.json({ data: acmeWorkspace }, { status: 201 });
    }),
  );
  return { created };
}

function submitName(name: string) {
  fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: name } });
  fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
}

describe('workspaces', () => {
  afterEach(() => setAccessToken(null));

  it('a user without workspaces sees "Create your first workspace" on /', async () => {
    signedInWith([]);

    renderApp(firstWorkspacePage.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading }),
    ).toBeInTheDocument();
  });

  it('creating the first workspace sends the trimmed name and opens /w/<slug>', async () => {
    const { created } = signedInWith([]);
    const { router } = renderApp(firstWorkspacePage.path);
    await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading });

    submitName(newWorkspaceInput.typed);

    expect(
      await screen.findByRole('heading', { level: 1, name: acmeWorkspace.name }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace));
    expect(created).toEqual([newWorkspaceInput.sent]);
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    expect(within(nav).getByRole('link', { name: acmeWorkspace.name })).toBeInTheDocument();
  });

  it('shows the field message for a blank name and sends nothing', async () => {
    const { created } = signedInWith([]);
    renderApp(firstWorkspacePage.path);
    await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading });

    submitName('   ');

    expect(await screen.findByText(blankNameMessage)).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });

  it('shows the server message when creating fails', async () => {
    signedInWith([]);
    server.use(
      mswHttp.post(WORKSPACES_URL, () => HttpResponse.json(workspaceServerError, { status: 500 })),
    );
    renderApp(firstWorkspacePage.path);
    await screen.findByRole('heading', { level: 1, name: firstWorkspacePage.heading });

    submitName(newWorkspaceInput.typed);

    expect(await screen.findByRole('alert')).toHaveTextContent(workspaceServerError.error.message);
  });

  it('a user with workspaces is taken from / to the first one', async () => {
    signedInWith([acmeWorkspace, betaWorkspace]);

    const { router } = renderApp(firstWorkspacePage.path);

    expect(
      await screen.findByRole('heading', { level: 1, name: acmeWorkspace.name }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace));
  });

  it('the sidebar lists the workspaces and opens another one', async () => {
    signedInWith([acmeWorkspace, betaWorkspace]);
    const { router } = renderApp(workspacePathFor(acmeWorkspace));
    const nav = await screen.findByRole('navigation', { name: 'Workspaces' });

    fireEvent.click(await within(nav).findByRole('link', { name: betaWorkspace.name }));

    expect(
      await screen.findByRole('heading', { level: 1, name: betaWorkspace.name }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(workspacePathFor(betaWorkspace));
  });

  it('the ☰ button opens the sidebar drawer, and choosing a workspace closes it', async () => {
    signedInWith([acmeWorkspace, betaWorkspace]);
    renderApp(workspacePathFor(acmeWorkspace));
    const menuButton = await screen.findByRole('button', { name: 'Open menu' });
    expect(menuButton).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(menuButton);

    expect(screen.getByRole('button', { name: 'Close menu', expanded: true })).toBeInTheDocument();
    const nav = screen.getByRole('navigation', { name: 'Workspaces' });
    fireEvent.click(await within(nav).findByRole('link', { name: betaWorkspace.name }));
    expect(
      await screen.findByRole('heading', { level: 1, name: betaWorkspace.name }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('the "Create workspace" dialog creates one and opens it', async () => {
    const { created } = signedInWith([betaWorkspace]);
    const { router } = renderApp(workspacePathFor(betaWorkspace));
    await screen.findByRole('heading', { level: 1, name: betaWorkspace.name });

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), {
      target: { value: newWorkspaceInput.typed },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(workspacePathFor(acmeWorkspace)),
    );
    expect(created).toEqual([newWorkspaceInput.sent]);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('the dialog shows the field message for a blank name and sends nothing', async () => {
    const { created } = signedInWith([betaWorkspace]);
    renderApp(workspacePathFor(betaWorkspace));
    await screen.findByRole('heading', { level: 1, name: betaWorkspace.name });

    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Workspace name'), { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create workspace' }));

    expect(await within(dialog).findByText(blankNameMessage)).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });

  it('an unknown or foreign slug shows "Page not found"', async () => {
    signedInWith([acmeWorkspace]);

    renderApp(`/w/${unknownWorkspaceSlug}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: notFoundCase.heading }),
    ).toBeInTheDocument();
  });

  it('a signed-out visitor to /w/<slug> is sent to log in', async () => {
    const { router } = renderApp(workspacePathFor(acmeWorkspace));

    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.login.heading }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(pageCases.login.path);
  });
});
