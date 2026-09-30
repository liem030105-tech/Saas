# Module template (Express 5 + Zod 4 + Prisma 7)

Target shape for every `src/modules/<m>/` module, using `boards` (BOARD-001) as the example. Versions per ADR-015.
Once BOARD-001 is merged, `src/modules/boards/` is the real reference: if it differs from this file, update this file in the same PR.

## `boards.routes.ts` – paths and middleware order only
```ts
import { CreateBoardInputSchema, ListBoardsQuerySchema } from '@trello-clone/shared';
import { Router } from 'express';

import * as controller from './boards.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';
import { validate } from '../../middlewares/validate';

export const boardsRouter = Router();

// .claude/rules/backend.md: authenticate → rate limit → validate → requireWorkspaceRole.
// requireWorkspaceRole also checks :workspaceId (a malformed id is a 404 like an unknown one), so
// no params schema is needed. Board/list/card routes call assertBoardAccess in the service
// instead, because the workspace is only known after loading the stored resource.
const BOARDS = '/workspaces/:workspaceId/boards';
boardsRouter.get(
  BOARDS,
  authenticate,
  apiRateLimit,
  validate({ query: ListBoardsQuerySchema }),
  requireWorkspaceRole('board.view'), // an action of modules/workspaces/permissions.ts
  controller.list,
);
boardsRouter.post(
  BOARDS,
  authenticate,
  apiRateLimit,
  validate({ body: CreateBoardInputSchema }),
  requireWorkspaceRole('board.edit'),
  controller.create,
);
```

## `boards.controller.ts` – HTTP in, service call, HTTP out
```ts
import * as boardsService from './boards.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { CreateBoardData, ListBoardsQuery } from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Express 5: a rejected promise goes to errorHandler automatically. No try/catch, no asyncHandler.
const workspaceIdOf = (req: Request) => req.params.workspaceId as string;

export async function list(req: Request, res: Response) {
  const { query } = validated<unknown, ListBoardsQuery, unknown>(res);
  const boards = await boardsService.list(workspaceIdOf(req), query);
  res.status(200).json({ data: boards });
}

export async function create(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateBoardData>(res);
  const board = await boardsService.create(currentUserId(req), workspaceIdOf(req), body);
  res.status(201).json({ data: board });
}
```
Shared types come in pairs: `…Input` (`z.input`, what a form holds) and `…Data` (`z.output`, what the validator hands the controller).

## `validate.ts` – note the Express 5 `req.query` change
In Express 5 `req.query` is a read-only getter, so the middleware must not assign to it. Store the parsed, stripped values in `res.locals.validated` and read them through a typed helper:
```ts
import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

type Schemas = { params?: ZodType; query?: ZodType; body?: ZodType };

export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.validated = {
      params: schemas.params ? schemas.params.parse(req.params) : req.params,
      query: schemas.query ? schemas.query.parse(req.query) : {},
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
    };
    next(); // a ZodError thrown above reaches errorHandler → 400 VALIDATION_ERROR
  };
}

export function validated<P, Q = unknown, B = unknown>(res: Response) {
  return res.locals.validated as { params: P; query: Q; body: B };
}
```

## `boards.service.ts` – business rules, authorization, transactions
```ts
import { logActivity } from './activity';
import { toBoardDto } from './boards.mapper';
import * as boardsRepository from './boards.repository';
import { prisma } from '../../config/prisma';
import { AppError } from '../../lib/app-error';
import { hasPermission, type WorkspaceAction } from '../workspaces/permissions';

import type { BoardDto, CreateBoardData, ListBoardsQuery } from '@trello-clone/shared';

/** The single entry point for board-scoped authorization (BOARD-002 onwards). */
export async function assertBoardAccess(userId: string, boardId: string, action: WorkspaceAction) {
  const board = await boardsRepository.findBoardWithRole(userId, boardId); // one query
  const role = board?.workspace.members[0]?.role;
  if (!board || !role) throw AppError.notFound();
  if (!hasPermission(role, action)) throw AppError.forbidden();
  return { board: { id: board.id, workspaceId: board.workspaceId }, role };
}

export async function list(workspaceId: string, query: ListBoardsQuery): Promise<BoardDto[]> {
  // role already checked by requireWorkspaceRole('board.view') on the route
  const boards = await prisma.board.findMany({
    where: { workspaceId, archived: query.archived },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
  return boards.map(toBoardDto);
}

export async function create(userId: string, workspaceId: string, input: CreateBoardData): Promise<BoardDto> {
  // role already checked by requireWorkspaceRole('board.edit') on the route
  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({ data: { workspaceId, title: input.title, background: input.background } });
    await logActivity(tx, { boardId: created.id, userId, type: 'BOARD_CREATED', data: { title: created.title } });
    return created;
  });
  return toBoardDto(board); // realtime emit (REALTIME-001+) goes here, after the transaction committed
}
```
- Services never see `req`/`res`; they take ids and validated input, return DTOs, and throw `AppError`.
- Map Prisma rows to DTOs explicitly (`boards.mapper.ts`) so internal columns never leak.
- `boards.repository.ts` holds `findBoardWithRole` (the board with the caller's membership in its stored workspace), reused by every board-scoped check.

## `<m>.schema.ts` – BE-only schemas (only when needed)
The boards module has none: `:workspaceId` is checked by `requireWorkspaceRole`, and board-scoped ids by `assertBoardAccess` (an unknown id is simply not found). Add `<m>.schema.ts` only for a BE-only shape, e.g. a params object with several ids:
```ts
import { CuidSchema } from '@trello-clone/shared';
import { z } from 'zod';

export const CardParams = z.object({ cardId: CuidSchema });
```
Request/response schemas that the FE also uses live in `@trello-clone/shared`, never here.

## Mounting
`src/app.ts` mounts every module router once under `/api/v1` (e.g. `api.use(boardsRouter)`), before the 404 handler and `errorHandler`.

## Tests
- `tests/integration/boards.test.ts`: the 5-case baseline per endpoint (template in the `testing` skill: `references/api-test-template.md`).
- Register every new endpoint in the role-matrix and tenant-isolation suites (WORKSPACE-005/006).
