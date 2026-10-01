import { useNavigate, useParams } from 'react-router';

import { ApiError } from '@/api/client';
import { BoardView, boardPath, useBoard } from '@/features/boards';
import { CardDetailModal, CardModalStatus, useCard } from '@/features/cards';
import { BoardLists } from '@/features/lists';
import { can, useWorkspaces, workspacePath } from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/b/:boardId` (BOARD-002): a board the caller cannot see (or that does not exist) is a 404 from
// the API and shows "Page not found". Actions follow the caller's role in the board's workspace;
// the lists (LIST-001) come from the lists feature. `/b/:boardId/c/:cardId` (CARD-002) opens the
// card modal over the board; a card that is not visible (or is on another board) is a 404 too.
export function BoardPage() {
  const { boardId = '', cardId } = useParams();
  const navigate = useNavigate();
  const { data: board, isPending, error, refetch } = useBoard(boardId);
  const { data: workspaces, isPending: workspacesPending } = useWorkspaces();
  const card = useCard(cardId);

  // Wait for the caller's role too, so the actions shown are final from the first render.
  if (isPending || workspacesPending) {
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

  const cardNotFound =
    (card.error instanceof ApiError && card.error.code === 'NOT_FOUND') ||
    (card.data !== undefined && card.data.boardId !== board.id);
  if (cardNotFound) return <NotFoundPage />;

  // A board the API shows belongs to one of the caller's workspaces; if the list is somehow stale,
  // the board is shown read-only.
  const workspace = workspaces?.find((item) => item.id === board.workspaceId);
  const role = workspace?.role;

  const canEditContent = !board.archived && (role ? can(role, 'card.edit') : false);
  const closeCard = () => void navigate(boardPath(board.id));

  return (
    <BoardView
      board={board}
      canEdit={role ? can(role, 'board.edit') : false}
      canDelete={role ? can(role, 'board.delete') : false}
      onDeleted={() => void navigate(workspace ? workspacePath(workspace.slug) : '/')}
    >
      {/* An archived board is read-only (docs/design/ui.md → Board). */}
      <BoardLists
        board={board}
        canEdit={!board.archived && (role ? can(role, 'list.manage') : false)}
      />
      {card.data ? (
        <CardDetailModal
          card={card.data}
          listTitle={board.lists.find((list) => list.id === card.data.listId)?.title}
          canEdit={canEditContent}
          onClose={closeCard}
        />
      ) : (
        cardId && (
          <CardModalStatus
            status={card.error ? 'error' : 'loading'}
            onRetry={() => void card.refetch()}
            onClose={closeCard}
          />
        )
      )}
    </BoardView>
  );
}
