import { Button } from '@/components/ui/button';
import { ProfileForm, useCurrentUser } from '@/features/auth';

// docs/architecture/frontend.md → Routes: /settings/profile. Behind ProtectedRoute.
export function ProfilePage() {
  const { data: user, isError, refetch } = useCurrentUser();

  return (
    <main className="mx-auto flex w-full max-w-[560px] flex-col gap-6 p-4 md:p-8">
      <h1 className="text-2xl font-semibold">Profile</h1>
      <section className="rounded-lg border bg-card p-6 text-card-foreground shadow-sm">
        {user ? (
          <ProfileForm key={user.id} user={user} />
        ) : isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm">Couldn&apos;t load your profile.</p>
            <Button variant="link" className="px-0" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <div aria-busy="true" className="flex flex-col gap-4">
            {[0, 1, 2].map((row) => (
              <div key={row} className="h-9 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
