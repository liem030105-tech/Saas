import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatDateTime } from '@/lib/format-date';

import { describeActivity, type ActivityNames } from '../activity';
import { useActivities } from '../queries';

interface ActivityFeedProps {
  boardId: string;
  /** Only this card's entries (the card modal's "Show details"); the whole board without it. */
  cardId?: string;
  names: ActivityNames;
}

/**
 * An activity feed (docs/design/ui.md → Activity), newest first: who did what, and when, with
 * "Load more activity" for older entries.
 */
export function ActivityFeed({ boardId, cardId, names }: ActivityFeedProps) {
  const activities = useActivities(boardId, cardId);
  const entries = activities.data?.pages.flatMap((page) => page.data) ?? [];

  if (activities.isPending) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading activity…
      </p>
    );
  }
  if (activities.isError && entries.length === 0) {
    return (
      <div role="alert" className="flex items-center gap-2 text-sm">
        Couldn&apos;t load the activity.
        <Button variant="secondary" size="sm" onClick={() => void activities.refetch()}>
          Try again
        </Button>
      </div>
    );
  }
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No activity yet.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <ol aria-label="Activity" className="flex flex-col gap-3">
        {entries.map((activity) => (
          <li key={activity.id} className="flex gap-2 text-sm">
            <UserAvatar user={activity.user} size="sm" className="mt-0.5 shrink-0" />
            <p className="min-w-0 break-words">
              <span className="font-semibold">{activity.user.name}</span>{' '}
              {describeActivity(activity, { ...names, cardId })}
              <time dateTime={activity.createdAt} className="block text-xs text-muted-foreground">
                {formatDateTime(activity.createdAt)}
              </time>
            </p>
          </li>
        ))}
      </ol>
      {activities.hasNextPage && (
        <Button
          variant="secondary"
          size="sm"
          className="self-start"
          disabled={activities.isFetchingNextPage}
          onClick={() => void activities.fetchNextPage()}
        >
          {activities.isFetchingNextPage ? 'Loading…' : 'Load more activity'}
        </Button>
      )}
      {activities.isFetchNextPageError && (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load more activity. Try again.
        </p>
      )}
    </div>
  );
}
