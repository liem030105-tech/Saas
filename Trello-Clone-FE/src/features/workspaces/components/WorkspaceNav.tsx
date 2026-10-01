import { NavLink } from 'react-router';

import { cn } from '@/lib/utils';

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { useWorkspacesSocket } from '../hooks/useWorkspacesSocket';
import { workspacePath } from '../paths';
import { useWorkspaces } from '../queries';

/** Sidebar content: the caller's workspaces and "Create workspace" (docs/design/ui.md → App shell). */
export function WorkspaceNav() {
  useWorkspacesSocket(); // removals and member changes in real time (REALTIME-001)
  const { data: workspaces, isPending, isError, refetch } = useWorkspaces();

  return (
    <nav aria-label="Workspaces" className="flex flex-col gap-3">
      <h2 className="px-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Workspaces
      </h2>
      {isPending ? (
        <div aria-busy="true" className="flex flex-col gap-2 px-2">
          {[0, 1].map((row) => (
            <div key={row} className="h-6 animate-pulse rounded bg-muted" />
          ))}
        </div>
      ) : isError ? (
        <div role="alert" className="flex flex-col items-start gap-1 px-2 text-sm">
          <p>Couldn&apos;t load your workspaces.</p>
          <button
            type="button"
            className="font-medium underline underline-offset-4"
            onClick={() => void refetch()}
          >
            Try again
          </button>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <NavLink
                to={workspacePath(workspace.slug)}
                className={({ isActive }) =>
                  cn(
                    'block truncate rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                    isActive && 'bg-muted font-medium',
                  )
                }
              >
                {workspace.name}
              </NavLink>
            </li>
          ))}
        </ul>
      )}
      <CreateWorkspaceDialog />
    </nav>
  );
}
