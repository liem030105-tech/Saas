import { Link } from 'react-router';

import { RegisterForm } from '@/features/auth';

// docs/design/ui.md → Auth pages: a centered 400px card on a neutral background.
export function RegisterPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted p-4">
      <div className="flex w-full max-w-[400px] flex-col gap-6 rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <RegisterForm />
        <p className="text-center text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-foreground underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
