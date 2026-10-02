import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router';

import { ApiError } from '@/api/client';
import { useCurrentUser } from '@/features/auth';
import {
  BoardFilterBar,
  BoardView,
  boardPath,
  namesOf,
  useBoard,
  useBoardSearch,
  useBoardSocket,
} from '@/features/boards';
import {
  CardDetailModal,
  CardModalStatus,
  CardTileProvider,
  labelText,
  useCard,
} from '@/features/cards';
import { BoardLists } from '@/features/lists';
import { can, useMembers, useWorkspaces, workspacePath } from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/b/:boardId` (BOARD-002): a board the caller cannot see (or that does not exist) is a 404 from
// the API and shows "Page not found". Actions follow the caller's role in the board's workspace;
// the lists (LIST-001) come from the lists feature. `/b/:boardId/c/:cardId` (CARD-002) opens the
// card modal over the board; a card that is not visible (or is on another board) is a 404 too.
export function BoardPage() {
  const { boardId = '', cardId } = useParams();
  const navigate = useNavigate();
  const { data: board, dataUpdatedAt, isPending, error, refetch } = useBoard(boardId);
  const { data: workspaces, isPending: workspacesPending } = useWorkspaces();
  const card = useCard(cardId);
  const currentUser = useCurrentUser(); // the author of their own comments (CARD-005d)
  // Everyone else's changes to this board arrive as they happen (REALTIME-001).
  // Removed from its workspace meanwhile: back to the start (realtime.md → Removed from workspace).
  useBoardSocket(boardId, currentUser.data?.id, () => void navigate('/', { replace: true }));
  // Who can be assigned to cards, and whose avatars the tiles show (CARD-005b).
  const members = useMembers(board?.workspaceId ?? '');
  const workspaceMembers = useMemo(
    () => members.data?.map(({ user: { id, name, avatarUrl } }) => ({ id, name, avatarUrl })),
    [members.data],
  );
  // The board's filters (SEARCH-001): matching cards are highlighted, the others dimmed.
  const search = useBoardSearch(boardId, dataUpdatedAt);
  const { matches } = search;
  const tileData = useMemo(
    () => ({ labels: board?.labels ?? [], members: workspaceMembers ?? [], matches }),
    [board?.labels, workspaceMembers, matches],
  );
  // Who and what activity entries name (CARD-005e): the board's lists, cards and labels.
  const activityNames = useMemo(
    () => namesOf(board, tileData.members, labelText),
    [board, tileData.members],
  );

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
      activityNames={activityNames}
    >
      <BoardFilterBar
        boardId={board.id}
        labels={board.labels.map((label) => ({ id: label.id, name: labelText(label) }))}
        members={(workspaceMembers ?? []).map((user) => ({ id: user.id, name: user.name }))}
        result={search}
      />
      {/* An archived board is read-only (docs/design/ui.md → Board). */}
      <CardTileProvider value={tileData}>
        <BoardLists
          board={board}
          canEdit={!board.archived && (role ? can(role, 'list.manage') : false)}
        />
      </CardTileProvider>
      {card.data ? (
        <CardDetailModal
          card={card.data}
          listTitle={board.lists.find((list) => list.id === card.data.listId)?.title}
          boardLabels={board.labels}
          workspaceMembers={{
            list: workspaceMembers,
            failed: members.isError,
            retry: () => void members.refetch(),
          }}
          canEdit={canEditContent}
          activityNames={activityNames}
          commentAccess={{
            user: currentUser.data && {
              id: currentUser.data.id,
              name: currentUser.data.name,
              avatarUrl: currentUser.data.avatarUrl,
            },
            canComment: !board.archived && (role ? can(role, 'comment.create') : false),
            canDeleteAny: !board.archived && (role ? can(role, 'comment.deleteAny') : false),
          }}
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
