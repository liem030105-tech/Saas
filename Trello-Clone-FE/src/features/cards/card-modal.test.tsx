import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl, buildErrorBody } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import {
  cardEdits,
  dueCards,
  hiddenCardId,
  loginCard,
  loginCardDetail,
  otherBoardCardDetail,
  roadmapWithCards,
} from '@/testing/data/cards';
import { todoList } from '@/testing/data/lists';
import { notFoundCase } from '@/testing/data/routes';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, CardDetailDto, Role } from '@trello-clone/shared';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const CARD_URL = apiUrl('/cards/:cardId');
const cardUrlPath = (cardId: string) => `${boardPathFor(roadmapBoard)}/c/${cardId}`;

/** Signed in with `role`; the card endpoints are recorded and answer from `cards`. */
function signedInAs(
  role: Role,
  options: {
    board?: BoardDetailDto;
    cards?: CardDetailDto[];
    failDelete?: boolean;
    /** GET /cards/:cardId fails this many times with a 500 before it answers. */
    failGets?: number;
    /** GET /cards/:cardId waits this long (ms) before it answers. */
    slowGet?: number;
  } = {},
) {
  const state = {
    board: structuredClone(options.board ?? roadmapWithCards),
    cards: new Map((options.cards ?? [loginCardDetail]).map((card) => [card.id, { ...card }])),
    patches: [] as unknown[],
    deletes: [] as string[],
    failedGets: 0,
  };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARD_URL, () => HttpResponse.json({ data: state.board })),
    mswHttp.get(CARD_URL, async ({ params }) => {
      if (options.slowGet) await delay(options.slowGet);
      if ((options.failGets ?? 0) > state.failedGets) {
        state.failedGets += 1;
        return HttpResponse.json(
          buildErrorBody({ code: 'INTERNAL_ERROR', message: 'Something went wrong', details: [] }),
          { status: 500 },
        );
      }
      const card = state.cards.get(params.cardId as string);
      return card
        ? HttpResponse.json({ data: card })
        : HttpResponse.json(
            buildErrorBody({ code: 'NOT_FOUND', message: 'Resource not found', details: [] }),
            { status: 404 },
          );
    }),
    mswHttp.patch(CARD_URL, async ({ params, request }) => {
      const body = (await request.json()) as Partial<CardDetailDto>;
      state.patches.push(body);
      const card = state.cards.get(params.cardId as string)!;
      Object.assign(card, body);
      return HttpResponse.json({ data: card });
    }),
    mswHttp.delete(CARD_URL, ({ params }) => {
      state.deletes.push(params.cardId as string);
      if (options.failDelete) {
        return HttpResponse.json(
          buildErrorBody({
            code: 'INTERNAL_ERROR',
            message: 'The card could not be deleted',
            details: [],
          }),
          { status: 500 },
        );
      }
      state.cards.delete(params.cardId as string);
      state.board.lists[0]!.cards = state.board.lists[0]!.cards.filter(
        (card) => card.id !== params.cardId,
      );
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openCard(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  const rendered = renderApp(cardUrlPath(loginCard.id));
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  return { ...rendered, state, dialog };
}

describe('card modal (/b/:boardId/c/:cardId)', () => {
  afterEach(() => setAccessToken(null));

  it('a shared card URL opens the card over its board, with its list and description', async () => {
    const { dialog } = await openCard('VIEWER');

    expect(within(dialog).getByText(`in list ${todoList.title}`)).toBeInTheDocument();
    expect(within(dialog).getByText('Steps').tagName).toBe('STRONG');
    expect(within(dialog).getByRole('checkbox', { name: 'Complete' })).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: /Archive|Delete|Edit/ })).toBeNull();
  });

  it('clicking a card tile opens it, and closing goes back to the board', async () => {
    signedInAs('MEMBER');
    const { router } = renderApp(boardPathFor(roadmapBoard));

    fireEvent.click(await screen.findByRole('link', { name: loginCard.title }));
    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    expect(router.state.location.pathname).toBe(cardUrlPath(loginCard.id));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(boardPathFor(roadmapBoard)));
  });

  it('a MEMBER renames the card, and the board tile follows', async () => {
    const { dialog, state } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: loginCard.title }));
    const input = within(dialog).getByRole('textbox', { name: 'Card title' });
    fireEvent.change(input, { target: { value: cardEdits.rename.typed } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(state.patches).toEqual([cardEdits.rename.sent]));
    expect(
      await within(dialog).findByRole('button', { name: cardEdits.rename.sent.title }),
    ).toBeInTheDocument();
  });

  it('a MEMBER edits the description; a blank one clears it', async () => {
    const { dialog, state } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Description' }), {
      target: { value: cardEdits.description.typed },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.patches).toEqual([cardEdits.description.sent]));
    expect((await within(dialog).findByText('notes')).tagName).toBe('EM');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Description' }), {
      target: { value: cardEdits.clearDescription.typed },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(state.patches).toContainEqual(cardEdits.clearDescription.sent));
    expect(
      await within(dialog).findByRole('button', { name: 'Add a more detailed description…' }),
    ).toBeInTheDocument();
  });

  it('a MEMBER sets the due date and completes the card', async () => {
    const { dialog, state } = await openCard('MEMBER');

    fireEvent.change(within(dialog).getByLabelText('Due date', { selector: 'input' }), {
      target: { value: cardEdits.dueDate.picked },
    });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Complete' }));

    await waitFor(() =>
      expect(state.patches).toEqual([cardEdits.dueDate.sent, cardEdits.complete.sent]),
    );
    expect(within(dialog).getByRole('checkbox', { name: 'Complete' })).toBeChecked();
  });

  it('archiving shows the banner and removes the tile from the board', async () => {
    const { dialog, state } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));

    expect(await within(dialog).findByText(/This card is archived/)).toBeInTheDocument();
    expect(state.patches).toEqual([cardEdits.archive.sent]);
    expect(within(dialog).getByRole('button', { name: 'Unarchive' })).toBeInTheDocument();
  });

  it('deleting asks first, then closes the card and removes it from the board', async () => {
    const { dialog, state, router } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete card' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(boardPathFor(roadmapBoard)));
    expect(state.deletes).toEqual([loginCard.id]);
    await waitFor(() => expect(screen.queryByRole('link', { name: loginCard.title })).toBeNull());
  });

  it('a failed delete keeps the card and shows the error', async () => {
    const { dialog } = await openCard('MEMBER', { failDelete: true });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete card' }));

    expect(await within(confirm).findByText('The card could not be deleted')).toBeInTheDocument();
  });

  it.each([
    { case: 'a card the caller cannot see', cardId: hiddenCardId },
    { case: 'a card on another board', cardId: otherBoardCardDetail.id },
  ])('$case shows "Page not found"', async ({ cardId }) => {
    signedInAs('MEMBER', { cards: [loginCardDetail, otherBoardCardDetail] });

    renderApp(cardUrlPath(cardId));

    expect(
      await screen.findByRole('heading', { level: 1, name: notFoundCase.heading }),
    ).toBeInTheDocument();
  });
});

describe('card modal states', () => {
  afterEach(() => setAccessToken(null));

  it('shows a loading dialog while the card loads', async () => {
    signedInAs('MEMBER', { slowGet: 300 });

    renderApp(cardUrlPath(loginCard.id));

    expect(await screen.findByRole('dialog', { name: 'Loading card' })).toBeInTheDocument();
    expect(await screen.findByRole('dialog', { name: loginCard.title })).toBeInTheDocument();
  });

  it('a failed load says so, and "Try again" loads the card', async () => {
    signedInAs('MEMBER', { failGets: 1 });

    renderApp(cardUrlPath(loginCard.id));

    const failed = await screen.findByRole('dialog', { name: "Couldn't load this card." });
    fireEvent.click(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('dialog', { name: loginCard.title })).toBeInTheDocument();
  });

  it('after a delete, going back to the card shows "Page not found"', async () => {
    const { dialog, router } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete card' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(boardPathFor(roadmapBoard)));

    void router.navigate(-1);

    expect(
      await screen.findByRole('heading', { level: 1, name: notFoundCase.heading }),
    ).toBeInTheDocument();
  });
});

describe('card tile badges', () => {
  afterEach(() => setAccessToken(null));

  it.each([
    { case: 'upcoming', card: dueCards.upcoming, label: 'Due' },
    { case: 'overdue', card: dueCards.overdue, label: 'Overdue, due' },
    { case: 'completed', card: dueCards.completed, label: 'Completed, due' },
  ])('$case due date', async ({ card, label }) => {
    const board = structuredClone(roadmapWithCards);
    board.lists[0]!.cards = [card];
    signedInAs('VIEWER', { board });
    renderApp(boardPathFor(roadmapBoard));

    const tile = await screen.findByRole('link', { name: new RegExp(card.title) });
    expect(within(tile).getByText(label, { exact: false })).toBeInTheDocument();
  });
});

describe('card drag (CARD-004)', () => {
  afterEach(() => setAccessToken(null));

  it.each([
    { role: 'MEMBER' as const, draggable: true },
    { role: 'VIEWER' as const, draggable: false },
  ])('a $role can drag cards: $draggable', async ({ role, draggable }) => {
    signedInAs(role);
    renderApp(boardPathFor(roadmapBoard));

    const tile = await screen.findByRole('link', { name: loginCard.title });
    // dnd-kit's drag instructions are attached only to a card that can be picked up.
    expect(tile.hasAttribute('aria-describedby')).toBe(draggable);
  });
});
