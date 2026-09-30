import { Navigate, Outlet, useLocation } from 'react-router';

import { getAccessToken } from '@/api/token-store';
import { AppLayout } from '@/components/layout/AppLayout';
import { loginPathFor, useCurrentUser, useLogout } from '@/features/auth';
import { WorkspaceNav } from '@/features/workspaces';

import type { ReactNode } from 'react';

/**
 * Pages that need a session. The root loader has already tried to restore it (restoreSession),
 * so "no token" here means signed out, never "still loading": go to /login?redirectTo=<here>.
 * The token is read on render, not subscribed to: whoever clears it also navigates away
 * (handleSessionEnd on a failed refresh, useLogout on logout).
 */
export function ProtectedRoute() {
  const location = useLocation();
  if (!getAccessToken()) return <Navigate to={loginPathFor(location)} replace />;
  return (
    <SignedInShell sidebar={<WorkspaceNav />}>
      <Outlet />
    </SignedInShell>
  );
}

/** Header (with the user's menu) and optional sidebar around signed-in content. */
export function SignedInShell({ sidebar, children }: { sidebar?: ReactNode; children: ReactNode }) {
  const { data: user, isError } = useCurrentUser();
  const logout = useLogout();
  return (
    <AppLayout
      user={user}
      userError={isError}
      onLogout={() => logout.mutate()}
      loggingOut={logout.isPending}
      sidebar={sidebar}
    >
      {children}
    </AppLayout>
  );
}
