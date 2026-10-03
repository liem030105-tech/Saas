import { getAccessToken } from '@/api/token-store';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { PricingTable } from '@/features/billing';

// `/pricing` (BILLING-001, ADR-022): public; the same page signed in, with a way back to the app.
export function PricingPage() {
  const signedIn = getAccessToken() !== null;
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <PublicHeader signedIn={signedIn} />
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4 md:p-8">
        <div className="flex flex-col gap-2 text-center">
          <h1 className="text-3xl font-semibold">Pricing</h1>
          <p className="text-muted-foreground">
            Start free. Upgrade a workspace to Pro when your team needs more.
          </p>
        </div>
        <PricingTable signedIn={signedIn} />
        <p className="text-center text-sm text-muted-foreground">
          Plans are per workspace. Downgrading never deletes anything: new boards, members and large
          files beyond the Free limits are blocked, and older activity is hidden until you upgrade
          again.
        </p>
      </main>
    </div>
  );
}
