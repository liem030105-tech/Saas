import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import { boardChangeKey, boardKeys } from '@/features/boards';

import { attachmentsApi } from '../api';
import {
  cardKeys,
  cardMutationScope,
  errorMessage,
  refetchCardWhenIdle,
  withCard,
} from '../queries';

import type { BoardDetailDto, CardDetailDto } from '@trello-clone/shared';

const UPLOAD_ERROR = "Couldn't upload the file. Check your connection and try again.";

/**
 * A card's attachments, changed from its modal (docs/api/cards.md → Attachments). Neither change
 * is optimistic: an upload shows its progress until the server has the file, and a delete waits
 * for the server (deleting the cover also clears the tile's cover). Both run in the card's
 * mutation scope (queries.ts) and show a toast with the API's message on error (413, 415, …).
 */
export function useAttachments(boardId: string, cardId: string) {
  const queryClient = useQueryClient();
  const cardKey = cardKeys.detail(cardId);
  const scope = cardMutationScope(cardId);
  const mutationKey = boardChangeKey(boardId); // the tile's cover
  const settle = () => refetchCardWhenIdle(queryClient, boardId, cardId);
  /** Upload progress, 0–1, while an upload is in flight. */
  const [progress, setProgress] = useState<number | null>(null);

  const upload = useMutation({
    scope,
    mutationKey,
    mutationFn: (file: File) => attachmentsApi.upload(cardId, file, setProgress),
    onMutate: () => setProgress(0),
    onSuccess: (attachment) =>
      queryClient.setQueryData<CardDetailDto>(cardKey, (card) =>
        card ? { ...card, attachments: [attachment, ...card.attachments] } : card,
      ),
    onError: (error) => toast.error(errorMessage(error, UPLOAD_ERROR)),
    onSettled: () => {
      setProgress(null);
      return settle();
    },
  });

  const remove = useMutation({
    scope,
    mutationKey,
    mutationFn: (attachmentId: string) => attachmentsApi.remove(attachmentId),
    onSuccess: (_result, attachmentId) => {
      const wasCover = queryClient.getQueryData<CardDetailDto>(cardKey)?.coverAttachmentId;
      queryClient.setQueryData<CardDetailDto>(cardKey, (card) =>
        card
          ? {
              ...card,
              attachments: card.attachments.filter((file) => file.id !== attachmentId),
              ...(card.coverAttachmentId === attachmentId && {
                coverAttachmentId: null,
                coverUrl: null,
              }),
            }
          : card,
      );
      if (wasCover === attachmentId) {
        queryClient.setQueryData<BoardDetailDto>(boardKeys.detail(boardId), (board) =>
          board ? withCard(board, cardId, (card) => ({ ...card, coverUrl: null })) : board,
        );
      }
    },
    onSettled: settle,
  });

  return { upload, remove, progress };
}

export type Attachments = ReturnType<typeof useAttachments>;
