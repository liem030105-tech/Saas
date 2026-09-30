import { slugCandidates } from './slug';
import { toWorkspaceDto } from './workspaces.mapper';
import * as workspacesRepository from './workspaces.repository';
import { prisma } from '../../config/prisma';
import { Prisma, type Role } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { hasRole } from '../../lib/roles';

import type { CreateWorkspaceData, UpdateWorkspaceData, WorkspaceDto } from '@trello-clone/shared';

// docs/api/workspaces.md. Other modules call assertWorkspaceAccess, never the repository.

/** Slug attempts before giving up: the plain slug, then random suffixes (36^4 each). */
const SLUG_ATTEMPTS = 5;

/**
 * The caller's role in the workspace, if it is at least `min`. A missing workspace and a
 * non-member look the same (404); a member below `min` gets 403 (docs/api/README.md →
 * Authorization model).
 */
export async function assertWorkspaceAccess(userId: string, workspaceId: string, min: Role) {
  const role = await workspacesRepository.findMemberRole(userId, workspaceId);
  if (!role) throw AppError.notFound();
  if (!hasRole(role, min)) throw AppError.forbidden();
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
