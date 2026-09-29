import { expect, test, type Page } from '@playwright/test';

import { buildE2eUser, type E2eUser } from './data/users';
import { pageCases, profilePage } from '../../src/testing/data/routes';

// Scenario 1 (docs/development/testing.md): register → lands on / → reload keeps the session →
// logout → /login → login again. Paths and headings are the same test data the router tests use.

const { home, login, register } = pageCases;

async function expectPage(page: Page, { path, heading }: { path: string; heading: string }) {
  await expect(page).toHaveURL(path);
  await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
}

/** The profile page is showing, signed in as `user` (not redirected to /login). */
async function expectProfileSignedIn(page: Page, user: E2eUser) {
  await expectPage(page, profilePage);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(user.name);
}

test('register → reload keeps the session → logout → login again', async ({ page }) => {
  const user = buildE2eUser();

  // Register: lands on / signed in.
  await page.goto(register.path);
  await page.getByLabel('Name', { exact: true }).fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expectPage(page, home);

  // Reload: the refresh cookie restores the session (the access token lived in memory only).
  await page.reload();
  await expectPage(page, home);
  await page.goto(profilePage.path);
  await expectProfileSignedIn(page, user);
  await page.reload();
  await expectProfileSignedIn(page, user);

  // Logout from the avatar menu: a plain /login, and a reload stays signed out.
  await page.getByRole('button', { name: `Account menu for ${user.name}` }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expectPage(page, login);
  await page.reload();
  await expectPage(page, login);

  // A protected page now asks to log in, and returns there afterwards.
  await page.goto(profilePage.path);
  await expect(page).toHaveURL(`${login.path}?redirectTo=${encodeURIComponent(profilePage.path)}`);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expectProfileSignedIn(page, user);
});
