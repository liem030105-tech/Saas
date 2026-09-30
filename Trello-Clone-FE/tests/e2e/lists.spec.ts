import { expect, test } from '@playwright/test';

import { buildE2eUser } from './data/users';
import { pageCases } from '../../src/testing/data/routes';

// LIST-001 acceptance: adding three lists shows them in creation order after reload.
// LIST-002 acceptance: an archived list disappears from the board; a deleted list is gone after
// reload.

const LIST_TITLES = ['To do', 'Doing', 'Done'];

test('lists: add three in order, archive, delete, rename, all kept after reload', async ({
  page,
}) => {
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

  // Archive "Doing": it leaves the board at once and stays gone.
  await page.getByRole('button', { name: 'List actions for Doing' }).click();
  await page.getByRole('menuitem', { name: 'Archive list' }).click();
  await expect(page.getByText('Doing was archived.')).toBeVisible();
  await expect(lists).toHaveText(['To do', 'Done']);

  // Delete "Done" after confirming.
  await page.getByRole('button', { name: 'List actions for Done' }).click();
  await page.getByRole('menuitem', { name: 'Delete list' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete list' }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  await expect(lists).toHaveText(['To do']);

  // The page is still usable after the dialog: rename the remaining list in place.
  await page.getByRole('button', { name: 'To do', exact: true }).click();
  await page.getByRole('textbox', { name: 'List title' }).fill('Backlog');
  const renamed = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/lists/') && res.ok(),
  );
  await page.getByRole('textbox', { name: 'List title' }).press('Enter');
  await expect(lists).toHaveText(['Backlog']);
  await renamed;

  await page.reload();
  await expect(lists).toHaveText(['Backlog']);
});
