import { Link } from 'react-router';

import { ActionAlert } from '@/components/feedback/ActionAlert';

import { workspaceBillingPath } from '../paths';
import { can } from '../permissions';
import { useWorkspaces } from '../queries';

export const ASK_OWNER_TO_UPGRADE = 'Ask a workspace owner to upgrade to Pro.';

/** A form's `errors.root.type` for a `402 PLAN_LIMIT_REACHED`: shown as an UpgradePrompt. */
export const PLAN_LIMIT_ERROR = 'planLimit';

/**
 * A `402 PLAN_LIMIT_REACHED` (BILLING-001, docs/design/ui.md → Upgrade prompts): the API's message,
 * and "Upgrade to Pro" (the settings' billing section) for an OWNER, or whom to ask for others.
 */
export function UpgradePrompt({ workspaceId, message }: { workspaceId: string; message: string }) {
  const workspace = useWorkspaces().data?.find((item) => item.id === workspaceId);
  const canUpgrade = workspace && can(workspace.role, 'billing.manage');
  return (
    <ActionAlert
      message={message}
      action={
        canUpgrade && (
          <Link
            to={workspaceBillingPath(workspace.slug)}
            className="font-medium underline underline-offset-4"
          >
            Upgrade to Pro
          </Link>
        )
      }
      hint={ASK_OWNER_TO_UPGRADE}
    />
  );
}
