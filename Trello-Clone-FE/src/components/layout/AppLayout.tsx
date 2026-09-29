import { Header, type HeaderUser } from './Header';

import type { ReactNode } from 'react';

/** The signed-in app shell (docs/design/ui.md → App shell); the sidebar comes with workspaces. */
export function AppLayout({
  user,
  userError = false,
  children,
}: {
  user: HeaderUser | undefined;
  userError?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <Header user={user} userError={userError} />
      <div className="flex-1">{children}</div>
    </div>
  );
}
