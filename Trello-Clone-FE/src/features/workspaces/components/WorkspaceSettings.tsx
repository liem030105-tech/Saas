import { type WorkspaceDto } from '@trello-clone/shared';

import { DeleteWorkspaceDialog } from './DeleteWorkspaceDialog';
import { WorkspaceDetailsForm } from './WorkspaceDetailsForm';
import { can } from '../permissions';

import type { ReactNode } from 'react';

export const READ_ONLY_SETTINGS_MESSAGE = 'Only workspace admins can change these settings.';

/**
 * The body of `/w/:slug/settings`: only the actions the caller's role allows are shown. `billing`
 * is the "Plan and billing" section (billing feature, BILLING-001), above the danger zone.
 */
export function WorkspaceSettings({
  workspace,
  billing,
}: {
  workspace: WorkspaceDto;
  billing?: ReactNode;
}) {
  return (
    <div className="flex max-w-xl flex-col gap-8">
      <section aria-labelledby="workspace-details-heading" className="flex flex-col gap-4">
        <h2 id="workspace-details-heading" className="text-lg font-semibold">
          Details
        </h2>
        {can(workspace.role, 'workspace.update') ? (
          <WorkspaceDetailsForm workspace={workspace} />
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{workspace.name}</dd>
              <dt className="text-muted-foreground">URL</dt>
              <dd>/w/{workspace.slug}</dd>
            </dl>
            <p className="text-sm text-muted-foreground">{READ_ONLY_SETTINGS_MESSAGE}</p>
          </>
        )}
      </section>

      {billing}

      {can(workspace.role, 'workspace.delete') && (
        <section
          aria-labelledby="workspace-danger-heading"
          className="flex flex-col gap-3 rounded-lg border border-destructive/40 p-4"
        >
          <h2 id="workspace-danger-heading" className="text-lg font-semibold">
            Delete workspace
          </h2>
          <p className="text-sm text-muted-foreground">
            Deletes the workspace and everything in it for all members.
          </p>
          <DeleteWorkspaceDialog workspace={workspace} />
        </section>
      )}
    </div>
  );
}
