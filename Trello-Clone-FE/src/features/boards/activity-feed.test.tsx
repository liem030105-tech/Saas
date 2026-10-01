import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { roadmapActivity } from '@/testing/data/activities';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken, serverErrorBody } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import { myComment } from '@/testing/data/comments';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { ActivityDto, Role } from '@trello-clone/shared';

/** Signed in with `role` on the roadmap board; the API pages the feed two entries at a time. */
function signedInAs(role: Role, options: { feed?: ActivityDto[]; failFeed?: boolean } = {}) {
  const feed = options.feed ?? roadmapActivity;
  const state = { calls: [] as string[] };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: roadmapWithCards }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId'), () => HttpResponse.json({ data: loginCardDetail })),
    mswHttp.patch(apiUrl('/cards/:cardId'), () => HttpResponse.json({ data: loginCardDetail })),
    mswHttp.post(apiUrl('/cards/:cardId/comments'), () =>
      HttpResponse.json({ data: myComment }, { status: 201 }),
    ),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}/activities`), ({ request }) => {
      const params = new URL(request.url).searchParams;
      const cardId = params.get('cardId');
      const cursor = params.get('cursor');
      state.calls.push(`GET${cardId ? ` card` : ''}${cursor ? ` after ${cursor}` : ''}`);
      if (options.failFeed) return HttpResponse.json(serverErrorBody, { status: 500 });
      const entries = cardId ? feed.filter((a) => a.cardId === cardId) : feed;
      const start = cursor ? entries.findIndex((a) => a.id === cursor) + 1 : 0;
      const page = entries.slice(start, start + 2);
      const more = start + 2 < entries.length;
      return HttpResponse.json({ data: page, nextCursor: more ? page.at(-1)!.id : null });
    }),
  );
  return state;
}

/** Each entry's sentence ("Ada Owner moved …"), without its time. */
const entriesIn = (scope: HTMLElement) =>
  within(within(scope).getByRole('list', { name: 'Activity' }))
    .getAllByRole('listitem')
    .map((item) => {
      const sentence = item.querySelector('p')!.cloneNode(true) as HTMLElement;
      sentence.querySelector('time')!.remove();
      return sentence.textContent;
    });

async function openDrawer(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(boardPathFor(roadmapBoard));
  fireEvent.click(await screen.findByRole('button', { name: 'Activity' }));
  const drawer = await screen.findByRole('dialog', { name: 'Activity' });
  return { state, drawer };
}

describe('activity feed (CARD-005e)', () => {
  afterEach(() => setAccessToken(null));

  it('a VIEWER opens the board activity: who did what, newest first, page by page', async () => {
    const { state, drawer } = await openDrawer('VIEWER');

    await within(drawer).findByRole('list', { name: 'Activity' });
    expect(entriesIn(drawer)).toEqual([
      'Ada Owner moved Fix login from To do to Doing',
      'Ada Owner added Linus Member to Fix login',
    ]);

    fireEvent.click(within(drawer).getByRole('button', { name: 'Load more activity' }));
    await waitFor(() => expect(entriesIn(drawer)).toHaveLength(4));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Load more activity' }));
    await waitFor(() => expect(entriesIn(drawer)).toHaveLength(5));

    expect(entriesIn(drawer).slice(2)).toEqual([
      'Ada Owner added Fix login to To do',
      'Ada Owner added list To do',
      'Ada Owner created this board',
    ]);
    expect(within(drawer).queryByRole('button', { name: 'Load more activity' })).toBeNull();
    expect(state.calls).toEqual([
      'GET',
      `GET after ${roadmapActivity[1]!.id}`,
      `GET after ${roadmapActivity[3]!.id}`,
    ]);
  });

  it('reopening the board activity fetches it again, even while it is fresh', async () => {
    const state = signedInAs('VIEWER');
    const { queryClient } = renderApp(boardPathFor(roadmapBoard));
    // As in the app (lib/query-client.ts): data stays fresh for 30 s.
    queryClient.setDefaultOptions({ queries: { retry: false, staleTime: 30_000 } });
    fireEvent.click(await screen.findByRole('button', { name: 'Activity' }));
    const drawer = await screen.findByRole('dialog', { name: 'Activity' });
    await within(drawer).findByRole('list', { name: 'Activity' });

    fireEvent.click(within(drawer).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Activity' })).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Activity' }));

    await waitFor(() => expect(state.calls).toEqual(['GET', 'GET']));
  });

  it('a board without activity says so', async () => {
    const { drawer } = await openDrawer('MEMBER', { feed: [] });

    expect(await within(drawer).findByText('No activity yet.')).toBeVisible();
  });

  it('a failed load offers "Try again"', async () => {
    const { state, drawer } = await openDrawer('MEMBER', { failFeed: true });

    expect(await within(drawer).findByRole('alert')).toHaveTextContent(
      "Couldn't load the activity.",
    );
    fireEvent.click(within(drawer).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(state.calls.length).toBeGreaterThan(1));
  });

  it('"Show details" in the card modal lists the card’s own activity as "this card"', async () => {
    const state = signedInAs('VIEWER');
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    const activity = within(dialog).getByRole('region', { name: 'Activity' });

    fireEvent.click(within(activity).getByRole('button', { name: 'Show details' }));

    await within(activity).findByRole('list', { name: 'Activity' });
    expect(entriesIn(activity)).toEqual([
      'Ada Owner moved this card from To do to Doing',
      'Ada Owner added Linus Member to this card',
    ]);
    expect(state.calls).toEqual(['GET card']);

    fireEvent.click(within(activity).getByRole('button', { name: 'Hide details' }));
    expect(within(activity).queryByRole('list', { name: 'Activity' })).toBeNull();
  });

  it('the card’s activity is fetched again after the card changes', async () => {
    const state = signedInAs('MEMBER');
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    const activity = within(dialog).getByRole('region', { name: 'Activity' });
    fireEvent.click(within(activity).getByRole('button', { name: 'Show details' }));
    await within(activity).findByRole('list', { name: 'Activity' });

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Complete' }));

    await waitFor(() => expect(state.calls).toEqual(['GET card', 'GET card']));
  });

  it('the card’s activity is fetched again after a comment is added', async () => {
    const state = signedInAs('MEMBER');
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    const activity = within(dialog).getByRole('region', { name: 'Activity' });
    fireEvent.click(within(activity).getByRole('button', { name: 'Show details' }));
    await within(activity).findByRole('list', { name: 'Activity' });

    fireEvent.change(within(activity).getByRole('textbox', { name: 'Write a comment' }), {
      target: { value: 'Done' },
    });
    fireEvent.click(within(activity).getByRole('button', { name: 'Comment' }));

    await waitFor(() => expect(state.calls).toEqual(['GET card', 'GET card']));
  });
});
