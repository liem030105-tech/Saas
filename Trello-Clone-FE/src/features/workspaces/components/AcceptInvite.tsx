import { useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';

import { ApiError } from '@/api/client';

import { workspacePath } from '../paths';
import { useAcceptInvite } from '../queries';

export const INVITE_INVALID_MESSAGE = 'This invite is invalid or has expired.';
export const ALREADY_MEMBER_MESSAGE = "You're already a member of this workspace.";

/**
 * `/invite/:token` (signed in): accepts the invite once, then opens the workspace. Every refusal
 * but "already a member" looks the same on purpose (the API answers them with one 404).
 */
export function AcceptInvite({ token }: { token: string }) {
  const accept = useAcceptInvite();
  const navigate = useNavigate();
  const started = useRef(false);

  useEffect(() => {
    // Once per token, also under StrictMode's double effects: a link works only once.
    if (started.current) return;
    started.current = true;
    accept.mutate(token, {
      onSuccess: (workspace) => {
        toast.success(`You joined ${workspace.name}.`);
        void navigate(workspacePath(workspace.slug), { replace: true });
      },
    });
  }, [accept, navigate, token]);

  if (accept.isError) {
    const alreadyMember = accept.error instanceof ApiError && accept.error.code === 'CONFLICT';
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert">{alreadyMember ? ALREADY_MEMBER_MESSAGE : INVITE_INVALID_MESSAGE}</p>
        {!alreadyMember && (
          <p className="text-sm text-muted-foreground">
            Ask the person who invited you for a new link.
          </p>
        )}
        <Link to="/" className="text-sm font-medium underline underline-offset-4">
          Go to your workspaces
        </Link>
      </div>
    );
  }
  return (
    <p aria-busy="true" className="text-muted-foreground">
      Joining the workspace…
    </p>
  );
}
