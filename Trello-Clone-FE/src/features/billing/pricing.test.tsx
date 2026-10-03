import { fireEvent, screen, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { pageCases } from '@/testing/data/routes';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

// BILLING-001d (ADR-022): the public pricing page and the landing page (docs/design/ui.md →
// Public pages). The plans come from PLAN_LIMITS.

afterEach(() => setAccessToken(null));

const plan = (name: string) => screen.getByRole('region', { name });

function signedIn() {
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
  );
}

describe('/pricing', () => {
  it('signed out: Free and Pro with their limits, each leading to sign-up', async () => {
    renderApp(pageCases.pricing.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.pricing.heading }),
    ).toBeVisible();
    // The header marks the page it is on.
    expect(screen.getByRole('link', { name: 'Pricing' })).toHaveAttribute('aria-current', 'page');

    const free = plan('Free');
    expect(within(free).getByText('$0')).toBeVisible();
    for (const text of [
      'Up to 5 boards per workspace',
      'Up to 5 members per workspace (pending invites included)',
      'Files up to 10 MB',
      'Activity history for the last 7 days',
    ]) {
      expect(within(free).getByText(text)).toBeVisible();
    }
    expect(within(free).getByRole('link', { name: 'Get started' })).toHaveAttribute(
      'href',
      '/register',
    );

    const pro = plan('Pro');
    expect(within(pro).getByText('$5 per member per month')).toBeVisible();
    for (const text of [
      'Unlimited boards',
      'Unlimited members',
      'Files up to 100 MB',
      'Full activity history',
    ]) {
      expect(within(pro).getByText(text)).toBeVisible();
    }
    expect(within(pro).getByRole('link', { name: 'Start free, upgrade later' })).toHaveAttribute(
      'href',
      '/register',
    );

    const nav = screen.getByRole('navigation', { name: 'Main' });
    expect(within(nav).getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login');
    expect(within(nav).getByRole('link', { name: 'Sign up' })).toHaveAttribute('href', '/register');
  });

  it('signed in: no sign-up, a way back to the workspaces, and where an owner upgrades', async () => {
    signedIn();
    renderApp(pageCases.pricing.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.pricing.heading }),
    ).toBeVisible();

    expect(screen.queryByRole('link', { name: /Get started|Sign up|Start free/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Go to your workspaces' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(within(plan('Pro')).getByText(/upgrades from the workspace's settings/)).toBeVisible();
  });
});

describe('landing page', () => {
  it('signed out, `/` introduces the app and leads to sign-up and pricing', async () => {
    renderApp(pageCases.home.path);
    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.home.heading }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Get started free' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      within(screen.getByRole('list', { name: 'Features' })).getAllByRole('listitem'),
    ).toHaveLength(3);

    fireEvent.click(screen.getByRole('link', { name: 'See pricing' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: pageCases.pricing.heading }),
    ).toBeVisible();
  });
});
