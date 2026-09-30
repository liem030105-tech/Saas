import { expect, test, type Page } from '@playwright/test';

import { buildE2eUser, type E2eUser } from './data/users';
import { pageCases } from '../../src/testing/data/routes';

// Scenario 2 (docs/development/testing.md): create a workspace → invite link → a second user signs
// up from the link and joins with the invited role; the link cannot be used again.

async function register(page: Page, user: E2eUser) {
  await page.getByLabel('Name', { exact: true }).fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
}

test('create workspace → invite link → second user signs up and joins', async ({ browser }) => {
  const owner = buildE2eUser();
  const invitee = buildE2eUser();
  const workspaceName = `Team ${owner.name.split(' ').pop()}`;

  // The owner creates a workspace and an invite link for the invitee as a Viewer.
  const ownerPage = await (await browser.newContext()).newPage();
  await ownerPage.goto(pageCases.register.path);
  await register(ownerPage, owner);
  await ownerPage.getByLabel('Workspace name').fill(workspaceName);
  await ownerPage.getByRole('button', { name: 'Create workspace' }).click();
  await expect(ownerPage.getByRole('heading', { level: 1, name: workspaceName })).toBeVisible();
  await ownerPage.getByRole('link', { name: 'Members' }).click();
  await ownerPage.getByRole('button', { name: 'Invite people' }).click();
  const dialog = ownerPage.getByRole('dialog');
  await dialog.getByLabel('Email').fill(invitee.email);
  await dialog.getByRole('button', { name: /^Role/ }).click();
  await ownerPage.getByRole('menuitemradio', { name: 'Viewer' }).click();
  await dialog.getByRole('button', { name: 'Create invite link' }).click();
  const inviteUrl = await dialog.getByLabel(/^Invite link for/).inputValue();
  const invitePath = new URL(inviteUrl).pathname;

  // The invitee opens the link signed out: log in is asked first; they sign up instead.
  const inviteePage = await (await browser.newContext()).newPage();
  await inviteePage.goto(invitePath);
  await expect(inviteePage).toHaveURL(
    `${pageCases.login.path}?redirectTo=${encodeURIComponent(invitePath)}`,
  );
  await inviteePage.getByRole('link', { name: 'Sign up' }).click();
  await register(inviteePage, invitee);

  // Back on the link: the invite is accepted and the workspace opens.
  await expect(inviteePage.getByRole('heading', { level: 1, name: workspaceName })).toBeVisible();
  await expect(inviteePage).toHaveURL(/\/w\/[a-z0-9-]+$/);
  await inviteePage.getByRole('link', { name: 'Members' }).click();
  const row = inviteePage.getByRole('listitem').filter({ hasText: invitee.email });
  await expect(row).toContainText('Viewer');
  await expect(inviteePage.getByRole('button', { name: 'Invite people' })).toHaveCount(0);

  // The link works only once.
  await inviteePage.goto(invitePath);
  await expect(inviteePage.getByRole('alert')).toHaveText('This invite is invalid or has expired.');

  // The owner sees the new member, and the invite is no longer pending.
  await ownerPage.reload();
  await expect(ownerPage.getByRole('listitem').filter({ hasText: invitee.email })).toBeVisible();
  await expect(ownerPage.getByText('No pending invites.')).toBeVisible();
});
