import { expect, test, type Page } from '@playwright/test';

import { buildE2eUser } from './data/users';
import { boardWithLists } from './helpers/board';
import { pageCases } from '../../src/testing/data/routes';

// LIST-001 acceptance: adding three lists shows them in creation order after reload.
// LIST-002 acceptance: an archived list disappears from the board; a deleted list is gone after
// reload.
// LIST-003 acceptance: dragging lists persists the order after reload, including after forced
// rebalancing.

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

/**
 * Moves the list at 1-based place `from` one place left per step with the keyboard (Space, arrow
 * keys, Space). Each key waits for the screen-reader announcement, which is when dnd-kit has
 * measured the new place. Resolves with the server's answer.
 */
async function moveLeft(page: Page, title: string, from: number, steps = 1) {
  const announcement = page.locator('[id^="DndLiveRegion"]');
  const moved = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/lists/') && res.ok(),
  );
  // The board refetch that follows every move; the next drag starts once the row has settled.
  const refetched = page.waitForResponse(
    (res) => res.request().method() === 'GET' && /\/boards\/[^/]+$/.test(res.url()) && res.ok(),
  );
  await page.getByRole('button', { name: `Move list ${title}` }).focus();
  await page.keyboard.press('Space');
  await expect(announcement).toContainText(`List ${title} is at position ${from} of`);
  // dnd-kit measures the lists in the frames right after a pickup; an arrow key pressed before
  // that finds no place to move to. Wait two frames, which no person could beat.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  for (let place = from - 1; place >= from - steps; place -= 1) {
    await page.keyboard.press('ArrowLeft');
    await expect(announcement).toContainText(`is at position ${place} of`);
  }
  await page.keyboard.press('Space');
  await expect(announcement).toContainText(`was dropped at position ${from - steps} of`);
  const body = (await (await moved).json()) as { data: { position: number } };
  await refetched;
  return body;
}

test('lists: reorder by keyboard drag, survive a forced rebalance and a reload', async ({
  page,
}) => {
  const lists = await boardWithLists(page, ['X', 'Y', 'Z']);

  // A plain move: Z to the front.
  await moveLeft(page, 'Z', 3, 2);
  await expect(lists).toHaveText(['Z', 'X', 'Y']);
  await page.reload();
  await expect(lists).toHaveText(['Z', 'X', 'Y']);

  // Squeeze one gap: X and Y keep swapping right after Z, halving the gap each time, until the
  // server rebalances (it then answers with a renumbered position, a multiple of 1024).
  const positions: number[] = [];
  let order = ['Z', 'X', 'Y'];
  for (let i = 0; i < 32; i += 1) {
    const last = order[2]!;
    const { data } = await moveLeft(page, last, 3);
    positions.push(data.position);
    order = [order[0]!, last, order[1]!];
    await expect(lists).toHaveText(order);
  }
  expect(positions.slice(1).some((position) => position % 1024 === 0)).toBe(true);

  await page.reload();
  await expect(lists).toHaveText(order);
});
