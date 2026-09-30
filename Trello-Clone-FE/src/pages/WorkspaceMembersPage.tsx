import { Link, useParams } from 'react-router';

import {
  MembersList,
  WorkspaceGate,
  workspaceMembersPath,
  workspacePath,
} from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/w/:slug/members` (WORKSPACE-003): list, change roles, remove, leave; actions follow the role.
export function WorkspaceMembersPage() {
  const { slug } = useParams();

  return (
    <WorkspaceGate slug={slug} pathFor={workspaceMembersPath} notFound={<NotFoundPage />}>
      {(workspace) => (
        <main className="flex flex-col gap-6 p-4 md:p-8">
          <div className="flex flex-col gap-1">
            <Link
              to={workspacePath(workspace.slug)}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              ← {workspace.name}
            </Link>
            <h1 className="text-2xl font-semibold">Members</h1>
          </div>
          <MembersList workspace={workspace} />
        </main>
      )}
    </WorkspaceGate>
  );
}
