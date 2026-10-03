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
  options: { count?: number } = {},
) {
  const state = {
    notifications: structuredClone(notifications),
    workspaces: [acmeWorkspace],
    calls: [] as string[],
  };
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
    mswHttp.get(apiUrl('/notifications'), () =>
      HttpResponse.json({ data: state.notifications, nextCursor: null }),
    ),
    mswHttp.get(apiUrl('/notifications/unread-count'), () =>
      HttpResponse.json({ data: { count: options.count ?? unread() } }),
    ),
    mswHttp.patch(apiUrl('/notifications/:id'), async ({ params, request }) => {
      const { read } = (await request.json()) as { read: boolean };
      state.calls.push(`PATCH ${String(params.id)} ${read}`);
      const n = state.notifications.find((x) => x.id === params.id)!;
      n.read = read;
      return HttpResponse.json({ data: n });
    }),
    mswHttp.post(apiUrl('/notifications/read-all'), () => {
      state.calls.push('POST read-all');
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

  it('shows the unread count, named for screen readers; 99+ above 99; none at 0', async () => {
    signedIn();
    renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(async () => expect(await bell()).toHaveAccessibleName('Notifications, 3 unread'));
    expect(await bell()).toHaveTextContent('3');
  });

  it('caps the badge at 99+', async () => {
    signedIn([assignedNotification], { count: 150 });
    renderApp(workspacePathFor(acmeWorkspace));
    await waitFor(async () => expect(await bell()).toHaveTextContent('99+'));
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

    fireEvent.click(await within(panel).findByRole('button', { name: 'Accept' }));

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
});
