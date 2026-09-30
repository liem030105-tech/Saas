import { type WorkspaceDto } from '@trello-clone/shared';
import { Navigate } from 'react-router';

import { useWorkspaceBySlug } from '../queries';

import type { ReactNode } from 'react';

interface WorkspaceGateProps {
  slug: string | undefined;
  /** The URL of this page for a slug, used when the workspace's slug has changed. */
  pathFor: (slug: string) => string;
  /** Shown for a slug the caller has no workspace for. */
  notFound: ReactNode;
  children: (workspace: WorkspaceDto) => ReactNode;
}

/**
 * Resolves `/w/:slug` pages: a loading and an error state, `notFound` for an unknown slug, a
 * redirect to the new URL when the shown workspace's slug changed, and to `/` when it is gone
 * (deleted, or access lost; WORKSPACE-002 → Risks).
 */
export function WorkspaceGate({ slug, pathFor, notFound, children }: WorkspaceGateProps) {
  const { workspace, gone, isPending, isError, refetch } = useWorkspaceBySlug(slug);

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
  if (gone) return <Navigate to="/" replace />;
  if (!workspace) return notFound;
  if (workspace.slug !== slug) return <Navigate to={pathFor(workspace.slug)} replace />;
  return children(workspace);
}
