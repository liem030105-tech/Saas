import { expect, type Page } from '@playwright/test';

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
  return addBoardWithLists(page, { create: 'Create your first board', title: 'Roadmap', titles });
}

/**
 * On a workspace page (signed in): creates the board `title` with `create` (the "Create your first
 * board" button or the "Create board" tile), opens it and adds `titles` as lists in that order.
 */
export async function addBoardWithLists(
  page: Page,
  { create, title: boardTitle, titles }: { create: string; title: string; titles: string[] },
) {
  await page.getByRole('button', { name: create }).click();
  await page.getByRole('dialog').getByLabel('Board title').fill(boardTitle);
  await page.getByRole('dialog').getByRole('button', { name: 'Create board' }).click();
  await page.getByRole('link', { name: boardTitle }).click();
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

/**
 * Drags the card `title` with the keyboard: Space picks it up, each key in `keys` moves it (each
 * waits for the screen-reader announcement), Space drops it. Resolves once the server stored the
 * move and the board was refetched.
 */
export async function dragCard(page: Page, title: string, keys: string[], expected: string[]) {
  const announcement = page.locator('[id^="DndLiveRegion"]');
  const moved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().endsWith('/move') && res.ok(),
  );
  const refetched = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /\/boards\/[^/]+$/.test(res.url()) && res.ok(),
  );
  await page.getByRole('link', { name: new RegExp(`^${title}`) }).focus();
  await page.keyboard.press('Space');
  // The pickup announcement is replaced at once by where the card is.
  await expect(announcement).toContainText(`Card ${title} is at position`);
  // dnd-kit measures the droppables in the frames right after a pickup (see lists.spec.ts).
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  for (const [i, key] of keys.entries()) {
    await page.keyboard.press(key);
    await expect(announcement).toContainText(`Card ${title} is ${expected[i]!}.`);
  }
  await page.keyboard.press('Space');
  await expect(announcement).toContainText(`Card ${title} was dropped`);
  await moved;
  await refetched;
}
