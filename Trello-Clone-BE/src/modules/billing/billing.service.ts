import { PLAN_LIMITS } from '@trello-clone/shared';

import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { lockWorkspace } from '../workspaces/workspaces.service';

import type { Plan, Prisma } from '../../generated/prisma/client';
import type { BillingDto, PlanLimitedResource } from '@trello-clone/shared';

// docs/api/billing.md (BILLING-001). Limits are PLAN_LIMITS (D-10); only this module enforces them.
// Downgrading never deletes anything: it only blocks creating more.

type Tx = Prisma.TransactionClient;

/** What a create checks: one more board, or one more member or invite. */
export type LimitedResource = 'boards' | 'members';

const MB = 1024 * 1024;

/** Members plus pending invites, as the member limit counts them. */
async function countMembers(tx: Tx, workspaceId: string) {
  const [members, invites] = await Promise.all([
    tx.workspaceMember.count({ where: { workspaceId } }),
    tx.workspaceInvite.count({
      where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    }),
  ]);
  return members + invites;
}

/** Boards, archived ones included (unarchiving needs no check). */
const countBoards = (tx: Tx, workspaceId: string) => tx.board.count({ where: { workspaceId } });

async function planOf(tx: Tx, workspaceId: string): Promise<Plan> {
  const workspace = await tx.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true },
  });
  if (!workspace) throw AppError.notFound();
  return workspace.plan;
}

const limitReached = (limit: PlanLimitedResource, message: string) =>
  new AppError('PLAN_LIMIT_REACHED', 402, message, [{ limit, message }]);

/**
 * Throws `402 PLAN_LIMIT_REACHED` when one more `resource` would go over the workspace's plan.
 * Call it inside the creating transaction, before the insert: it locks the workspace row first
 * (lockWorkspace), so concurrent creates count in turn.
 */
export async function assertWithinLimit(
  tx: Tx,
  workspaceId: string,
  resource: LimitedResource,
): Promise<void> {
  await lockWorkspace(tx, workspaceId);
  const limits = PLAN_LIMITS[await planOf(tx, workspaceId)];
  switch (resource) {
    case 'boards':
      if (limits.boards !== null && (await countBoards(tx, workspaceId)) >= limits.boards) {
        throw limitReached(
          'boards',
          `The Free plan allows ${limits.boards} boards per workspace. Upgrade to Pro for unlimited boards.`,
        );
      }
      return;
    case 'members':
      if (limits.members !== null && (await countMembers(tx, workspaceId)) >= limits.members) {
        throw limitReached(
          'members',
          `The Free plan allows ${limits.members} members per workspace, pending invites included. Upgrade to Pro for unlimited members.`,
        );
      }
      return;
  }
}

/** Throws when a file of `bytes` is over the workspace's plan (no transaction needed). */
export async function assertFileSize(workspaceId: string, bytes: number): Promise<void> {
  const plan = await currentPlan(workspaceId);
  if (bytes > PLAN_LIMITS[plan].maxFileBytes) throw fileTooLarge(plan);
}

/**
 * Over the plan's largest file: on Free, an upgrade helps (402); on Pro, the largest there is (413).
 * Also used by the upload middleware, which stops reading at the plan's limit.
 */
export function fileTooLarge(plan: Plan): AppError {
  const max = PLAN_LIMITS[plan].maxFileBytes / MB;
  if (plan === 'FREE') {
    return limitReached(
      'fileSize',
      `Files can be at most ${max} MB on the Free plan. Upgrade to Pro for files up to ${PLAN_LIMITS.PRO.maxFileBytes / MB} MB.`,
    );
  }
  return new AppError('FILE_TOO_LARGE', 413, `The file is larger than ${max} MB`);
}

/** The workspace's plan (no lock; for reads that only adapt to it). */
export const currentPlan = (workspaceId: string) => planOf(prisma, workspaceId);

/**
 * The oldest activity the workspace's plan still shows (D-12: filtered on read, nothing is
 * deleted, so upgrading shows it all again); null = all of it.
 */
export async function activitySince(workspaceId: string): Promise<Date | null> {
  const days = PLAN_LIMITS[await currentPlan(workspaceId)].activityRetentionDays;
  return days === null ? null : new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

/** GET /workspaces/:workspaceId/billing (≥ ADMIN; the route checks it). */
export async function getSummary(workspaceId: string): Promise<BillingDto> {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { plan: true, subscription: { select: { status: true, currentPeriodEnd: true } } },
  });
  if (!workspace) throw AppError.notFound();
  const [boards, members] = await Promise.all([
    countBoards(prisma, workspaceId),
    countMembers(prisma, workspaceId),
  ]);
  return {
    plan: workspace.plan,
    status: workspace.subscription?.status ?? null,
    currentPeriodEnd: workspace.subscription?.currentPeriodEnd?.toISOString() ?? null,
    usage: { boards, members },
  };
}
