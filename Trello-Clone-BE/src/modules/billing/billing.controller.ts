import * as billingService from './billing.service';

import type { Request, Response } from 'express';

// docs/api/billing.md: requireWorkspaceRole has checked the caller's role on the route.

export async function getSummary(req: Request, res: Response) {
  res.status(200).json({ data: await billingService.getSummary(req.params.workspaceId as string) });
}
