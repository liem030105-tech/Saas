import { HistoryIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { ActivityFeed } from './ActivityFeed';
import { namesOf } from '../activity';

import type { BoardDetailDto, UserSummary } from '@trello-clone/shared';

interface ActivityDrawerProps {
  board: BoardDetailDto;
  /** The workspace's members, to name the people an entry is about. */
  members: readonly UserSummary[];
}

/**
 * "Activity" in the board header (docs/design/ui.md → Board): a panel on the right with the
 * board's activity feed. Every member sees it, a VIEWER included.
 */
export function ActivityDrawer({ board, members }: ActivityDrawerProps) {
  const [open, setOpen] = useState(false);
  const names = useMemo(() => namesOf(board, members), [board, members]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm">
          <HistoryIcon aria-hidden="true" />
          Activity
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 right-0 left-auto flex h-svh max-w-sm translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none sm:max-w-sm">
        <div className="flex flex-col gap-1 pr-6">
          <DialogTitle>Activity</DialogTitle>
          <DialogDescription>
            Everything that happened on {board.title}, newest first.
          </DialogDescription>
        </div>
        {/* Mounted only while open; the feed refetches on mount, so it is fresh each time. */}
        {open && <ActivityFeed boardId={board.id} names={names} />}
      </DialogContent>
    </Dialog>
  );
}
