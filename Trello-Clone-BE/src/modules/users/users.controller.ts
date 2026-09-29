import * as usersService from './users.service';
import { currentUserId } from '../../middlewares/authenticate';
import { validated } from '../../middlewares/validate';

import type { UpdateProfileData } from '@trello-clone/shared';
import type { Request, Response } from 'express';

export async function updateMe(req: Request, res: Response) {
  const { body } = validated<unknown, unknown, UpdateProfileData>(res);
  const user = await usersService.updateProfile(currentUserId(req), body);
  res.status(200).json({ data: user });
}
