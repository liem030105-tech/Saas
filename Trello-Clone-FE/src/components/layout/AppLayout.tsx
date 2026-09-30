import { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router';

import { Header, type HeaderUser } from './Header';
import { Sidebar } from './Sidebar';

import type { ReactNode } from 'react';

/** The signed-in app shell (docs/design/ui.md → App shell): header, sidebar, page content. */
export function AppLayout({
  user,
  userError = false,
  onLogout,
  loggingOut = false,
  sidebar,
  children,
}: {
  user: HeaderUser | undefined;
  userError?: boolean;
  onLogout: () => void;
  loggingOut?: boolean;
  /** Sidebar content; no sidebar (and no ☰ button) when omitted, e.g. the first-workspace screen. */
  sidebar?: ReactNode;
  children: ReactNode;
}) {
  // Mobile drawer state: UI-only and local to the shell, closed again on every navigation.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);
  const { pathname } = useLocation();
  useEffect(closeSidebar, [pathname, closeSidebar]);

  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <Header
        user={user}
        userError={userError}
        onLogout={onLogout}
        loggingOut={loggingOut}
        menu={
          sidebar
            ? { open: sidebarOpen, onToggle: () => setSidebarOpen((open) => !open) }
            : undefined
        }
      />
      <div className="flex flex-1">
        {sidebar && (
          <Sidebar open={sidebarOpen} onClose={closeSidebar}>
            {sidebar}
          </Sidebar>
        )}
        <div className="flex min-w-0 flex-1 flex-col">{children}</div>
      </div>
    </div>
  );
}
