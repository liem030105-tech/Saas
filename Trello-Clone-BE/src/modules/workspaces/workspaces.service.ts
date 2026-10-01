import { ROLE_ORDER } from '@trello-clone/shared';

import { hasPermission, type WorkspaceAction } from './permissions';
import { slugCandidates } from './slug';
import { toMemberDto, toWorkspaceDto } from './workspaces.mapper';
import * as workspacesRepository from './workspaces.repository';
import { prisma } from '../../config/prisma';
import { Prisma, type Role } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';

import type {
  CreateWorkspaceData,
  MemberDto,
  UpdateWorkspaceData,
  WorkspaceDto,
} from '@trello-clone/shared';

// docs/api/workspaces.md. Other modules call assertWorkspaceAccess, never the repository.

/** Slug attempts before giving up: the plain slug, then random suffixes (36^4 each). */
const SLUG_ATTEMPTS = 5;

/**
 * The caller's role in the workspace, if it allows `action` (permissions.ts). A missing workspace
 * and a non-member look the same (404); a member whose role does not allow `action` gets 403
 * (docs/api/README.md → Authorization model).
 */
export async function assertWorkspaceAccess(
  userId: string,
  workspaceId: string,
  action: WorkspaceAction,
) {
  const role = await workspacesRepository.findMemberRole(userId, workspaceId);
  if (!role) throw AppError.notFound();
  if (!hasPermission(role, action)) throw AppError.forbidden();
  return role;
}

// The database's collation may order by byte ("Zeta" before "alpha"); users expect a
// case-insensitive order. A user's workspaces are few, so sorting here is cheap.
const byName = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

/** GET /workspaces: only the caller's workspaces, with their role in each, ordered by name. */
export async function list(userId: string): Promise<WorkspaceDto[]> {
  const memberships = await workspacesRepository.listMemberships(userId);
  return memberships
    .map(({ workspace, role }) => toWorkspaceDto(workspace, role))
    .sort((a, b) => byName.compare(a.name, b.name) || a.id.localeCompare(b.id));
}

/**
 * A unique violation on `Workspace.slug`. Prisma 7 with the pg adapter reports the constraint in
 * `meta.driverAdapterError.cause.constraint` (`fields` or `index`); older engines use `meta.target`.
 */
function isSlugTaken(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const meta = error.meta as
    | {
        target?: unknown;
        driverAdapterError?: { cause?: { constraint?: { fields?: unknown; index?: unknown } } };
      }
    | undefined;
  const constraint = meta?.driverAdapterError?.cause?.constraint;
  const names = [meta?.target, constraint?.fields, constraint?.index].flat();
  return names.some((name) => typeof name === 'string' && name.includes('slug'));
}

/**
 * POST /workspaces: creates the workspace and makes the caller its OWNER in one transaction. The
 * slug comes from the name; the unique index decides collisions (also concurrent ones), and each
 * retry adds a new random suffix.
 */
export async function create(userId: string, input: CreateWorkspaceData): Promise<WorkspaceDto> {
  for (const slug of slugCandidates(input.name, SLUG_ATTEMPTS)) {
    try {
      const workspace = await prisma.$transaction(async (tx) => {
        const created = await tx.workspace.create({ data: { name: input.name, slug } });
        await tx.workspaceMember.create({
          data: { userId, workspaceId: created.id, role: 'OWNER' },
        });
        return created;
      });
      return toWorkspaceDto(workspace, 'OWNER');
    } catch (error) {
      if (!isSlugTaken(error)) throw error;
    }
  }
  throw new Error(`No free slug for "${input.name}" after ${SLUG_ATTEMPTS} attempts`);
}

/** The row was deleted between the access check and this query (e.g. a concurrent DELETE). */
const isNotFound = (error: unknown) =>
  error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025';

// The routes below run after requireWorkspaceRole, which checked membership and passes the
// caller's role on for the DTO.

/** GET /workspaces/:workspaceId. */
export async function get(workspaceId: string, role: Role): Promise<WorkspaceDto> {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) throw AppError.notFound();
  return toWorkspaceDto(workspace, role);
}

/** PATCH /workspaces/:workspaceId (≥ ADMIN): rename and/or change the slug; a taken slug is 409. */
export async function update(
  workspaceId: string,
  role: Role,
  input: UpdateWorkspaceData,
): Promise<WorkspaceDto> {
  try {
    const workspace = await prisma.workspace.update({
      where: { id: workspaceId },
      data: { name: input.name, slug: input.slug },
    });
    return toWorkspaceDto(workspace, role);
  } catch (error) {
    if (isSlugTaken(error)) throw new AppError('CONFLICT', 409, 'This URL is already taken');
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}

/** DELETE /workspaces/:workspaceId (OWNER): the foreign keys cascade to members and all content. */
export async function remove(workspaceId: string): Promise<void> {
  try {
    await prisma.workspace.delete({ where: { id: workspaceId } });
  } catch (error) {
    if (isNotFound(error)) throw AppError.notFound();
    throw error;
  }
}

// Members (WORKSPACE-003). Rules: docs/api/README.md → Permission matrix, footnotes 1–3.

/** GET /workspaces/:workspaceId/members: ordered by role (OWNER first), then name. */
export async function listMembers(workspaceId: string): Promise<MemberDto[]> {
  const members = await workspacesRepository.listMembers(workspaceId);
  return members
    .sort(
      (a, b) =>
        ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) ||
        byName.compare(a.user.name, b.user.name) ||
        a.userId.localeCompare(b.userId),
    )
    .map(toMemberDto);
}

const lastOwner = () => AppError.businessRule('LAST_OWNER', 'A workspace needs at least one owner');

export type Tx = Prisma.TransactionClient;

/**
 * Serializes member changes per workspace: locks the workspace row (`FOR NO KEY UPDATE`, which
 * still lets inserts referencing it through), so everything read after this in the transaction is
 * current. Every change that could remove an OWNER or depends on the caller's role takes it
 * first (WORKSPACE-003 → Risks; invariant I4). A concurrent workspace DELETE locks the same row
 * before cascading, so the two cannot deadlock. A deleted workspace → 404.
 */
export async function lockWorkspace(tx: Tx, workspaceId: string) {
  const rows = await tx.$queryRaw<unknown[]>`
    SELECT 1 FROM "Workspace" WHERE "id" = ${workspaceId} FOR NO KEY UPDATE`;
  if (rows.length === 0) throw AppError.notFound();
}

const countOwners = (tx: Tx, workspaceId: string) =>
  tx.workspaceMember.count({ where: { workspaceId, role: 'OWNER' } });

async function findMember(tx: Tx, workspaceId: string, userId: string) {
  const member = await tx.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    include: { user: workspacesRepository.memberUserSelect },
  });
  if (!member) throw AppError.notFound();
  return member;
}

/**
 * The caller's role, re-read after lockWorkspace: the role the route checked may have changed
 * since (e.g. an OWNER demoted while granting OWNER). Gone → 404, like a non-member.
 */
export async function currentActorRole(tx: Tx, workspaceId: string, actorId: string) {
  const actor = await tx.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId: actorId, workspaceId } },
    select: { role: true },
  });
  if (!actor) throw AppError.notFound();
  return actor.role;
}

/** Footnote 3: an ADMIN acts only on targets ≤ ADMIN; only an OWNER touches or grants OWNER. */
function assertMayManage(actorRole: Role, targetRole: Role) {
  if (targetRole === 'OWNER' && !hasPermission(actorRole, 'members.manageOwners')) {
    throw AppError.forbidden();
  }
}

/** PATCH /workspaces/:workspaceId/members/:userId (≥ ADMIN; the route checks it first too). */
export async function changeMemberRole(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
  role: Role,
): Promise<MemberDto> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const actorRole = await currentActorRole(tx, workspaceId, actorId);
    if (!hasPermission(actorRole, 'members.changeRole')) throw AppError.forbidden();
    const target = await findMember(tx, workspaceId, targetUserId);
    assertMayManage(actorRole, target.role);
    if (role === 'OWNER' && !hasPermission(actorRole, 'members.grantOwner')) {
      throw AppError.forbidden();
    }
    if (target.role === role) return toMemberDto(target);
    if (target.role === 'OWNER' && (await countOwners(tx, workspaceId)) <= 1) throw lastOwner();

    const updated = await tx.workspaceMember.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      data: { role },
      include: { user: workspacesRepository.memberUserSelect },
    });
    return toMemberDto(updated);
  });
}

/**
 * DELETE /workspaces/:workspaceId/members/:userId: any member may remove themselves (leave);
 * removing someone else needs ≥ ADMIN. The last OWNER can never go. Their card assignments in the
 * workspace are removed with them (I3).
 */
export async function removeMember(
  workspaceId: string,
  actorId: string,
  targetUserId: string,
): Promise<void> {
  const leaving = actorId === targetUserId;

  await prisma.$transaction(async (tx) => {
    await lockWorkspace(tx, workspaceId);
    const actorRole = await currentActorRole(tx, workspaceId, actorId);
    if (!leaving && !hasPermission(actorRole, 'members.remove')) throw AppError.forbidden();
    const target = await findMember(tx, workspaceId, targetUserId);
    if (!leaving) assertMayManage(actorRole, target.role);
    if (target.role === 'OWNER' && (await countOwners(tx, workspaceId)) <= 1) throw lastOwner();

    await tx.workspaceMember.delete({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
    });
    // Their card assignments in this workspace go too (I3). After the membership row is gone, so
    // an assignment that held that row (cards.service.assignMember) has committed and is removed
    // here, and a later one finds no membership and is refused.
    await tx.cardMember.deleteMany({
      where: { userId: targetUserId, card: { board: { workspaceId } } },
    });
  });
}
