import { expect, test } from '@playwright/test';

import { boardWithLists } from './helpers/board';

// Scenario 3 (docs/development/testing.md), CARD-001 acceptance: create board → list → card;
// cards appear in creation order and persist after reload.
// CARD-002: the card modal edits a card, and its shared URL opens the same card after a reload.
// (A non-member opening the URL gets the board's "Page not found", covered in boards.spec.ts; the
// suite stays within the auth rate limit, see docs/development/testing.md → E2E.)

const CARD_TITLES = ['Fix login', 'Sign-up form', 'Write tests'];

test('board → list → cards in order; the card modal edits a card at a shareable URL', async ({
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
});
