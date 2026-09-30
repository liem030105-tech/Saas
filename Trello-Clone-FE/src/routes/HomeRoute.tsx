import { getAccessToken } from '@/api/token-store';
import { HomePage } from '@/pages/HomePage';
import { WorkspacesHomePage } from '@/pages/WorkspacesHomePage';

import { SignedInShell } from './ProtectedRoute';

/**
 * `/` (docs/architecture/frontend.md → Routes): signed out, the public home page; signed in, the
 * first workspace, or the "Create your first workspace" screen when there is none (ADR-019).
 */
export function HomeRoute() {
  if (!getAccessToken()) return <HomePage />;
  return (
    <SignedInShell>
      <WorkspacesHomePage />
    </SignedInShell>
  );
}
