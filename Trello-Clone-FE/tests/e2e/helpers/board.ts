import { type Page } from '@playwright/test';

import { pageCases } from '../../../src/testing/data/routes';
import { buildE2eUser } from '../data/users';

/** Registers, creates a workspace and a board, and adds `titles` as lists in that order. */
export async function boardWithLists(page: Page, titles: string[]) {
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
  await page.getByRole('button', { name: 'Add a list' }).click();
  const titleField = page.getByRole('textbox', { name: 'List title' });
  for (const title of titles) {
    const saved = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/lists') && res.ok(),
    );
    await titleField.fill(title);
    await titleField.press('Enter');
    await saved;
  }
  await titleField.press('Escape');
  return page.getByRole('list', { name: 'Lists' }).getByRole('heading', { level: 2 });
}
