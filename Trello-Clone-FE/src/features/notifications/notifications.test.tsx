import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { roadmapBoard } from '@/testing/data/boards';
import { loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import {
  assignedNotification,
  commentedNotification,
  dueSoonNotification,
  invitedNotification,
  manyUnread,
  notificationReadError,
  notificationServerError,
  notificationTexts,
} from '@/testing/data/notifications';
import { acmeWorkspace, betaWorkspace, workspacePathFor } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { realtime } from '@/testing/realtime';
import { renderApp } from '@/testing/render';

import type { NotificationDto } from '@trello-clone/shared';

// NOTIFICATIONS-001c: the header's bell (docs/api/notifications.md → Frontend, docs/design/ui.md →
// Notifications), against MSW and the fake realtime connection.

/** Signed in with `notifications`; the unread count follows them. */
function signedIn(
  notifications: NotificationDto[] = [
    assignedNotification,
    commentedNotification,
    dueSoonNotification,
    invitedNotification,
  ],
  options: {
    count?: number;
    /** These requests fail with a 500 (`list` only the first time). */
    fail?: ('patch' | 'readAll' | 'list')[];
    /** The list's first page holds only this many; the rest come with "Load more". */
    pageSize?: number;
  } = {},
) {
  const state = {
    notifications: structuredClone(notifications),
    workspaces: [acmeWorkspace],
    calls: [] as string[],
    listGets: 0,
  };
  const fails = (what: 'patch' | 'readAll' | 'list') => options.fail?.includes(what) ?? false;
  const failure = () => HttpResponse.json(notificationServerError, { status: 500 });
  const unread = () => state.notifications.filter((n) => !n.read).length;
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: state.workspaces })),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: roadmapWithCards }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId'), () => HttpResponse.json({ data: loginCardDetail })),
    mswHttp.get(apiUrl('/notifications'), ({ request }) => {
      state.listGets += 1;
      if (fails('list') && state.listGets === 1) return failure();
      const cursor = new URL(request.url).searchParams.get('cursor');
      const from = cursor ? state.notifications.findIndex((n) => n.id === cursor) + 1 : 0;
      const size = options.pageSize ?? state.notifications.length;
      const data = state.notifications.slice(from, from + size);
      const more = from + size < state.notifications.length;
      return HttpResponse.json({ data, nextCursor: more ? data.at(-1)!.id : null });
    }),
    mswHttp.get(apiUrl('/notifications/unread-count'), () =>
      HttpResponse.json({ data: { count: options.count ?? unread() } }),
    ),
    mswHttp.patch(apiUrl('/notifications/:id'), async ({ params, request }) => {
      const { read } = (await request.json()) as { read: boolean };
      state.calls.push(`PATCH ${String(params.id)} ${read}`);
      if (fails('patch')) return failure();
      const n = state.notifications.find((x) => x.id === params.id)!;
      n.read = read;
      return HttpResponse.json({ data: n });
    }),
    mswHttp.post(apiUrl('/notifications/read-all'), () => {
      state.calls.push('POST read-all');
      if (fails('readAll')) return failure();
      for (const n of state.notifications) n.read = true;
      return new HttpResponse(null, { status: 204 });
    }),
    mswHttp.post(apiUrl('/invites/:inviteId/accept'), ({ params }) => {
      state.calls.push(`POST accept ${String(params.inviteId)}`);
      state.workspaces = [acmeWorkspace, betaWorkspace];
      state.notifications = state.notifications.filter((n) => n.type !== 'WORKSPACE_INVITED');
      return HttpResponse.json({ data: betaWorkspace });
    }),
  );
  return state;
}

const bell = () => screen.findByRole('button', { name: /^Notifications/ });

async function openBell() {
  fireEvent.click(await bell());
  return screen.findByRole('region', { name: 'Notifications' });
}

describe('notification bell (NOTIFICATIONS-001)', () => {
  afterEach(() => {
    setAccessToken(null);
    toast.dismiss();
  });

  it('shows the unread count, named for screen readers', async () => {
    signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications, 3 unread'));
    expect(await bell()).toHaveTextContent('3');
  });

  it('caps the badge at 99+', async () => {
    signedIn([assignedNotification], { count: manyUnread.count });
    renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(async () => expect(await bell()).toHaveTextContent(manyUnread.badge));
  });

  it('lists the notifications, newest first, with what happened and the comment excerpt', async () => {
    signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();

    const items = await within(panel).findAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining(notificationTexts.assigned),
      expect.stringContaining(notificationTexts.commented),
      expect.stringContaining(notificationTexts.dueSoon),
      expect.stringContaining(notificationTexts.invited),
    ]);
    expect(items[1]).toHaveTextContent(commentedNotification.comment!.excerpt);
    expect(items[0]).toHaveTextContent('unread');
    expect(items[1]).not.toHaveTextContent('unread');
  });

  it('empty: "You\'re all caught up." and no badge', async () => {
    signedIn([]);
    renderApp(workspacePathFor(acmeWorkspace));
    expect(await bell()).toHaveAccessibleName('Notifications');
    const panel = await openBell();
    expect(await within(panel).findByText("You're all caught up.")).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Mark all as read' })).toBeNull();
  });

  it('opening an entry marks it read and opens its card', async () => {
    const state = signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();

    fireEvent.click(
      await within(panel).findByRole('button', { name: new RegExp(notificationTexts.assigned) }),
    );

    expect(await screen.findByRole('dialog', { name: loginCardDetail.title })).toBeVisible();
    await waitFor(() => expect(state.calls).toEqual([`PATCH ${assignedNotification.id} true`]));
    // The card modal hides the header from the accessibility tree.
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Notifications/, hidden: true }),
      ).toHaveAccessibleName('Notifications, 2 unread'),
    );
  });

  it('"Mark all as read" reads them all at once', async () => {
    const state = signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();

    fireEvent.click(await within(panel).findByRole('button', { name: 'Mark all as read' }));

    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications'));
    expect(within(panel).queryByText(/unread/)).toBeNull();
    expect(state.calls).toEqual(['POST read-all']);
  });

  it('"Accept" on an invite joins the workspace and opens it', async () => {
    const state = signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();

    fireEvent.click(
      await within(panel).findByRole('button', { name: `Accept invite to ${betaWorkspace.name}` }),
    );

    await waitFor(() =>
      expect(state.calls).toEqual([`POST accept ${invitedNotification.invite!.id}`]),
    );
    expect(await screen.findByRole('heading', { name: betaWorkspace.name })).toBeVisible();
  });

  it('a live notification shows at the top and the count follows; another tab reading all clears it', async () => {
    const state = signedIn([commentedNotification]);
    renderApp(workspacePathFor(acmeWorkspace));
    expect(await bell()).toHaveAccessibleName('Notifications');
    const panel = await openBell();
    await within(panel).findByText(notificationTexts.commented);

    state.notifications.unshift(structuredClone(assignedNotification));
    realtime().serverSends('notification:created', {
      boardId: roadmapBoard.id,
      workspaceId: acmeWorkspace.id,
      actorId: assignedNotification.actor!.id,
      version: 1,
      data: assignedNotification,
    });

    expect(await within(panel).findByText(notificationTexts.assigned)).toBeVisible();
    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications, 1 unread'));

    for (const n of state.notifications) n.read = true;
    realtime().serverSends('notification:updated', {
      boardId: null,
      workspaceId: null,
      actorId: currentUser.id,
      version: 2,
      data: { all: true },
    });

    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications'));
    expect(within(panel).queryByText(/unread/)).toBeNull();
  });

  it('a failed read puts the entry and the count back, with a toast', async () => {
    signedIn(undefined, { fail: ['patch'] });
    renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications, 3 unread'));
    const panel = await openBell();

    fireEvent.click(
      await within(panel).findByRole('button', { name: new RegExp(notificationTexts.assigned) }),
    );

    expect(await screen.findByText(notificationReadError)).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^Notifications/, hidden: true }),
      ).toHaveAccessibleName('Notifications, 3 unread'),
    );
  });

  it('a failed "Mark all as read" shows a toast and refetches the list', async () => {
    const state = signedIn(undefined, { fail: ['readAll'] });
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();
    await within(panel).findByText(notificationTexts.assigned);

    fireEvent.click(within(panel).getByRole('button', { name: 'Mark all as read' }));

    expect(await screen.findByText(notificationReadError)).toBeVisible();
    await waitFor(() => expect(state.listGets).toBe(2));
    expect(await within(panel).findAllByText(/unread/)).not.toHaveLength(0);
  });

  it('"Mark all as read" shows while unread ones are not loaded yet; "Load more" brings them', async () => {
    signedIn([commentedNotification, assignedNotification], { pageSize: 1 });
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();
    await within(panel).findByText(notificationTexts.commented);
    // Only the read one is loaded, but the count says one is unread.
    expect(await within(panel).findByRole('button', { name: 'Mark all as read' })).toBeVisible();

    fireEvent.click(within(panel).getByRole('button', { name: 'Load more' }));

    expect(await within(panel).findByText(notificationTexts.assigned)).toBeVisible();
    expect(within(panel).queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('a failed load shows an error with "Try again"', async () => {
    signedIn(undefined, { fail: ['list'] });
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();

    const alert = await within(panel).findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't load your notifications.");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));

    expect(await within(panel).findByText(notificationTexts.assigned)).toBeVisible();
  });

  it('live: the same notification twice shows once; another tab reading one marks it read; a reconnect refetches', async () => {
    const state = signedIn([assignedNotification]);
    renderApp(workspacePathFor(acmeWorkspace));
    const panel = await openBell();
    await within(panel).findByText(notificationTexts.assigned);
    const envelope = {
      boardId: roadmapBoard.id,
      workspaceId: acmeWorkspace.id,
      actorId: assignedNotification.actor!.id,
      version: 1,
    };

    // Already in the list, and sent again under another event id: still one entry.
    realtime().serverSends('notification:created', { ...envelope, data: assignedNotification });
    realtime().serverSends('notification:created', { ...envelope, data: assignedNotification });
    // A different one after them: once it shows, the duplicates have been handled.
    realtime().serverSends('notification:created', { ...envelope, data: commentedNotification });
    expect(await within(panel).findByText(notificationTexts.commented)).toBeVisible();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(2);

    state.notifications[0]!.read = true;
    realtime().serverSends('notification:updated', {
      ...envelope,
      actorId: currentUser.id,
      data: { notificationId: assignedNotification.id, read: true },
    });
    await waitFor(() => expect(within(panel).queryByText(/unread/)).toBeNull());
    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications'));

    const gets = state.listGets;
    realtime().reconnect();
    await waitFor(() => expect(state.listGets).toBeGreaterThan(gets));
  });
});
