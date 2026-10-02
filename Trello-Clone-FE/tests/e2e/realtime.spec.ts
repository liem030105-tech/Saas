import { expect, test, type Page, type WebSocketRoute } from '@playwright/test';

import { boardWithLists, dragCard } from './helpers/board';

// Scenario 7 (docs/development/testing.md), REALTIME-001: two browser contexts on the same board;
// a card moved in one shows in the other without a reload, a card added there shows back here,
// concurrent adds converge, and a context that was offline catches up when it reconnects.
// The second context is the same user, signed in from the first one's saved session, so the suite
// spends no extra request of the auth rate limit (docs/development/testing.md → E2E). Its session
// restore rotates the shared refresh token; the first context never refreshes again in this test.
// It also shows that another tab of the same user is kept in sync (only the tab that made a change
// is left out, X-Socket-Id).

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

test('two browsers on one board converge: moves, concurrent adds, a reconnect', async ({
  page,
  browser,
}) => {
  await boardWithLists(page, ['To do', 'Doing']);
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
  }
});
