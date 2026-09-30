import { Link, useParams } from 'react-router';

import {
  WorkspaceGate,
  workspaceMembersPath,
  workspacePath,
  workspaceSettingsPath,
} from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/w/:slug` (WORKSPACE-001): resolved from the caller's workspace list, so a slug they cannot see
// looks like an unknown page. Boards arrive with BOARD-001.
export function WorkspacePage() {
  const { slug } = useParams();

  return (
    <WorkspaceGate slug={slug} pathFor={workspacePath} notFound={<NotFoundPage />}>
      {(workspace) => (
        <main className="flex flex-col gap-4 p-4 md:p-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-semibold">{workspace.name}</h1>
            <nav aria-label="Workspace" className="flex gap-4 text-sm font-medium">
              <Link
                to={workspaceMembersPath(workspace.slug)}
                className="underline underline-offset-4"
              >
                Members
              </Link>
              <Link
                to={workspaceSettingsPath(workspace.slug)}
                className="underline underline-offset-4"
              >
                Settings
              </Link>
            </nav>
          </div>
          <p className="text-muted-foreground">No boards yet. Boards arrive in the next update.</p>
        </main>
      )}
    </WorkspaceGate>
  );
}
