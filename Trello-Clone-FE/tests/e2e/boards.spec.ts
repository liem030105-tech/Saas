import { expect, test, type Browser, type Page } from '@playwright/test';

import { buildE2eUser, type E2eUser } from './data/users';
import { notFoundCase, pageCases } from '../../src/testing/data/routes';

// Scenario 6 (docs/development/testing.md): a VIEWER sees no create actions; a non-member opening a
// board URL sees "not found".

async function register(page: Page, user: E2eUser) {
  await page.getByLabel('Name', { exact: true }).fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

async function newPage(browser: Browser) {
  return (await browser.newContext()).newPage();
}

test('a VIEWER sees no create actions; a non-member sees "not found" for a board', async ({
  browser,
}) => {
  const owner = buildE2eUser();
  const viewer = buildE2eUser();
  const outsider = buildE2eUser();
  const workspaceName = `Team ${owner.name.split(' ').pop()}`;

  // The owner creates a workspace and a board, then invites the viewer.
  const ownerPage = await newPage(browser);
  await ownerPage.goto(pageCases.register.path);
  await register(ownerPage, owner);
  await ownerPage.getByLabel('Workspace name').fill(workspaceName);
  await ownerPage.getByRole('button', { name: 'Create workspace' }).click();
  await ownerPage.getByRole('button', { name: 'Create your first board' }).click();
  await ownerPage.getByRole('dialog').getByLabel('Board title').fill('Roadmap');
  await ownerPage.getByRole('dialog').getByRole('button', { name: 'Create board' }).click();
  const tile = ownerPage.getByRole('link', { name: 'Roadmap' });
  await tile.click();
  await expect(ownerPage.getByRole('button', { name: 'Roadmap', exact: true })).toBeVisible();
  const boardPath = new URL(ownerPage.url()).pathname;

  await ownerPage.goBack();
  await ownerPage.getByRole('link', { name: 'Members' }).click();
  await ownerPage.getByRole('button', { name: 'Invite people' }).click();
  const dialog = ownerPage.getByRole('dialog');
  await dialog.getByLabel('Email').fill(viewer.email);
  await dialog.getByRole('button', { name: /^Role/ }).click();
  await ownerPage.getByRole('menuitemradio', { name: 'Viewer' }).click();
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  const invitePath = new URL(await dialog.getByLabel(/^Invite link for/).inputValue()).pathname;

  // The viewer joins and sees the board, but no way to create or change anything.
  const viewerPage = await newPage(browser);
  await viewerPage.goto(`${pageCases.register.path}?redirectTo=${encodeURIComponent(invitePath)}`);
  await register(viewerPage, viewer);
  await expect(viewerPage.getByRole('heading', { level: 1, name: workspaceName })).toBeVisible();
  await expect(viewerPage.getByRole('link', { name: 'Roadmap' })).toBeVisible();
  await expect(
    viewerPage.getByRole('button', { name: /Create (board|your first board)/ }),
  ).toHaveCount(0);
  await viewerPage.goto(boardPath);
  // The page renders only once the caller's role is known, so the heading means the actions are final.
  await expect(viewerPage.getByRole('heading', { level: 1, name: 'Roadmap' })).toBeVisible();
  for (const name of [/^Roadmap$/, /Colour/, /Archive/, /Delete/]) {
    await expect(viewerPage.getByRole('button', { name })).toHaveCount(0);
  }

  // Someone outside the workspace opening the board URL sees "Page not found".
  const outsiderPage = await newPage(browser);
  await outsiderPage.goto(pageCases.register.path);
  await register(outsiderPage, outsider);
  await expect(outsiderPage.getByLabel('Workspace name')).toBeVisible();
  await outsiderPage.goto(boardPath);
  await expect(
    outsiderPage.getByRole('heading', { level: 1, name: notFoundCase.heading }),
  ).toBeVisible();
});
