import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { BoardsGrid } from '@/features/boards';
import {
  can,
  WorkspaceGate,
  workspaceBillingPath,
  workspaceMembersPath,
  workspacePath,
  workspaceSettingsPath,
} from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/w/:slug` (WORKSPACE-001): resolved from the caller's workspace list, so a slug they cannot see
// looks like an unknown page. Shows the workspace's boards (BOARD-001).
export function WorkspacePage() {
  const { slug } = useParams();
  const [showArchived, setShowArchived] = useState(false);

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
          <section aria-labelledby="boards-heading" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="boards-heading" className="text-lg font-semibold">
                {showArchived ? 'Archived boards' : 'Boards'}
              </h2>
              <button
                type="button"
                aria-pressed={showArchived}
                className="text-sm font-medium underline underline-offset-4"
                onClick={() => setShowArchived((shown) => !shown)}
              >
                {showArchived ? 'Show open boards' : 'Show archived boards'}
              </button>
            </div>
            <BoardsGrid
              workspaceId={workspace.id}
              canCreate={can(workspace.role, 'board.edit')}
              archived={showArchived}
              upgradeTo={
                can(workspace.role, 'billing.manage')
                  ? workspaceBillingPath(workspace.slug)
                  : undefined
              }
            />
          </section>
        </main>
      )}
    </WorkspaceGate>
  );
}
