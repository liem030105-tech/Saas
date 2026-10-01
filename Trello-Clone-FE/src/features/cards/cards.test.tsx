import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import {
  blankCardTitle,
  blankCardTitleMessage,
  cardServerError,
  loginCard,
  newCard,
  roadmapWithCards,
  signupCard,
} from '@/testing/data/cards';
import { doingList, todoList } from '@/testing/data/lists';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, Role } from '@trello-clone/shared';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const CARDS_URL = apiUrl(`/lists/${todoList.id}/cards`);

/** Signed in with `role`; POST …/cards is recorded and succeeds (or fails with a 500). */
function signedInAs(role: Role, board: BoardDetailDto, options: { fail?: boolean } = {}) {
  const state = { board: structuredClone(board), posts: [] as unknown[] };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARD_URL, () => HttpResponse.json({ data: state.board })),
    mswHttp.post(CARDS_URL, async ({ request }) => {
      state.posts.push(await request.json());
      // Long enough for the optimistic card to be seen before the answer lands.
      await delay(100);
      if (options.fail) return HttpResponse.json(cardServerError, { status: 500 });
      state.board.lists[0]!.cards.push(newCard.created);
      return HttpResponse.json({ data: newCard.created }, { status: 201 });
    }),
  );
  return state;
}

async function openBoard(role: Role, board: BoardDetailDto, options?: { fail?: boolean }) {
  const state = signedInAs(role, board, options);
  renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { level: 1, name: roadmapBoard.title });
  return state;
}

const cardTitles = (listTitle: string) =>
  within(screen.getByRole('region', { name: listTitle }))
    .queryAllByRole('article')
    .map((card) => card.textContent);

const openComposer = () =>
  fireEvent.click(screen.getByRole('button', { name: `Add a card to ${todoList.title}` }));

const typeAndAdd = (title: string) => {
  const field = screen.getByRole('textbox', { name: 'Card title' });
  fireEvent.change(field, { target: { value: title } });
  fireEvent.keyDown(field, { key: 'Enter' });
};

describe('cards on the board page', () => {
  afterEach(() => setAccessToken(null));

  it('shows each list’s cards in position order', async () => {
    await openBoard('VIEWER', roadmapWithCards);

    expect(cardTitles(todoList.title)).toEqual([loginCard.title, signupCard.title]);
    expect(cardTitles(doingList.title)).toEqual([]);
  });

  it('a MEMBER adds a card with Enter: it shows at once, trimmed, and no position is sent', async () => {
    const state = await openBoard('MEMBER', roadmapWithCards);

    openComposer();
    typeAndAdd(newCard.typed);

    await waitFor(() =>
      expect(cardTitles(todoList.title)).toEqual([
        loginCard.title,
        signupCard.title,
        newCard.sent.title,
      ]),
    );
    expect(screen.getByRole('textbox', { name: 'Card title' })).toHaveValue('');
    await waitFor(() => expect(state.posts).toEqual([newCard.sent]));
    await waitFor(() => expect(cardTitles(todoList.title)).toHaveLength(3));
  });

  it('a blank title shows the field error and sends nothing', async () => {
    const state = await openBoard('MEMBER', roadmapWithCards);

    openComposer();
    typeAndAdd(blankCardTitle);

    expect(await screen.findByText(blankCardTitleMessage)).toBeInTheDocument();
    expect(state.posts).toEqual([]);
  });

  it('Escape closes the composer', async () => {
    await openBoard('MEMBER', roadmapWithCards);

    openComposer();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Card title' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'Card title' })).toBeNull();
  });

  it('a failed add removes the optimistic card and says so', async () => {
    await openBoard('MEMBER', roadmapWithCards, { fail: true });

    openComposer();
    typeAndAdd(newCard.typed);

    await waitFor(() => expect(cardTitles(todoList.title)).toContain(newCard.sent.title));
    expect(await screen.findByText(cardServerError.error.message)).toBeInTheDocument();
    await waitFor(() =>
      expect(cardTitles(todoList.title)).toEqual([loginCard.title, signupCard.title]),
    );
  });

  it('a VIEWER sees the cards but no composer', async () => {
    await openBoard('VIEWER', roadmapWithCards);

    expect(cardTitles(todoList.title)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Add a card/ })).toBeNull();
  });
});
