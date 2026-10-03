import { Link } from 'react-router';

interface UpgradeAlertProps {
  /** The API's `402 PLAN_LIMIT_REACHED` message. */
  message: string;
  /** Where the caller can upgrade (the OWNER's billing settings); otherwise they are told whom to ask. */
  upgradeTo?: string;
}

/** A plan limit was reached (docs/design/ui.md → Upgrade prompts): what happened and how to go on. */
export function UpgradeAlert({ message, upgradeTo }: UpgradeAlertProps) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
      <p>{message}</p>
      {upgradeTo ? (
        <Link to={upgradeTo} className="font-medium underline underline-offset-4">
          Upgrade to Pro
        </Link>
      ) : (
        <p className="text-muted-foreground">Ask a workspace owner to upgrade to Pro.</p>
      )}
    </div>
  );
}
