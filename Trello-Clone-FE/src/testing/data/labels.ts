import { buildErrorBody } from './api';
import { roadmapDetail } from './boards';
import { loginCard, loginCardDetail, roadmapWithCards } from './cards';

import type { BoardDetailDto, CardDetailDto, LabelDto } from '@trello-clone/shared';

const label = (id: string, name: string, color: string): LabelDto => ({
  id,
  boardId: roadmapDetail.id,
  name,
  color,
});

/** roadmapBoard's labels: a colour-only green one and a named red one. */
export const greenLabel = label('clx0000000000000000000071', '', '#61bd4f');
export const urgentLabel = label('clx0000000000000000000072', 'Urgent', '#eb5a46');

/** roadmapWithCards with both labels; "Fix login" carries Urgent. */
export const roadmapWithLabels: BoardDetailDto = {
  ...roadmapWithCards,
  labels: [greenLabel, urgentLabel],
  lists: roadmapWithCards.lists.map((list) => ({
    ...list,
    cards: list.cards.map((card) =>
      card.id === loginCard.id ? { ...card, labelIds: [urgentLabel.id] } : card,
    ),
  })),
};

export const loginCardWithLabel: CardDetailDto = { ...loginCardDetail, labels: [urgentLabel] };

/** What the label form sends, and what the server answers. */
export const labelEdits = {
  create: {
    typed: '  Bug ',
    colour: 'Black',
    sent: { name: 'Bug', color: '#344563' },
    created: label('clx0000000000000000000073', 'Bug', '#344563'),
  },
  rename: { typed: 'Ready', sent: { name: 'Ready', color: '#61bd4f' } },
};

/** POST /boards/:boardId/labels refused: the message shows in the label form. */
export const labelCreateError = buildErrorBody({
  code: 'VALIDATION_ERROR',
  message: 'Name must be at most 50 characters',
  details: [],
});

export const labelToggleError = buildErrorBody({
  code: 'INTERNAL_ERROR',
  message: 'Something went wrong',
  details: [],
});
