import { PlusIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { CreateBoardDialog } from './CreateBoardDialog';
import { readableTextColor } from '../colors';
import { boardPath } from '../paths';
import { useBoards } from '../queries';

interface BoardsGridProps {
  workspaceId: string;
  /** Whether the caller may create boards (UX only; the API re-checks). */
  canCreate: boolean;
}

const TILE = 'flex h-24 rounded-lg p-3 text-left font-semibold';

/**
 * The workspace's boards (docs/design/ui.md → Workspace home): colour tiles linking to the board,
 * plus a "Create board" tile for members who may create.
 */
export function BoardsGrid({ workspaceId, canCreate }: BoardsGridProps) {
  const { data: boards, isPending, isError, refetch } = useBoards(workspaceId);

  if (isPending) {
    return (
      <div aria-busy="true" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((tile) => (
          <div key={tile} className="h-24 animate-pulse rounded-lg bg-card" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">Couldn&apos;t load the boards.</p>
        <button
          type="button"
          className="text-sm font-medium underline underline-offset-4"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </div>
    );
  }
  if (boards.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-muted-foreground">No boards yet.</p>
        {canCreate && (
          <CreateBoardDialog
            workspaceId={workspaceId}
            trigger={<Button>Create your first board</Button>}
          />
        )}
      </div>
    );
  }

  return (
    <ul aria-label="Boards" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {boards.map((board) => (
        <li key={board.id}>
          <Link
            to={boardPath(board.id)}
            className={`${TILE} break-words hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
            style={{
              backgroundColor: board.background,
              color: readableTextColor(board.background),
            }}
          >
            {board.title}
          </Link>
        </li>
      ))}
      {canCreate && (
        <li>
          <CreateBoardDialog
            workspaceId={workspaceId}
            trigger={
              <button
                type="button"
                className={`${TILE} w-full items-center justify-center gap-2 bg-card font-medium text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              >
                <PlusIcon aria-hidden="true" className="size-4" />
                Create board
              </button>
            }
          />
        </li>
      )}
    </ul>
  );
}
