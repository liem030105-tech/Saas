import { useEffect, type ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SidebarProps {
  /** Below 768px the sidebar is a drawer opened with the header's ☰ button. */
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

// docs/design/ui.md → App shell: a 240px sidebar, hidden behind ☰ below 768px.
export function Sidebar({ open, onClose, children }: SidebarProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          className="fixed inset-0 top-12 z-30 bg-black/40 md:hidden"
          onClick={onClose}
        />
      )}
      <aside
        id="app-sidebar"
        className={cn(
          'w-60 shrink-0 border-r bg-background p-3 md:block',
          open ? 'fixed top-12 bottom-0 left-0 z-40 block overflow-y-auto' : 'hidden',
        )}
      >
        {children}
      </aside>
    </>
  );
}
