import { Link, useLocation } from 'react-router';

import { LoginForm } from '@/features/auth';

// docs/design/ui.md → Auth pages: a centered 400px card on a neutral background.
export function LoginPage() {
  // Keeps ?redirectTo when switching between log in and sign up (e.g. from an invite link).
  const { search } = useLocation();
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-semibold">Log in</h1>
        <LoginForm />
        <p className="text-center text-muted-foreground">
          Don&apos;t have an account?{' '}
          <Link
            to={`/register${search}`}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
