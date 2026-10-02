import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken, serverErrorBody } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, signupCard } from '@/testing/data/cards';
import { roadmapWithLabels } from '@/testing/data/labels';
import { searchFilters, searchResults } from '@/testing/data/search';
import { acmeAs, ownerMember } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';
import { renderApp } from '@/testing/render';

import { useBoardFiltersStore } from './store';

import type { CardSummaryDto } from '@trello-clone/shared';

// SEARCH-001: the board toolbar searches the board's cards; matching tiles are highlighted and the
// others dimmed (docs/design/ui.md → Board). The search itself is the API's (docs/api/boards.md).

function signedIn(answer: () => CardSummaryDto[] | Response = () => searchResults.login) {
  const searches: URLSearchParams[] = [];
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs('VIEWER')] })),
    mswHttp.get(apiUrl(`/workspaces/${roadmapBoard.workspaceId}/members`), () =>
      HttpResponse.json({ data: [ownerMember] }),
    ),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: roadmapWithLabels }),
    ),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}/search`), ({ request }) => {
      searches.push(new URL(request.url).searchParams);
      const result = answer();
      return result instanceof Response ? result : HttpResponse.json({ data: result });
    }),
  );
  return searches;
}

/** The board page, once its realtime join (which refetches the board) has settled. */
async function openBoard() {
  const { queryClient } = renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { name: 'To do', level: 2 });
  await waitFor(() =>
    expect(realtime().sent).toContain(`board:join {"boardId":"${roadmapBoard.id}"}`),
  );
  await waitFor(() => expect(queryClient.isFetching()).toBe(0));
  await new Promise((resolve) => setTimeout(resolve, 350)); // past the re-search pause
}

const tile = (title: string) => screen.getByRole('article', { name: title });

describe('board search and filters (SEARCH-001)', () => {
  afterEach(() => {
    setAccessToken(null);
    useBoardFiltersStore.setState({ byBoard: {} });
  });

  it('text and label: matching cards are highlighted, the others dimmed; clearing restores the board', async () => {
    const searches = signedIn();
    await openBoard();
    // No filter: no search, nothing dimmed (a VIEWER can filter too).
    expect(tile(loginCard.title)).not.toHaveAccessibleDescription();
    expect(searches).toHaveLength(0);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cards' }), {
      target: { value: searchFilters.text.typed },
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Label' }), {
      target: { value: searchFilters.label.sent },
    });

    expect(await screen.findByText('1 card matches.')).toHaveAttribute('role', 'status');
    expect(tile(loginCard.title)).toHaveAccessibleDescription('Matches the filters');
    expect(tile(signupCard.title)).toHaveAccessibleDescription("Doesn't match the filters");
    await waitFor(() => expect(searches.at(-1)!.get('q')).toBe(searchFilters.text.sent));
    expect(searches.at(-1)!.get('labelId')).toBe(searchFilters.label.sent);
    expect(
      within(screen.getByRole('combobox', { name: 'Label' })).getByRole('option', {
        name: searchFilters.label.option,
      }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    // At once, not after the typing pause.
    expect(tile(signupCard.title)).not.toHaveAccessibleDescription();
    expect(tile(loginCard.title)).not.toHaveAccessibleDescription();
    expect(screen.queryByText(/cards? match/)).toBeNull();
    expect(screen.getByRole('searchbox', { name: 'Search cards' })).toHaveValue('');
    expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
  });

  it('the due filter is sent; nothing matching says so', async () => {
    const searches = signedIn(() => searchResults.none);
    await openBoard();

    fireEvent.change(screen.getByRole('combobox', { name: 'Due date' }), {
      target: { value: searchFilters.due.sent },
    });

    expect(await screen.findByText('No cards match.')).toHaveAttribute('role', 'status');
    expect(searches.at(-1)!.get('due')).toBe(searchFilters.due.sent);
    expect(tile(loginCard.title)).toHaveAccessibleDescription("Doesn't match the filters");
  });

  it('a change to the board (a realtime event) searches again', async () => {
    let answer = searchResults.login;
    const searches = signedIn(() => answer);
    await openBoard();
    fireEvent.change(screen.getByRole('combobox', { name: 'Due date' }), {
      target: { value: searchFilters.due.sent },
    });
    await screen.findByText('1 card matches.');

    answer = searchResults.both;
    realtime().serverSends('card:updated', {
      boardId: roadmapBoard.id,
      workspaceId: roadmapBoard.workspaceId,
      actorId: ownerMember.user.id,
      version: Date.parse('2026-10-01T00:00:00.000Z'),
      data: { ...signupCard, title: 'Sign-up form (late)', archived: false },
    });

    expect(await screen.findByText('2 cards match.')).toBeVisible();
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(searches).toHaveLength(2); // one more search for the change, not one per render
  });

  it('a failed search says so and can be retried', async () => {
    let fail = true;
    signedIn(() =>
      fail ? HttpResponse.json(serverErrorBody, { status: 500 }) : searchResults.login,
    );
    await openBoard();
    fireEvent.change(screen.getByRole('combobox', { name: 'Due date' }), {
      target: { value: searchFilters.due.sent },
    });

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent("Couldn't search the cards.");
    fail = false;
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('1 card matches.')).toBeVisible();
  });

  it('typing searches once it pauses; the member filter is sent', async () => {
    const searches = signedIn();
    await openBoard();
    const box = screen.getByRole('searchbox', { name: 'Search cards' });

    for (const value of searchFilters.keystrokes) fireEvent.change(box, { target: { value } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Member' }), {
      target: { value: ownerMember.user.id },
    });

    await screen.findByText('1 card matches.');
    await new Promise((resolve) => setTimeout(resolve, 400));
    // Every search carries the member; the text only once typing paused, never half-typed. (The
    // board's own refetch when it joins its realtime room may search once more.)
    expect(searches.every((params) => params.get('memberId') === ownerMember.user.id)).toBe(true);
    expect(new Set(searches.map((params) => params.get('q')))).toEqual(
      new Set([null, searchFilters.keystrokes.at(-1)]),
    );
    expect(searches.at(-1)!.get('q')).toBe(searchFilters.keystrokes.at(-1));
  });

  it('after Clear, a new filter never shows the old matches while it searches', async () => {
    let release!: () => void;
    let gate: Promise<void> | null = null;
    const searches = signedIn();
    server.use(
      mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}/search`), async ({ request }) => {
        searches.push(new URL(request.url).searchParams);
        if (gate) await gate;
        return HttpResponse.json({ data: searchResults.login });
      }),
    );
    await openBoard();
    fireEvent.change(screen.getByRole('combobox', { name: 'Label' }), {
      target: { value: searchFilters.label.sent },
    });
    await screen.findByText('1 card matches.');

    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    gate = new Promise((resolve) => (release = resolve));
    fireEvent.change(screen.getByRole('combobox', { name: 'Due date' }), {
      target: { value: searchFilters.due.sent },
    });

    expect(await screen.findByText('Searching…')).toBeVisible();
    expect(tile(loginCard.title)).not.toHaveAccessibleDescription();
    release();
    expect(await screen.findByText('1 card matches.')).toBeVisible();
  });
});
