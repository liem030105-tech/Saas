import { Navigate } from 'react-router';

import { FirstWorkspace, useWorkspaces, workspacePath } from '@/features/workspaces';

// `/` when signed in: open the first workspace, or create the first one (ADR-019).
export function WorkspacesHomePage() {
  const { data: workspaces, isPending, isError, refetch } = useWorkspaces();

  if (isPending) {
    return (
      <main aria-busy="true" className="flex flex-1 items-center justify-center p-4">
        <div className="h-48 w-full max-w-[400px] animate-pulse rounded-lg bg-card" />
      </main>
    );
  }
  if (isError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 p-4">
        <p role="alert">Couldn&apos;t load your workspaces.</p>
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
  const [first] = workspaces;
  if (first) return <Navigate to={workspacePath(first.slug)} replace />;
  return <FirstWorkspace />;
}
