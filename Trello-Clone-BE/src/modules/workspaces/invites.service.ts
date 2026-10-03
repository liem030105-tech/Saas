import { createHash, randomBytes } from 'node:crypto';

import { toInviteDto } from './invites.mapper';
import { hasPermission } from './permissions';
import { toWorkspaceDto } from './workspaces.mapper';
import { currentActorRole, lockWorkspace } from './workspaces.service';
import { env } from '../../config/env';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { hasRole } from '../../lib/roles';
import * as notificationsService from '../notifications/notifications.service';

import type {
  CreatedInviteDto,
  CreateInviteData,
  InviteDto,
  WorkspaceDto,
} from '@trello-clone/shared';

// Invitations (WORKSPACE-004): docs/api/workspaces.md → Invitations. The raw token exists only in
// the invite link returned once on creation; the database keeps its sha256. Never log it.

/** D-17 (proposed default): an invite link works for 7 days. */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const newRawToken = () => randomBytes(32).toString('base64url');
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
const inviteUrl = (raw: string) => `${env.CLIENT_URL}/invite/${raw}`;

const inviter = { select: { id: true, name: true } } as const;

/** Unknown, expired, already-accepted, or someone else's invite: the same 404 on purpose. */
const inviteNotFound = () => AppError.notFound('This invite is invalid or has expired');

const alreadyMember = () =>
  new AppError('CONFLICT', 409, 'This person is already a member of the workspace');

const isUniqueViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

const isForeignKeyViolation = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003';

/**
 * POST /workspaces/:workspaceId/invites (≥ ADMIN; the route checks it first too). The invite role is capped
 * at the caller's role and is never OWNER (schema). A pending or old invite for the same email is
 * replaced: new token, new expiry.
 */
export async function create(
  workspaceId: string,
  actorId: string,
  input: CreateInviteData,
): Promise<CreatedInviteDto> {
  const raw = newRawToken();
  try {
    const invite = await prisma.$transaction(async (tx) => {
      // Granting a role depends on the caller's own: re-read it under the workspace lock, as
      // member changes do, so a caller demoted meanwhile cannot still invite above it.
      await lockWorkspace(tx, workspaceId);
      const actorRole = await currentActorRole(tx, workspaceId, actorId);
      if (!hasPermission(actorRole, 'invites.manage') || !hasRole(actorRole, input.role)) {
        throw AppError.forbidden();
      }

      const member = await tx.workspaceMember.findFirst({
        where: { workspaceId, user: { email: input.email } },
        select: { userId: true },
      });
      if (member) throw alreadyMember();

      await tx.workspaceInvite.deleteMany({ where: { workspaceId, email: input.email } });
      return tx.workspaceInvite.create({
        data: {
          workspaceId,
          email: input.email,
          role: input.role,
          tokenHash: hashToken(raw),
          invitedById: actorId,
          expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        },
        include: { invitedBy: inviter },
      });
    });
    return { ...toInviteDto(invite), inviteUrl: inviteUrl(raw) };
  } catch (error) {
    // Two invites for the same email at the same moment: the other one won.
    if (isUniqueViolation(error)) {
      throw new AppError('CONFLICT', 409, 'An invite for this email was just created');
    }
    throw error;
  }
}

/** GET /workspaces/:workspaceId/invites (≥ ADMIN): pending only (not accepted, not expired). */
export async function listPending(workspaceId: string): Promise<InviteDto[]> {
  const invites = await prisma.workspaceInvite.findMany({
    where: { workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
    include: { invitedBy: inviter },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return invites.map(toInviteDto);
}

/** DELETE /workspaces/:workspaceId/invites/:inviteId (≥ ADMIN): an accepted invite is not revocable. */
export async function revoke(workspaceId: string, inviteId: string): Promise<void> {
  const { count } = await prisma.workspaceInvite.deleteMany({
    where: { id: inviteId, workspaceId, acceptedAt: null },
  });
  if (count === 0) throw AppError.notFound();
}

/** POST /invites/accept: the invite the link's token belongs to. */
export async function accept(userId: string, rawToken: string): Promise<WorkspaceDto> {
  return acceptInvite(
    userId,
    await prisma.workspaceInvite.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { workspace: true },
    }),
  );
}

/**
 * POST /invites/:inviteId/accept (NOTIFICATIONS-001): accepting from the invite's notification,
 * which cannot carry the link (the raw token is never stored). The same rules as the token: only the
 * addressee, signed in with that email, can accept it.
 */
export async function acceptById(userId: string, inviteId: string): Promise<WorkspaceDto> {
  return acceptInvite(
    userId,
    await prisma.workspaceInvite.findUnique({
      where: { id: inviteId },
      include: { workspace: true },
    }),
  );
}

/**
 * The caller's email must equal the invite's. Marking the invite accepted (only if it still is
 * pending), creating the membership and marking the invite's notification read happen in one
 * transaction, so an invite works once.
 */
async function acceptInvite(
  userId: string,
  invite: Prisma.WorkspaceInviteGetPayload<{ include: { workspace: true } }> | null,
): Promise<WorkspaceDto> {
  if (!invite || invite.acceptedAt || invite.expiresAt <= new Date()) throw inviteNotFound();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user || user.email !== invite.email) throw inviteNotFound();

  try {
    await prisma.$transaction(async (tx) => {
      const member = await tx.workspaceMember.findUnique({
        where: { userId_workspaceId: { userId, workspaceId: invite.workspaceId } },
        select: { userId: true },
      });
      if (member) throw alreadyMember();

      const { count } = await tx.workspaceInvite.updateMany({
        where: { id: invite.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (count === 0) throw inviteNotFound();

      await tx.workspaceMember.create({
        data: { userId, workspaceId: invite.workspaceId, role: invite.role },
      });
      await notificationsService.markInviteRead(tx, userId, invite.id);
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw alreadyMember();
    // The workspace was deleted after the invite was read: the invite is gone with it.
    if (isForeignKeyViolation(error)) throw inviteNotFound();
    throw error;
  }
  return toWorkspaceDto(invite.workspace, invite.role);
}
