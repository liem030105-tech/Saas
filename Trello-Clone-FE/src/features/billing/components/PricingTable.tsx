import { PLAN_LIMITS, type Plan } from '@trello-clone/shared';
import { CheckIcon } from 'lucide-react';
import { Link } from 'react-router';

import { Button } from '@/components/ui/button';

import { PRO_PRICE_LABEL } from '../constants';

const MB = 1024 * 1024;

const PLANS: { plan: Plan; name: string; price: string; blurb: string }[] = [
  { plan: 'FREE', name: 'Free', price: '$0', blurb: 'For small teams getting started.' },
  { plan: 'PRO', name: 'Pro', price: PRO_PRICE_LABEL, blurb: 'For teams that outgrow the limits.' },
];

/** What each plan includes, read from PLAN_LIMITS (D-10) so the page cannot drift from the API. */
function features(plan: Plan): string[] {
  const limits = PLAN_LIMITS[plan];
  return [
    limits.boards === null ? 'Unlimited boards' : `Up to ${limits.boards} boards per workspace`,
    limits.members === null
      ? 'Unlimited members'
      : `Up to ${limits.members} members per workspace (pending invites included)`,
    `Files up to ${limits.maxFileBytes / MB} MB`,
    limits.activityRetentionDays === null
      ? 'Full activity history'
      : `Activity history for the last ${limits.activityRetentionDays} days`,
    'Realtime boards, roles and invites',
  ];
}

/**
 * The Free and Pro plans side by side (BILLING-001, docs/design/ui.md → Pricing). Signed out, both
 * lead to sign-up; signed in, to the workspaces, where an owner upgrades from the settings.
 */
export function PricingTable({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {PLANS.map(({ plan, name, price, blurb }) => (
        <section
          key={plan}
          aria-labelledby={`plan-${plan}`}
          className="flex flex-col gap-4 rounded-lg border bg-card p-6 text-card-foreground shadow-sm"
        >
          <div className="flex flex-col gap-1">
            <h2 id={`plan-${plan}`} className="text-xl font-semibold">
              {name}
            </h2>
            <p className="text-2xl font-semibold">{price}</p>
            <p className="text-sm text-muted-foreground">{blurb}</p>
          </div>
          <ul className="flex flex-1 flex-col gap-2 text-sm">
            {features(plan).map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <CheckIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                {feature}
              </li>
            ))}
          </ul>
          {signedIn ? (
            plan === 'PRO' && (
              <p className="text-sm text-muted-foreground">
                A workspace owner upgrades from the workspace&apos;s settings.
              </p>
            )
          ) : (
            <Button asChild variant={plan === 'PRO' ? 'default' : 'secondary'}>
              <Link to="/register">
                {plan === 'PRO' ? 'Start free, upgrade later' : 'Get started'}
              </Link>
            </Button>
          )}
        </section>
      ))}
    </div>
  );
}
