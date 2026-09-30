import type { ReactNode } from 'react';

// docs/design/ui.md → App shell: a 240px sidebar. Hidden below 768px until the ☰ toggle arrives
// with the board layout; the page content stays reachable from the header and links.
export function Sidebar({ children }: { children: ReactNode }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r bg-background p-3 md:block">{children}</aside>
  );
}
