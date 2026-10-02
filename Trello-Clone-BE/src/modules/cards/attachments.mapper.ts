import { fileStorage } from '../../lib/storage';

import type { Prisma } from '../../generated/prisma/client';
import type { AttachmentDto } from '@trello-clone/shared';

// AttachmentDto (docs/api/cards.md, ATTACHMENTS-001): every one carries a fresh signed URL (ADR-020).

/** The uploader as an AttachmentDto shows them. */
export const UPLOADER = {
  uploader: { select: { id: true, name: true, avatarUrl: true } },
} satisfies Prisma.AttachmentInclude;

export type AttachmentRow = Prisma.AttachmentGetPayload<{ include: typeof UPLOADER }>;

/** docs/api/cards.md → AttachmentDto, with a fresh signed URL. */
export async function toAttachmentDto(attachment: AttachmentRow): Promise<AttachmentDto> {
  return {
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    url: await fileStorage().signedUrl(
      attachment.storageKey,
      attachment.fileName,
      attachment.mimeType,
    ),
    createdAt: attachment.createdAt.toISOString(),
    uploader: attachment.uploader,
  };
}
