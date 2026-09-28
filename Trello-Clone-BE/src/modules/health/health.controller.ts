import * as healthService from './health.service';

import type { Request, Response } from 'express';

export function getHealth(_req: Request, res: Response) {
  res.status(200).json({ data: healthService.getStatus() });
}
