import { Link, useParams } from 'react-router';

import { BillingSection } from '@/features/billing';
import {
  can,
  WorkspaceGate,
  WorkspaceSettings,
  workspacePath,
  workspaceSettingsPath,
} from '@/features/workspaces';

import { NotFoundPage } from './NotFoundPage';

// `/w/:slug/settings` (WORKSPACE-002): rename, change the URL, delete; plan and billing for
// ADMIN and OWNER (BILLING-001); actions follow the role.
export function WorkspaceSettingsPage() {
  const { slug } = useParams();

  return (
    <WorkspaceGate slug={slug} pathFor={workspaceSettingsPath} notFound={<NotFoundPage />}>
      {(workspace) => (
        <main className="flex flex-col gap-6 p-4 md:p-8">
          <div className="flex flex-col gap-1">
            <Link
              to={workspacePath(workspace.slug)}
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
            >
              ← {workspace.name}
            </Link>
            <h1 className="text-2xl font-semibold">Workspace settings</h1>
          </div>
          <WorkspaceSettings
            workspace={workspace}
            billing={
              can(workspace.role, 'billing.view') && <BillingSection workspace={workspace} />
            }
          />
        </main>
      )}
    </WorkspaceGate>
  );
}
