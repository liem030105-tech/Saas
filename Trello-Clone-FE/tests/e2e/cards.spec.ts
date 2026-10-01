import { expect, test, type Page } from '@playwright/test';

import { boardWithLists } from './helpers/board';

// Scenario 3 (docs/development/testing.md), CARD-001 acceptance: create board → list → card;
// cards appear in creation order and persist after reload.
// CARD-002: the card modal edits a card, and its shared URL opens the same card after a reload.
// Scenario 4, CARD-004 acceptance: dragging a card within and between lists persists after reload
// (keyboard-driven, as pointer drags are flaky in CI). CARD-005a: a label on a card persists.
// (A non-member opening the URL gets the board's "Page not found", covered in boards.spec.ts; the
// suite stays within the auth rate limit, see docs/development/testing.md → E2E.)

const CARD_TITLES = ['Fix login', 'Sign-up form', 'Write tests'];
/** A tile's text starts with its title (the due-date badge follows it). */
const exact = (title: string) => new RegExp(`^${title}`);

/**
 * Drags the card `title` with the keyboard: Space picks it up, each key in `keys` moves it (each
 * waits for the screen-reader announcement), Space drops it. Resolves once the server stored the
 * move and the board was refetched.
 */
async function dragCard(page: Page, title: string, keys: string[], expected: string[]) {
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

test('board → list → cards in order; the card modal edits a card at a shareable URL; cards drag', async ({
  page,
}) => {
  await boardWithLists(page, ['To do', 'Doing']);
  const toDo = page.getByRole('region', { name: 'To do' });
  const cards = toDo.getByRole('article');

  // Enter adds the card and keeps the composer open for the next one.
  await toDo.getByRole('button', { name: 'Add a card to To do' }).click();
  const titleField = toDo.getByRole('textbox', { name: 'Card title' });
  for (const title of CARD_TITLES) {
    const created = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/cards') && res.ok(),
    );
    await titleField.fill(title);
    await titleField.press('Enter');
    await created;
  }
  await titleField.press('Escape');
  await expect(cards).toHaveText(CARD_TITLES);
  await expect(page.getByRole('region', { name: 'Doing' }).getByRole('article')).toHaveCount(0);

  await page.reload();
  await expect(cards).toHaveText(CARD_TITLES);

  // Open the first card and edit it; each edit is saved before the next step.
  await toDo.getByRole('link', { name: 'Fix login' }).click();
  const dialog = page.getByRole('dialog', { name: 'Fix login' });
  await expect(dialog.getByText('in list To do')).toBeVisible();
  const patched = () =>
    page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes('/cards/') && res.ok(),
    );
  await dialog.getByRole('button', { name: 'Add a more detailed description…' }).click();
  await dialog.getByRole('textbox', { name: 'Description' }).fill('**Steps**: open /login');
  let saved = patched();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await saved;
  await expect(dialog.locator('strong', { hasText: 'Steps' })).toBeVisible();
  saved = patched();
  await dialog.locator('input[type="date"]').fill('2999-01-01');
  await saved;
  saved = patched();
  await dialog.getByRole('checkbox', { name: 'Complete' }).check();
  await saved;

  // The URL is the card's: a reload opens the same card with the edits.
  expect(new URL(page.url()).pathname).toMatch(/^\/b\/[^/]+\/c\/[^/]+$/);
  await page.reload();
  await expect(dialog.locator('strong', { hasText: 'Steps' })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: 'Complete' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(toDo.getByRole('link', { name: /Fix login/ })).toContainText('Jan 1');

  // Scenario 4: drag cards with the keyboard. "Write tests" to the top of To do …
  await dragCard(
    page,
    'Write tests',
    ['ArrowUp', 'ArrowUp'],
    ['at position 2 of 3 in To do', 'at position 1 of 3 in To do'],
  );
  await expect(cards).toHaveText(['Write tests', 'Fix login', 'Sign-up form'].map(exact));
  // … then "Sign-up form" into the empty Doing list. Enter still opens a card, not a drag.
  const doing = page.getByRole('region', { name: 'Doing' });
  await dragCard(page, 'Sign-up form', ['ArrowRight'], ['at position 1 of 1 in Doing']);
  await expect(cards).toHaveText(['Write tests', 'Fix login'].map(exact));
  await expect(doing.getByRole('article')).toHaveText(['Sign-up form']);

  await page.reload();
  await expect(cards).toHaveText(['Write tests', 'Fix login'].map(exact));
  await expect(doing.getByRole('article')).toHaveText(['Sign-up form']);
  await doing.getByRole('link', { name: 'Sign-up form' }).press('Enter');
  const signup = page.getByRole('dialog', { name: 'Sign-up form' });
  await expect(signup).toContainText('in list Doing');

  // CARD-005a: put a default label on the card; it stays after a reload, on the card and its tile.
  await signup.getByRole('button', { name: 'Labels' }).click();
  const labelled = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().includes('/labels/') && res.ok(),
  );
  await page.getByRole('dialog', { name: 'Labels' }).getByRole('checkbox').first().check();
  await labelled;
  await page.reload();
  await expect(signup.getByRole('list', { name: 'Labels' }).getByRole('listitem')).toHaveCount(1);
  await signup.getByRole('button', { name: 'Close' }).click();
  await expect(doing.getByRole('link', { name: /Sign-up form/ })).toContainText(
    'Labels: Green label',
  );
});
