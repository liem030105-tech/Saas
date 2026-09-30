import { expect, test } from '@playwright/test';

import { buildE2eUser } from './data/users';
import { pageCases } from '../../src/testing/data/routes';

// LIST-001 acceptance: adding three lists shows them in creation order after reload.

const LIST_TITLES = ['To do', 'Doing', 'Done'];

test('three lists added in a row keep their order after a reload', async ({ page }) => {
  const owner = buildE2eUser();

  await page.goto(pageCases.register.path);
  await page.getByLabel('Name', { exact: true }).fill(owner.name);
  await page.getByLabel('Email').fill(owner.email);
  await page.getByLabel('Password').fill(owner.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Workspace name').fill(`Team ${owner.name.split(' ').pop()}`);
  await page.getByRole('button', { name: 'Create workspace' }).click();
  await page.getByRole('button', { name: 'Create your first board' }).click();
  await page.getByRole('dialog').getByLabel('Board title').fill('Roadmap');
  await page.getByRole('dialog').getByRole('button', { name: 'Create board' }).click();
  await page.getByRole('link', { name: 'Roadmap' }).click();

  // Enter adds the list and keeps the composer open for the next one.
  await page.getByRole('button', { name: 'Add a list' }).click();
  const titleField = page.getByRole('textbox', { name: 'List title' });
  const saved: Promise<unknown>[] = [];
  for (const title of LIST_TITLES) {
    await titleField.fill(title);
    saved.push(
      page.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().endsWith('/lists') && res.ok(),
      ),
    );
    await titleField.press('Enter');
    await expect(titleField).toHaveValue('');
  }
  // The lists show at once (optimistic); reload only once the server has stored all three.
  await Promise.all(saved);
  const lists = page.getByRole('list', { name: 'Lists' }).getByRole('heading', { level: 2 });
  await expect(lists).toHaveText(LIST_TITLES);

  await page.reload();
  await expect(lists).toHaveText(LIST_TITLES);
});
