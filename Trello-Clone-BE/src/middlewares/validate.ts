import type { NextFunction, Request, Response } from 'express';
import type { ZodType } from 'zod';

interface Schemas {
  params?: ZodType;
  query?: ZodType;
  body?: ZodType;
}

/**
 * Parses params/query/body with Zod (z.object strips unknown fields) and stores the result in
 * res.locals.validated: Express 5 makes req.query a read-only getter. A ZodError reaches
 * errorHandler as 400 VALIDATION_ERROR.
 */
export function validate(schemas: Schemas) {
  // Named, so tests can find every route that validates (tests/integration/baseline.test.ts).
  return function validateRequest(req: Request, res: Response, next: NextFunction) {
    res.locals.validated = {
      params: schemas.params ? schemas.params.parse(req.params) : req.params,
      query: schemas.query ? schemas.query.parse(req.query) : {},
      body: schemas.body ? schemas.body.parse(req.body) : undefined,
    };
    next();
  };
}

export function validated<P, Q = unknown, B = unknown>(res: Response) {
  return res.locals.validated as { params: P; query: Q; body: B };
}
