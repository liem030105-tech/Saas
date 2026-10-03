import { KanbanSquareIcon, RadioIcon, ShieldCheckIcon } from 'lucide-react';
import { Link } from 'react-router';

import { PublicHeader } from '@/components/layout/PublicHeader';
import { Button } from '@/components/ui/button';

const FEATURES = [
  {
    icon: KanbanSquareIcon,
    title: 'Boards, lists and cards',
    text: 'Drag cards between lists, add due dates, labels, checklists, comments and files.',
  },
  {
    icon: RadioIcon,
    title: 'Live for everyone',
    text: 'Changes show up for your whole team as they happen, with notifications for what matters to you.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Roles and workspaces',
    text: 'Invite your team as owners, admins, members or viewers; each workspace keeps its own boards.',
  },
];

// `/` signed out (BILLING-001, ADR-022; docs/design/ui.md → Public pages). Signed in, `/` opens
// the workspaces instead (routes/HomeRoute.tsx).
export function HomePage() {
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <PublicHeader signedIn={false} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-12 p-4 py-12 md:p-8 md:py-16">
        <section className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-3xl font-semibold md:text-4xl">TaskBoard</h1>
          <p className="max-w-xl text-lg text-muted-foreground">
            Boards, lists, and cards for your team: plan the work, see who does what, and keep
            everyone in step.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link to="/register">Get started free</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/pricing">See pricing</Link>
            </Button>
          </div>
        </section>
        <ul aria-label="Features" className="grid gap-4 md:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex flex-col gap-2 rounded-lg border bg-card p-5">
              <Icon aria-hidden="true" className="size-6" />
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
