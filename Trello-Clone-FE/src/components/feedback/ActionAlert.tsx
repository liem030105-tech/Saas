import type { ReactNode } from 'react';

interface ActionAlertProps {
  /** What went wrong. */
  message: string;
  /** What the user can do about it (a link or a button); otherwise `hint` is shown. */
  action?: ReactNode;
  /** Shown when there is no `action`. */
  hint?: string;
}

/** An inline alert that says what happened and how to go on (e.g. a plan limit, docs/design/ui.md). */
export function ActionAlert({ message, action, hint }: ActionAlertProps) {
  return (
    <div role="alert" className="flex flex-col gap-1 rounded-md bg-muted px-3 py-2 text-sm">
      <p>{message}</p>
      {action || (hint && <p className="text-muted-foreground">{hint}</p>)}
    </div>
  );
}
