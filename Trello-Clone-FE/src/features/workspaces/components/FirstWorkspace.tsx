import { useNavigate } from 'react-router';

import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { workspacePath } from '../paths';

/** Shown on `/` to a signed-in user without a workspace (ADR-019): they name their first one. */
export function FirstWorkspace() {
  const navigate = useNavigate();

  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-semibold">Create your first workspace</h1>
          <p className="text-muted-foreground">
            A workspace holds your team&apos;s boards. You can invite people later.
          </p>
        </div>
        <CreateWorkspaceForm
          autoFocus
          onCreated={(workspace) => void navigate(workspacePath(workspace.slug), { replace: true })}
        />
      </div>
    </main>
  );
}
