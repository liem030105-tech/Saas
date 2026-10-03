import { Link } from 'react-router';

const NAV_LINK = 'rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted';

/**
 * The header of the public pages (landing `/`, `/pricing`; docs/design/ui.md → Public pages): the
 * logo, "Pricing", and "Log in" / "Sign up" when signed out, or "Go to your workspaces" when signed in.
 */
export function PublicHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="flex h-14 items-center justify-between gap-2 border-b bg-card px-4">
      <Link to="/" className="font-semibold">
        TaskBoard
      </Link>
      <nav aria-label="Main" className="flex items-center gap-1">
        <Link to="/pricing" className={NAV_LINK}>
          Pricing
        </Link>
        {signedIn ? (
          <Link to="/" className={NAV_LINK}>
            Go to your workspaces
          </Link>
        ) : (
          <>
            <Link to="/login" className={NAV_LINK}>
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
