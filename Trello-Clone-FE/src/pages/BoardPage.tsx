import { useNavigate, useParams } from 'react-router';

import { ApiError } from '@/api/client';
import { BoardView, useBoard } from '@/features/boards';
import { can, useWorkspaces, workspacePath } from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/b/:boardId` (BOARD-002): a board the caller cannot see (or that does not exist) is a 404 from
// the API and shows "Page not found". Actions follow the caller's role in the board's workspace.
export function BoardPage() {
  const { boardId = '' } = useParams();
  const navigate = useNavigate();
  const { data: board, isPending, error, refetch } = useBoard(boardId);
  const { data: workspaces } = useWorkspaces();

  if (isPending) {
    return (
      <main aria-busy="true" className="flex flex-col gap-4 p-4 md:p-8">
        <div className="h-8 w-48 animate-pulse rounded bg-card" />
      </main>
    );
  }
  if (error) {
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return <NotFoundPage />;
    return (
      <main className="flex flex-col items-start gap-3 p-4 md:p-8">
        <p role="alert">Couldn&apos;t load this board.</p>
        <button
          type="button"
          className="text-sm font-medium underline underline-offset-4"
          onClick={() => void refetch()}
        >
          Try again
        </button>
      </main>
    );
  }

  // Until the workspace list has loaded, the board is shown read-only.
  const workspace = workspaces?.find((item) => item.id === board.workspaceId);
  const role = workspace?.role;

  return (
    <BoardView
      board={board}
      canEdit={role ? can(role, 'board.edit') : false}
      canDelete={role ? can(role, 'board.delete') : false}
      onDeleted={() => void navigate(workspace ? workspacePath(workspace.slug) : '/')}
    />
  );
}
