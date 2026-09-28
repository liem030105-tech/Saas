# Module template (Express 5 + Zod 4 + Prisma 7)

Target shape for every `src/modules/<m>/` module, using `boards` (BOARD-001) as the example. Versions per ADR-015.
Once BOARD-001 is merged, `src/modules/boards/` is the real reference: if it differs from this file, update this file in the same PR.

## `boards.routes.ts` – paths and middleware order only
```ts
import { Router } from 'express';
import { CreateBoardInput, ListBoardsQuery } from '@trello-clone/shared';
import { authenticate } from '../../middlewares/authenticate';
import { validate } from '../../middlewares/validate';
import { requireWorkspaceRole } from '../../middlewares/require-workspace-role';
import { WorkspaceIdParams } from './boards.schema';
import * as controller from './boards.controller';

export const boardsRouter = Router();

// authenticate → validate → authorization → controller.
// Workspace-scoped routes check the role in middleware; board/list/card routes call assertBoardAccess
// in the service, because the workspace is only known after loading the stored resource.
boardsRouter.get(
  '/workspaces/:workspaceId/boards',
  authenticate,
  validate({ params: WorkspaceIdParams, query: ListBoardsQuery }),
  requireWorkspaceRole('VIEWER'), // non-member → 404, lower role → 403
  controller.list,
);
boardsRouter.post(
  '/workspaces/:workspaceId/boards',
  authenticate,
  validate({ params: WorkspaceIdParams, body: CreateBoardInput }),
  requireWorkspaceRole('MEMBER'),
  controller.create,
);
```

## `boards.controller.ts` – HTTP in, service call, HTTP out
```ts
import type { Request, Response } from 'express';
import type { CreateBoardInput, ListBoardsQuery } from '@trello-clone/shared';
import * as boardsService from './boards.service';
import { validated } from '../../middlewares/validate';

// Express 5: a rejected promise goes to errorHandler automatically. No try/catch, no asyncHandler.
export async function list(req: Request, res: Response) {
  const { params, query } = validated<{ workspaceId: string }, ListBoardsQuery>(res);
  const boards = await boardsService.list(req.userId, params.workspaceId, query);
  res.status(200).json({ data: boards });
}

export async function create(req: Request, res: Response) {
  const { params, body } = validated<{ workspaceId: string }, never, CreateBoardInput>(res);
  const board = await boardsService.create(req.userId, params.workspaceId, body);
  res.status(201).json({ data: board });
}
```

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
import type { CreateBoardInput, ListBoardsQuery, BoardDto } from '@trello-clone/shared';
import { prisma } from '../../config/prisma';
import { logActivity } from './activity';
import { toBoardDto } from './boards.mapper';

export async function list(userId: string, workspaceId: string, query: ListBoardsQuery): Promise<BoardDto[]> {
  // role already checked by requireWorkspaceRole('VIEWER') on the route
  const boards = await prisma.board.findMany({
    where: { workspaceId, archived: query.archived },
    orderBy: { createdAt: 'desc' },
  });
  return boards.map(toBoardDto);
}

export async function create(userId: string, workspaceId: string, input: CreateBoardInput): Promise<BoardDto> {
  // role already checked by requireWorkspaceRole('MEMBER') on the route
  const board = await prisma.$transaction(async (tx) => {
    const created = await tx.board.create({ data: { ...input, workspaceId } });
    await logActivity(tx, { type: 'BOARD_CREATED', boardId: created.id, userId, data: { title: created.title } });
    return created;
  });
  return toBoardDto(board); // realtime emit (REALTIME-001+) goes here, after the transaction committed
}
```
- Services never see `req`/`res`; they take ids and validated input, return DTOs, and throw `AppError`.
- Map Prisma rows to DTOs explicitly (`boards.mapper.ts`) so internal columns never leak.

## `boards.schema.ts` – BE-only schemas
```ts
import { z } from 'zod';
import { CuidSchema } from '@trello-clone/shared';

export const WorkspaceIdParams = z.object({ workspaceId: CuidSchema });
```
Request/response schemas that the FE also uses live in `@trello-clone/shared`, never here.

## Mounting
`src/app.ts` mounts every module router once under `/api/v1` (e.g. `api.use(boardsRouter)`), before the 404 handler and `errorHandler`.

## Tests
- `tests/integration/boards.test.ts`: the 5-case baseline per endpoint (template in the `testing` skill: `references/api-test-template.md`).
- Register every new endpoint in the role-matrix and tenant-isolation suites (WORKSPACE-005/006).
