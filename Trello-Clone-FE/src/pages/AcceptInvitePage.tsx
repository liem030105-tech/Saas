import { useParams } from 'react-router';

import { AcceptInvite } from '@/features/workspaces';

// `/invite/:token` (WORKSPACE-004): signed in only (ProtectedRoute sends visitors to log in first,
// then back here); accepts the invite and opens the workspace.
export function AcceptInvitePage() {
  const { token = '' } = useParams();

  return (
    <main className="flex flex-col gap-4 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Join a workspace</h1>
      <AcceptInvite token={token} />
    </main>
  );
}
