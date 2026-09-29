import { Navigate, Outlet, useLocation } from 'react-router';

import { getAccessToken } from '@/api/token-store';
import { AppLayout } from '@/components/layout/AppLayout';
import { loginPathFor, useCurrentUser } from '@/features/auth';

/**
 * Pages that need a session. The root loader has already tried to restore it (restoreSession),
 * so "no token" here means signed out, never "still loading": go to /login?redirectTo=<here>.
 */
export function ProtectedRoute() {
  const location = useLocation();
  if (!getAccessToken()) return <Navigate to={loginPathFor(location)} replace />;
  return <SignedInShell />;
}

function SignedInShell() {
  const { data: user, isError } = useCurrentUser();
  return (
    <AppLayout user={user} userError={isError}>
      <Outlet />
    </AppLayout>
  );
}
