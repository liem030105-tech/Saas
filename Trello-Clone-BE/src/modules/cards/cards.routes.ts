import {
  CreateCardInputSchema,
  CreateChecklistInputSchema,
  CreateChecklistItemInputSchema,
  MoveCardInputSchema,
  UpdateCardInputSchema,
  UpdateChecklistInputSchema,
  UpdateChecklistItemInputSchema,
} from '@trello-clone/shared';
import { Router } from 'express';

import * as attachments from './attachments.controller';
import * as controller from './cards.controller';
import * as checklists from './checklists.controller';
import { authenticate } from '../../middlewares/authenticate';
import { apiRateLimit } from '../../middlewares/rate-limit';
import { uploadFile } from '../../middlewares/upload';
import { validate } from '../../middlewares/validate';

export const cardsRouter = Router();

// authenticate → rate limit → validate; the service authorizes with assertBoardAccess on the
// list's stored board (an unknown or malformed id is a 404 like a list the caller cannot see).
cardsRouter.post(
  '/lists/:listId/cards',
  authenticate,
  apiRateLimit,
  validate({ body: CreateCardInputSchema }),
  controller.create,
);

const CARD = '/cards/:cardId';
cardsRouter.get(CARD, authenticate, apiRateLimit, controller.get);
cardsRouter.patch(
  CARD,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateCardInputSchema }),
  controller.update,
);
cardsRouter.delete(CARD, authenticate, apiRateLimit, controller.remove);
cardsRouter.patch(
  `${CARD}/move`,
  authenticate,
  apiRateLimit,
  validate({ body: MoveCardInputSchema }),
  controller.move,
);

// Card labels (CARD-005): authorized in the service, on the card's stored board.
const CARD_LABEL = `${CARD}/labels/:labelId`;
cardsRouter.post(CARD_LABEL, authenticate, apiRateLimit, controller.attachLabel);
cardsRouter.delete(CARD_LABEL, authenticate, apiRateLimit, controller.detachLabel);

// Card members (CARD-005): authorized in the service, on the card's stored board.
const CARD_MEMBER = `${CARD}/members/:userId`;
cardsRouter.post(CARD_MEMBER, authenticate, apiRateLimit, controller.assignMember);
cardsRouter.delete(CARD_MEMBER, authenticate, apiRateLimit, controller.unassignMember);

// Checklists (CARD-005c): authorized in the service, on the card's stored board.
cardsRouter.post(
  `${CARD}/checklists`,
  authenticate,
  apiRateLimit,
  validate({ body: CreateChecklistInputSchema }),
  checklists.createChecklist,
);
const CHECKLIST = '/checklists/:checklistId';
cardsRouter.patch(
  CHECKLIST,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateChecklistInputSchema }),
  checklists.updateChecklist,
);
cardsRouter.delete(CHECKLIST, authenticate, apiRateLimit, checklists.removeChecklist);
cardsRouter.post(
  `${CHECKLIST}/items`,
  authenticate,
  apiRateLimit,
  validate({ body: CreateChecklistItemInputSchema }),
  checklists.createItem,
);
const ITEM = `${CHECKLIST}/items/:itemId`;
cardsRouter.patch(
  ITEM,
  authenticate,
  apiRateLimit,
  validate({ body: UpdateChecklistItemInputSchema }),
  checklists.updateItem,
);
cardsRouter.delete(ITEM, authenticate, apiRateLimit, checklists.removeItem);

// Attachments (ATTACHMENTS-001): authorized before the file is read, which stops at the plan's
// size limit; then one multipart file in memory, and the service checks again.
cardsRouter.post(
  `${CARD}/attachments`,
  authenticate,
  apiRateLimit,
  attachments.authorizeUpload,
  uploadFile,
  attachments.upload,
);
cardsRouter.delete('/attachments/:attachmentId', authenticate, apiRateLimit, attachments.remove);
