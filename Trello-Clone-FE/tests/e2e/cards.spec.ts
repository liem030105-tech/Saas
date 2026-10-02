import {
  expect,
  test,
  type BrowserContext,
  type Page,
  type WebSocketRoute,
} from '@playwright/test';

import { addBoardWithLists, boardWithLists, dragCard } from './helpers/board';

// Scenario 3 (docs/development/testing.md), CARD-001 acceptance: create board → list → card;
// cards appear in creation order and persist after reload.
// CARD-002: the card modal edits a card, and its shared URL opens the same card after a reload.
// Scenario 4, CARD-004 acceptance: dragging a card within and between lists persists after reload
// (keyboard-driven, as pointer drags are flaky in CI).
// CARD-005a/b/c/d: a label, a member, a checklist and a comment put on a card persist.
// CARD-005e (scenario 5): the card's activity and the board's activity feed show them.
// SEARCH-001: the board's filters highlight the matching card and dim the others.
// Scenario 7, REALTIME-001: the second test (two browser contexts on one board).
// (A non-member opening the URL gets the board's "Page not found", covered in boards.spec.ts; the
// suite stays within the auth rate limit, see docs/development/testing.md → E2E.)

// Serial: the realtime test below reuses this file's account (the auth rate limit).
test.describe.configure({ mode: 'serial' });

/** The first test's signed-in session, for the realtime test. */
let signedIn: Awaited<ReturnType<BrowserContext['storageState']>> | undefined;

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
  await page.keyboard.press('Escape');

  // SEARCH-001: filtering by label and text highlights the matching card and dims the others;
  // clearing restores the board.
  const article = (title: string) => page.getByRole('article', { name: exact(title) });
  await page.getByRole('combobox', { name: 'Label' }).selectOption({ label: 'Green label' });
  await page.getByRole('searchbox', { name: 'Search cards' }).fill('sign');
  await expect(page.getByText('1 card matches.')).toBeVisible();
  await expect(article('Sign-up form')).toHaveAccessibleDescription('Matches the filters');
  for (const title of ['Write tests', 'Fix login']) {
    await expect(article(title)).toHaveAccessibleDescription("Doesn't match the filters");
  }
  await page.getByRole('button', { name: 'Clear filters' }).click();
  for (const title of ['Write tests', 'Fix login', 'Sign-up form']) {
    await expect(article(title)).toHaveAccessibleDescription('');
  }
  signedIn = await page.context().storageState();
});

/** Resolves once the page's socket has joined a board room (the server's `{ ok: true }` ack). */
function boardRoomJoined(page: Page) {
  return new Promise<void>((resolve) => {
    page.on('websocket', (socket) => {
      // Socket.IO frames: `42<ackId>["board:join",…]` out, `43<ackId>[{"ok":true}]` back.
      const ackIds = new Set<string>();
      socket.on('framesent', ({ payload }) => {
        const id = /^42(\d+)\["board:join"/.exec(String(payload))?.[1];
        if (id) ackIds.add(id);
      });
      socket.on('framereceived', ({ payload }) => {
        const id = /^43(\d+)\[\{"ok":true\}\]$/.exec(String(payload))?.[1];
        if (id && ackIds.has(id)) resolve();
      });
    });
  });
}

// Scenario 7 (REALTIME-001): two browser contexts on one board; a card moved in one shows in the
// other without a reload, a card added there shows back here, concurrent adds converge, and a
// context that was offline catches up when it reconnects. Both contexts are the account of the
// test above (serial mode), on a new board of its workspace, so this test spends no request of the
// auth rate limit (docs/development/testing.md → E2E). Each context's session restore rotates the
// shared refresh token; neither refreshes again in this test. It also shows that another tab of
// the same user is kept in sync (only the tab that made a change is left out, X-Socket-Id).
test('two browsers on one board converge: moves, concurrent adds, a reconnect', async ({
  browser,
}) => {
  test.skip(!signedIn, 'needs the account of the test above');
  const first = await browser.newContext({ storageState: signedIn });
  const page = await first.newPage();
  await page.goto('/'); // the workspace (the first one)
  await addBoardWithLists(page, {
    create: 'Create board',
    title: 'Sync',
    titles: ['To do', 'Doing'],
  });
  await page.waitForURL(/\/b\/[^/]+$/);
  const toDo = page.getByRole('region', { name: 'To do' });
  await toDo.getByRole('button', { name: 'Add a card to To do' }).click();
  const titleField = toDo.getByRole('textbox', { name: 'Card title' });
  for (const title of ['Fix login', 'Write tests']) {
    const created = page.waitForResponse(
      (res) => res.request().method() === 'POST' && res.url().endsWith('/cards') && res.ok(),
    );
    await titleField.fill(title);
    await titleField.press('Enter');
    await created;
  }
  await titleField.press('Escape');

  // The second browser opens the same board and joins its room.
  const other = await browser.newContext({ storageState: await page.context().storageState() });
  try {
    const otherPage = await other.newPage();
    // B's socket goes through a route the test can cut (Socket.IO then reconnects on its own).
    const network = { up: true, sockets: [] as WebSocketRoute[] };
    await otherPage.routeWebSocket(/\/socket\.io\//, (socket) => {
      if (!network.up) {
        void socket.close();
        return;
      }
      socket.connectToServer();
      network.sockets.push(socket);
    });
    const joined = boardRoomJoined(otherPage);
    await otherPage.goto(page.url());
    const otherToDo = otherPage.getByRole('region', { name: 'To do' });
    const otherDoing = otherPage.getByRole('region', { name: 'Doing' });
    await expect(otherToDo.getByRole('article')).toHaveText(['Fix login', 'Write tests']);
    await joined;

    // A moves "Fix login" to Doing: B sees it there, with no reload.
    await dragCard(page, 'Fix login', ['ArrowRight'], ['at position 1 of 1 in Doing']);
    await expect(otherDoing.getByRole('article')).toHaveText(['Fix login']);
    await expect(otherToDo.getByRole('article')).toHaveText(['Write tests']);

    // B adds a card to Doing: A sees it.
    await otherDoing.getByRole('button', { name: 'Add a card to Doing' }).click();
    const otherField = otherDoing.getByRole('textbox', { name: 'Card title' });
    await otherField.fill('Review PR');
    await otherField.press('Enter');
    await expect(page.getByRole('region', { name: 'Doing' }).getByRole('article')).toHaveText([
      'Fix login',
      'Review PR',
    ]);

    // Both add a card at the same moment: each ends up with both.
    const adding = [page, otherPage].map(async (tab, i) => {
      const toDoHere = tab.getByRole('region', { name: 'To do' });
      await toDoHere.getByRole('button', { name: 'Add a card to To do' }).click();
      const field = toDoHere.getByRole('textbox', { name: 'Card title' });
      const created = tab.waitForResponse(
        (res) => res.request().method() === 'POST' && res.url().endsWith('/cards') && res.ok(),
      );
      await field.fill(`Concurrent ${i + 1}`);
      await field.press('Enter');
      await created;
      await field.press('Escape');
    });
    await Promise.all(adding);
    for (const region of [toDo, otherToDo]) {
      await expect(region.getByRole('article')).toHaveCount(3);
      await expect(region).toContainText('Concurrent 1');
      await expect(region).toContainText('Concurrent 2');
    }
    // … in the same order (the server's: position, then id).
    await expect(toDo.getByRole('article')).toHaveText(
      await otherToDo.getByRole('article').allTextContents(),
    );

    // B loses its connection while A renames a list; once B is back it shows the new title.
    const rejoined = boardRoomJoined(otherPage);
    network.up = false;
    await Promise.all(network.sockets.splice(0).map((socket) => socket.close({ code: 4000 })));
    const doingHeading = page.getByRole('button', { name: 'Doing', exact: true });
    await doingHeading.click();
    const renamed = page.waitForResponse(
      (res) => res.request().method() === 'PATCH' && res.url().includes('/lists/') && res.ok(),
    );
    await page.getByRole('textbox', { name: 'List title' }).fill('In progress');
    await page.getByRole('textbox', { name: 'List title' }).press('Enter');
    await renamed;
    network.up = true;
    await rejoined;
    await expect(otherPage.getByRole('region', { name: 'In progress' })).toBeVisible();
  } finally {
    await other.close(); // also when an assertion fails
    await first.close();
  }
});
