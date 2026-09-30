import { useParams } from 'react-router';

import { useWorkspaceBySlug } from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/w/:slug` (WORKSPACE-001): resolved from the caller's workspace list, so a slug they cannot see
// looks like an unknown page. Boards arrive with BOARD-001.
export function WorkspacePage() {
  const { slug } = useParams();
  const { workspace, isPending, isError, refetch } = useWorkspaceBySlug(slug);

  if (isPending) {
    return (
      <main aria-busy="true" className="flex flex-col gap-4 p-4 md:p-8">
        <div className="h-8 w-48 animate-pulse rounded bg-card" />
      </main>
    );
  }
  if (isError) {
    return (
      <main className="flex flex-col items-start gap-3 p-4 md:p-8">
        <p role="alert">Couldn&apos;t load this workspace.</p>
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
  if (!workspace) return <NotFoundPage />;

  return (
    <main className="flex flex-col gap-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">{workspace.name}</h1>
      <p className="text-muted-foreground">No boards yet. Boards arrive in the next update.</p>
    </main>
  );
}
