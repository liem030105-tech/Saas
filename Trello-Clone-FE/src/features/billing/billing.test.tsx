import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { setExternalNavigation } from '@/lib/external-navigation';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import {
  alreadyProError,
  boardLimitError,
  checkoutUrl,
  freeBilling,
  memberLimitError,
  portalUrl,
  proBilling,
} from '@/testing/data/billing';
import {
  acmeAs,
  acmeWorkspace,
  workspaceMembersPathFor,
  workspacePathFor,
  workspaceSettingsPathFor,
} from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { CONFIRM_SLOW_MESSAGE, OWNER_ONLY_MESSAGE } from './components/BillingSection';
import { CONFIRM_MAX_READS, CONFIRM_POLL_MS, REDIRECT_ERROR } from './queries';

import type { BillingDto, Role, WorkspaceDto } from '@trello-clone/shared';

// BILLING-001c: the settings page's "Plan and billing" section and the upgrade prompts on 402
// (docs/design/ui.md → Workspace settings, Upgrade prompts).

const BILLING_URL = apiUrl(`/workspaces/${acmeWorkspace.id}/billing`);

/** Signed in as `role` of Acme; GET billing answers `billing` (changeable through `state`). */
function signedInAs(
  role: Role,
  billing: BillingDto = freeBilling,
  plan: WorkspaceDto['plan'] = 'FREE',
) {
  const state = {
    billing,
    plan,
    calls: [] as string[],
    visited: [] as string[],
    billingReads: 0,
    workspaceReads: 0,
  };
  setExternalNavigation((url) => state.visited.push(url));
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => {
      state.workspaceReads++;
      return HttpResponse.json({ data: [{ ...acmeAs(role), plan: state.plan }] });
    }),
    mswHttp.get(BILLING_URL, () => {
      state.billingReads++;
      return HttpResponse.json({ data: state.billing });
    }),
    mswHttp.post(`${BILLING_URL}/checkout`, () => {
      state.calls.push('checkout');
      return HttpResponse.json({ data: { url: checkoutUrl } });
    }),
    mswHttp.post(`${BILLING_URL}/portal`, () => {
      state.calls.push('portal');
      return HttpResponse.json({ data: { url: portalUrl } });
    }),
  );
  return state;
}

afterEach(() => {
  setAccessToken(null);
  setExternalNavigation(null);
  vi.useRealTimers();
});

const billingSection = () => screen.findByRole('region', { name: 'Plan and billing' });

/** The value next to a label in the section's details. */
const valueOf = (section: HTMLElement, label: string) =>
  within(section).getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

describe('Plan and billing (workspace settings)', () => {
  it('an OWNER on Free sees the plan and its usage, and "Upgrade to Pro" leaves for Stripe Checkout', async () => {
    const state = signedInAs('OWNER');
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    expect(await within(section).findByText('Free')).toBeVisible();
    expect(valueOf(section, 'Boards')).toBe('2 of 5');
    expect(valueOf(section, 'Members')).toBe('3 of 5 (pending invites included)');
    expect(valueOf(section, 'Files')).toBe('up to 10 MB each');
    expect(within(section).queryByText('Status', { selector: 'dt' })).toBeNull();
    // No Stripe customer yet: nothing to manage.
    expect(within(section).queryByRole('button', { name: 'Manage billing' })).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: 'Upgrade to Pro' }));
    await waitFor(() => expect(state.visited).toEqual([checkoutUrl]));
    expect(state.calls).toEqual(['checkout']);
    // The browser is leaving: no second Checkout session from a second click.
    expect(within(section).getByRole('button', { name: 'Opening checkout…' })).toBeDisabled();
  });

  it('an OWNER on Pro sees the renewal date and unlimited usage, and "Manage billing" opens the portal', async () => {
    const state = signedInAs('OWNER', proBilling, 'PRO');
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    expect(await within(section).findByText('Pro')).toBeVisible();
    expect(valueOf(section, 'Status')).toBe('Active');
    expect(valueOf(section, 'Renews')).toBe('Nov 3, 2026');
    expect(valueOf(section, 'Boards')).toBe('7');
    expect(valueOf(section, 'Files')).toBe('up to 100 MB each');
    expect(within(section).queryByRole('button', { name: 'Upgrade to Pro' })).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: 'Manage billing' }));
    await waitFor(() => expect(state.visited).toEqual([portalUrl]));
  });

  it('a Free workspace that subscribed before can still open the portal (its invoices)', async () => {
    const state = signedInAs('OWNER', { ...freeBilling, status: 'CANCELED' });
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    expect(await within(section).findByText('Canceled')).toBeVisible();
    expect(within(section).getByRole('button', { name: 'Upgrade to Pro' })).toBeVisible();
    fireEvent.click(within(section).getByRole('button', { name: 'Manage billing' }));
    await waitFor(() => expect(state.visited).toEqual([portalUrl]));
  });

  it('a failed payment says how to keep Pro; no renewal date', async () => {
    signedInAs('OWNER', { ...proBilling, status: 'PAST_DUE' }, 'PRO');
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    expect(await within(section).findByText(/Payment failed/)).toBeVisible();
    expect(within(section).queryByText('Renews', { selector: 'dt' })).toBeNull();
  });

  it('an ADMIN sees the plan read-only; a MEMBER does not see the section', async () => {
    signedInAs('ADMIN', proBilling, 'PRO');
    const { unmount } = renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();
    expect(await within(section).findByText(OWNER_ONLY_MESSAGE)).toBeVisible();
    expect(within(section).queryByRole('button')).toBeNull();
    unmount();

    const member = signedInAs('MEMBER');
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    expect(await screen.findByRole('heading', { name: 'Workspace settings' })).toBeVisible();
    expect(screen.queryByRole('region', { name: 'Plan and billing' })).toBeNull();
    expect(member.billingReads).toBe(0);
  });

  it('back from a paid checkout: the plan is read again until the webhook has made it Pro, then the workspace list too', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = signedInAs('OWNER');
    renderApp(`${workspaceSettingsPathFor(acmeWorkspace)}?billing=success`);
    const section = await billingSection();
    expect(await within(section).findByText(/payment is being confirmed/)).toBeVisible();
    const workspaceReads = state.workspaceReads;

    state.billing = proBilling; // the webhook arrived
    state.plan = 'PRO';
    await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS);
    expect(await within(section).findByText(/on Pro now/)).toBeVisible();
    // The cached workspace list (its plan sets limits elsewhere, e.g. attachments) is refreshed.
    await waitFor(() => expect(state.workspaceReads).toBeGreaterThan(workspaceReads));
    const reads = state.billingReads;
    await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS * 2);
    expect(state.billingReads).toBe(reads); // no more polling once Pro
  });

  it('when the webhook does not come, polling stops after a while and says to come back later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const state = signedInAs('OWNER');
    renderApp(`${workspaceSettingsPathFor(acmeWorkspace)}?billing=success`);
    const section = await billingSection();
    await within(section).findByText(/payment is being confirmed/);

    await vi.advanceTimersByTimeAsync(CONFIRM_POLL_MS * (CONFIRM_MAX_READS + 2));
    expect(await within(section).findByText(CONFIRM_SLOW_MESSAGE)).toBeVisible();
    expect(state.billingReads).toBe(CONFIRM_MAX_READS);
  });

  it('a canceled checkout says the plan has not changed', async () => {
    signedInAs('OWNER');
    renderApp(`${workspaceSettingsPathFor(acmeWorkspace)}?billing=canceled`);
    const section = await billingSection();
    expect(await within(section).findByText(/Checkout was canceled/)).toBeVisible();
  });

  it("a 409 on checkout shows the API's message and stays on the page", async () => {
    const state = signedInAs('OWNER');
    server.use(
      mswHttp.post(`${BILLING_URL}/checkout`, () =>
        HttpResponse.json(alreadyProError, { status: 409 }),
      ),
    );
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    fireEvent.click(await within(section).findByRole('button', { name: 'Upgrade to Pro' }));
    expect(await screen.findByText(alreadyProError.error.message)).toBeVisible();
    expect(state.visited).toEqual([]);
  });

  it('a server error opening Stripe shows a plain message', async () => {
    const state = signedInAs('OWNER', proBilling, 'PRO');
    server.use(mswHttp.post(`${BILLING_URL}/portal`, () => HttpResponse.json({}, { status: 500 })));
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    fireEvent.click(await within(section).findByRole('button', { name: 'Manage billing' }));
    expect(await screen.findByText(REDIRECT_ERROR)).toBeVisible();
    expect(state.visited).toEqual([]);
  });

  it('a redirect to a non-https URL is refused', async () => {
    const state = signedInAs('OWNER');
    server.use(
      mswHttp.post(`${BILLING_URL}/checkout`, () =>
        HttpResponse.json({ data: { url: 'http://checkout.example.test/c/1' } }),
      ),
    );
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    fireEvent.click(await within(section).findByRole('button', { name: 'Upgrade to Pro' }));
    expect(await screen.findByText(REDIRECT_ERROR)).toBeVisible();
    expect(state.visited).toEqual([]);
  });

  it('a failed load can be retried', async () => {
    const state = signedInAs('OWNER');
    let fail = true;
    server.use(
      mswHttp.get(BILLING_URL, () =>
        fail ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ data: state.billing }),
      ),
    );
    renderApp(workspaceSettingsPathFor(acmeWorkspace));
    const section = await billingSection();

    expect(await within(section).findByRole('alert')).toHaveTextContent("Couldn't load the plan.");
    fail = false;
    fireEvent.click(within(section).getByRole('button', { name: 'Try again' }));
    expect(await within(section).findByText('Free')).toBeVisible();
  });
});

describe('upgrade prompts on 402', () => {
  it('creating a board over the limit: the OWNER gets a link to upgrade', async () => {
    signedInAs('OWNER');
    server.use(
      mswHttp.post(apiUrl('/workspaces/:workspaceId/boards'), () =>
        HttpResponse.json(boardLimitError, { status: 402 }),
      ),
    );
    renderApp(workspacePathFor(acmeWorkspace));

    fireEvent.click(await screen.findByRole('button', { name: 'Create your first board' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a board' });
    fireEvent.change(within(dialog).getByLabelText('Board title'), { target: { value: 'Q4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create board' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(boardLimitError.error.message);
    expect(within(alert).getByRole('link', { name: 'Upgrade to Pro' })).toHaveAttribute(
      'href',
      `${workspaceSettingsPathFor(acmeWorkspace)}#billing`,
    );
  });

  it('a MEMBER is told to ask an owner instead', async () => {
    signedInAs('MEMBER');
    server.use(
      mswHttp.post(apiUrl('/workspaces/:workspaceId/boards'), () =>
        HttpResponse.json(boardLimitError, { status: 402 }),
      ),
    );
    renderApp(workspacePathFor(acmeWorkspace));

    fireEvent.click(await screen.findByRole('button', { name: 'Create your first board' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a board' });
    fireEvent.change(within(dialog).getByLabelText('Board title'), { target: { value: 'Q4' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create board' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent('Ask a workspace owner to upgrade to Pro.');
    expect(within(alert).queryByRole('link')).toBeNull();
  });

  it('inviting over the member limit: the OWNER gets a link to upgrade', async () => {
    signedInAs('OWNER');
    server.use(
      mswHttp.get(apiUrl('/workspaces/:workspaceId/invites'), () =>
        HttpResponse.json({ data: [] }),
      ),
      mswHttp.post(apiUrl('/workspaces/:workspaceId/invites'), () =>
        HttpResponse.json(memberLimitError, { status: 402 }),
      ),
    );
    renderApp(workspaceMembersPathFor(acmeWorkspace));

    fireEvent.click(await screen.findByRole('button', { name: 'Invite people' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email'), {
      target: { value: 'grace@example.com' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create invite link' }));

    const alert = await within(dialog).findByRole('alert');
    expect(alert).toHaveTextContent(memberLimitError.error.message);
    expect(within(alert).getByRole('link', { name: 'Upgrade to Pro' })).toBeVisible();
  });
});
