import * as checklistsService from './checklists.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type {
  CreateChecklistData,
  CreateChecklistItemData,
  UpdateChecklistData,
  UpdateChecklistItemData,
} from '@trello-clone/shared';
import type { Request, Response } from 'express';

// Checklist routes authorize in the service, on the card's stored board.
const cardIdOf = (req: Request) => req.params.cardId as string;
const checklistIdOf = (req: Request) => req.params.checklistId as string;
const itemIdOf = (req: Request) => req.params.itemId as string;

export async function createChecklist(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateChecklistData>(res);
  const checklist = await checklistsService.createChecklist(
    currentUserId(req),
    cardIdOf(req),
    body,
  );
  res.status(201).json({ data: checklist });
}

export async function updateChecklist(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateChecklistData>(res);
  const checklist = await checklistsService.updateChecklist(
    currentUserId(req),
    checklistIdOf(req),
    body,
  );
  res.status(200).json({ data: checklist });
}

export async function removeChecklist(req: Request, res: Response) {
  await checklistsService.removeChecklist(currentUserId(req), checklistIdOf(req));
  res.status(204).end();
}

export async function createItem(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, CreateChecklistItemData>(res);
  const item = await checklistsService.createItem(currentUserId(req), checklistIdOf(req), body);
  res.status(201).json({ data: item });
}

export async function updateItem(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateChecklistItemData>(res);
  const item = await checklistsService.updateItem(
    currentUserId(req),
    checklistIdOf(req),
    itemIdOf(req),
    body,
  );
  res.status(200).json({ data: item });
}

export async function removeItem(req: Request, res: Response) {
  await checklistsService.removeItem(currentUserId(req), checklistIdOf(req), itemIdOf(req));
  res.status(204).end();
}
