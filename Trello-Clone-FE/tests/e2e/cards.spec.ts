import { expect, test } from '@playwright/test';

import { boardWithLists } from './helpers/board';

// Scenario 3 (docs/development/testing.md), CARD-001 acceptance: create board → list → card;
// cards appear in creation order and persist after reload.

const CARD_TITLES = ['Fix login', 'Sign-up form', 'Write tests'];

test('board → list → cards: added in order, kept after a reload', async ({ page }) => {
  await boardWithLists(page, ['To do', 'Doing']);
  const toDo = page.getByRole('region', { name: 'To do' });
  const cards = toDo.getByRole('article');

  // Enter adds the card and keeps the composer open for the next one.
  await toDo.getByRole('button', { name: 'Add a card to To do' }).click();
  const titleField = toDo.getByRole('textbox', { name: 'Card title' });
  for (const title of CARD_TITLES) {
    const saved = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/cards') && res.ok(),
    );
    await titleField.fill(title);
    await titleField.press('Enter');
    await saved;
  }
  await expect(cards).toHaveText(CARD_TITLES);
  await expect(page.getByRole('region', { name: 'Doing' }).getByRole('article')).toHaveCount(0);

  await page.reload();
  await expect(cards).toHaveText(CARD_TITLES);
});
