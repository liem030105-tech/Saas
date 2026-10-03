import { BellIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { useCurrentUser } from '@/features/auth';
import { cardPath } from '@/features/cards';
import { workspacePath } from '@/features/workspaces';
import { formatDateTime } from '@/lib/format-date';
import { cn } from '@/lib/utils';

import { describeNotification } from '../describe';
import { useNotificationsSocket } from '../hooks/useNotificationsSocket';
import {
  useAcceptInvite,
  useMarkRead,
  useNotifications,
  useReadAll,
  useUnreadCount,
} from '../queries';

import type { NotificationDto } from '@trello-clone/shared';

/** The badge shows at most this; more reads "99+". */
const MAX_BADGE = 99;

/**
 * The header's bell (NOTIFICATIONS-001, docs/design/ui.md → Notifications): the unread count, and
 * a popover with the notifications, newest first. Opening an entry marks it read and opens its card;
 * an invite has "Accept" instead.
 */
export function NotificationBell() {
  const userId = useCurrentUser().data?.id;
  useNotificationsSocket(userId);
  const [open, setOpen] = useState(false);
  const count = useUnreadCount();
  const unread = count.data?.count ?? 0;
  const label =
    count.isError && !count.data
      ? 'Notifications, count unavailable'
      : unread > 0
        ? `Notifications, ${unread} unread`
        : 'Notifications';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="relative rounded-md p-2 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <BellIcon aria-hidden="true" className="size-5" />
          {unread > 0 && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-red-700 px-1 text-[10px] leading-4 font-semibold text-white"
            >
              {unread > MAX_BADGE ? `${MAX_BADGE}+` : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        {open && <NotificationList unread={unread} onClose={() => setOpen(false)} />}
      </PopoverContent>
    </Popover>
  );
}

/** `unread`: the server's count, which also covers notifications not loaded yet. */
function NotificationList({ unread, onClose }: { unread: number; onClose: () => void }) {
  const notifications = useNotifications(true);
  const readAll = useReadAll();
  const items = notifications.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section aria-labelledby="notifications-title" className="flex max-h-[70svh] flex-col">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <h2 id="notifications-title" className="text-sm font-semibold">
          Notifications
        </h2>
        {(unread > 0 || items.some((n) => !n.read)) && (
          <Button variant="ghost" size="sm" onClick={() => readAll.mutate()}>
            Mark all as read
          </Button>
        )}
      </div>
      <div className="overflow-y-auto">
        {notifications.isPending ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">Loading…</p>
        ) : notifications.isError ? (
          <div role="alert" className="flex flex-col items-center gap-2 px-3 py-6 text-sm">
            Couldn't load your notifications.
            <Button variant="secondary" size="sm" onClick={() => void notifications.refetch()}>
              Try again
            </Button>
          </div>
        ) : items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            You're all caught up.
          </p>
        ) : (
          <ul>
            {items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onClose={onClose}
              />
            ))}
          </ul>
        )}
        {notifications.hasNextPage && (
          <div className="border-t p-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              disabled={notifications.isFetchingNextPage}
              onClick={() => void notifications.fetchNextPage()}
            >
              {notifications.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

function NotificationItem({
  notification,
  onClose,
}: {
  notification: NotificationDto;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const markRead = useMarkRead();
  const accept = useAcceptInvite();
  const text = describeNotification(notification);
  const body = (
    <>
      {notification.actor ? (
        <UserAvatar user={notification.actor} size="sm" />
      ) : (
        <span aria-hidden="true" className="size-6 shrink-0" />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('text-sm', !notification.read && 'font-semibold')}>{text}</span>
        {notification.comment && (
          <span className="line-clamp-2 text-xs text-muted-foreground">
            {notification.comment.excerpt}
          </span>
        )}
        <span className="text-xs text-muted-foreground">
          {formatDateTime(notification.createdAt)}
          {!notification.read && <span className="sr-only">, unread</span>}
        </span>
      </span>
      {!notification.read && (
        <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-blue-600" />
      )}
    </>
  );
  const row = 'flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-muted';

  if (notification.type === 'WORKSPACE_INVITED') {
    return (
      <li className={cn(row, 'flex-col')}>
        <span className="flex w-full items-start gap-2">{body}</span>
        <Button
          size="sm"
          aria-label={`Accept invite to ${notification.workspace.name}`}
          className="ml-8"
          disabled={accept.isPending || !notification.invite}
          onClick={() =>
            notification.invite &&
            accept.mutate(notification.invite.id, {
              onSuccess: (workspace) => {
                onClose();
                void navigate(workspacePath(workspace.slug));
              },
            })
          }
        >
          {accept.isPending ? 'Accepting…' : 'Accept'}
        </Button>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        className={row}
        onClick={() => {
          if (!notification.read) markRead.mutate(notification.id);
          onClose();
          if (notification.board && notification.card) {
            void navigate(cardPath(notification.board.id, notification.card.id));
          }
        }}
      >
        {body}
      </button>
    </li>
  );
}
