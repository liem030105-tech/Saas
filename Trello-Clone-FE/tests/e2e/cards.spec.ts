import { expect, test } from '@playwright/test';

import { boardWithLists, dragCard } from './helpers/board';

// Scenario 3 (docs/development/testing.md), CARD-001 acceptance: create board → list → card;
// cards appear in creation order and persist after reload.
// CARD-002: the card modal edits a card, and its shared URL opens the same card after a reload.
// Scenario 4, CARD-004 acceptance: dragging a card within and between lists persists after reload
// (keyboard-driven, as pointer drags are flaky in CI).
// CARD-005a/b/c/d: a label, a member, a checklist and a comment put on a card persist.
// CARD-005e (scenario 5): the card's activity and the board's activity feed show them.
// (A non-member opening the URL gets the board's "Page not found", covered in boards.spec.ts; the
// suite stays within the auth rate limit, see docs/development/testing.md → E2E.)

const CARD_TITLES = ['Fix login', 'Sign-up form', 'Write tests'];
/** A tile's text starts with its title (the due-date badge follows it). */
const exact = (title: string) => new RegExp(`^${title}`);

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
  await expect(signup.getByRole('region', { name: 'Labels' }).getByRole('listitem')).toHaveCount(1);
  await signup.getByRole('button', { name: 'Close' }).click();
  await expect(doing.getByRole('link', { name: /Sign-up form/ })).toContainText(
    'Labels: Green label',
  );

  // CARD-005b: assign the only workspace member (the owner) to the card; kept after a reload.
  await doing.getByRole('link', { name: /Sign-up form/ }).click();
  await signup.getByRole('button', { name: 'Members' }).click();
  const assigned = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().includes('/members/') && res.ok(),
  );
  const memberPicker = page.getByRole('dialog', { name: 'Members' });
  const ownerName = await memberPicker
    .locator('label')
    .first()
    .locator('span.truncate')
    .innerText();
  await memberPicker.getByRole('checkbox', { name: ownerName }).check();
  await assigned;
  await page.reload();
  await expect(signup.getByRole('region', { name: 'Members' }).getByRole('listitem')).toHaveCount(
    1,
  );
  await signup.getByRole('button', { name: 'Close' }).click();
  await expect(doing.getByRole('link', { name: /Sign-up form/ })).toContainText(
    `Members: ${ownerName}`,
  );

  // CARD-005c: a checklist with two items, one ticked; the tile shows 1/2 after a reload.
  await doing.getByRole('link', { name: /Sign-up form/ }).click();
  await signup.getByRole('button', { name: 'Checklist' }).click();
  await page
    .getByRole('dialog', { name: 'Add checklist' })
    .getByRole('button', { name: 'Add' })
    .click();
  const checklist = signup.getByRole('region', { name: 'Checklist' });
  await checklist.getByRole('button', { name: 'Add an item' }).click();
  for (const content of ['Design the form', 'Validate the email']) {
    const added = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/items') && res.ok(),
    );
    await checklist.getByRole('textbox', { name: 'Item' }).fill(content);
    await checklist.getByRole('textbox', { name: 'Item' }).press('Enter');
    await added;
  }
  const ticked = page.waitForResponse(
    (res) => res.request().method() === 'PATCH' && res.url().includes('/items/') && res.ok(),
  );
  await checklist.getByRole('checkbox', { name: 'Design the form' }).check();
  await ticked;
  await page.reload();
  await expect(checklist.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
  await signup.getByRole('button', { name: 'Close' }).click();
  await expect(doing.getByRole('link', { name: /Sign-up form/ })).toContainText('1/2');

  // CARD-005d: a markdown comment shows rendered after a reload; the tile counts it.
  await doing.getByRole('link', { name: /Sign-up form/ }).click();
  const activity = signup.getByRole('region', { name: 'Activity' });
  const commented = page.waitForResponse(
    (res) => res.request().method() === 'POST' && res.url().endsWith('/comments') && res.ok(),
  );
  await activity.getByRole('textbox', { name: 'Write a comment' }).fill('Needs **review**');
  await activity.getByRole('button', { name: 'Comment' }).click();
  await commented;
  await page.reload();
  await expect(activity.getByRole('article', { name: /^Comment by / })).toContainText(
    'Needs review',
  );
  await expect(activity.locator('strong', { hasText: 'review' })).toBeVisible();
  // CARD-005e: the card's activity and the board's activity feed show what happened.
  await activity.getByRole('button', { name: 'Show details' }).click();
  const cardFeed = activity.getByRole('list', { name: 'Activity' });
  await expect(cardFeed).toContainText('commented on this card');
  // Labels and checklists show too (D-25).
  await expect(cardFeed).toContainText('completed Design the form on this card');
  await expect(cardFeed).toContainText('added checklist Checklist to this card');
  await expect(cardFeed).toContainText('added the green label to this card');
  await signup.getByRole('button', { name: 'Close' }).click();
  await expect(doing.getByRole('link', { name: /Sign-up form/ })).toContainText('Comments:1');
  await page.getByRole('button', { name: 'Activity' }).click();
  const feed = page
    .getByRole('dialog', { name: 'Activity' })
    .getByRole('list', { name: 'Activity' });
  await expect(feed).toContainText('commented on Sign-up form');
  await expect(feed.getByRole('listitem').first()).toContainText('commented on Sign-up form');
});
