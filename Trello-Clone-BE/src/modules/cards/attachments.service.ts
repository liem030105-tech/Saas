import { randomUUID } from 'node:crypto';

import { ATTACHMENT_MIME_TYPES, type AttachmentDto } from '@trello-clone/shared';
import { fileTypeFromBuffer } from 'file-type';

import { toAttachmentDto, UPLOADER, type AttachmentRow } from './attachments.mapper';
import { assertCardAccess, emitCardChanged } from './cards.service';
import { prisma } from '../../config/prisma';
import { Prisma } from '../../generated/prisma/client';
import { AppError } from '../../lib/app-error';
import { fileStorage, removeFiles } from '../../lib/storage';
import { assertBoardAccess, logActivity } from '../boards/boards.service';
import { hasPermission } from '../workspaces/permissions';

// docs/api/cards.md → Attachments (ATTACHMENTS-001). Files live in a private S3 bucket under
// `<workspaceId>/<cardId>/<uuid>` (ADR-020); the database keeps the key, and every response
// carries a fresh signed URL (D-27).

const ALLOWED = new Set<string>(ATTACHMENT_MIME_TYPES);

/**
 * The file's type from its bytes (D-19), never from its name or the client's Content-Type. Plain
 * text has no signature: a file without one counts as text/plain only if it is valid UTF-8 with
 * no NUL byte.
 */
async function verifiedMimeType(bytes: Buffer): Promise<string | null> {
  const detected = await fileTypeFromBuffer(bytes);
  if (detected) return ALLOWED.has(detected.mime) ? detected.mime : null;
  if (bytes.includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return 'text/plain';
  } catch {
    return null;
  }
}

/** The original name without any path, control characters or reserved symbols, ≤ 255 chars. */
export function sanitizeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? '';
  const clean = [...base]
    .filter((char) => char.charCodeAt(0) >= 0x20 && char !== '\u007f' && !'<>:"|?*'.includes(char))
    .join('')
    .trim()
    .slice(0, 255);
  return clean === '' || clean === '.' || clean === '..' ? 'file' : clean;
}

interface Upload {
  buffer: Buffer;
  originalname: string;
}

/**
 * POST /cards/:cardId/attachments (≥ MEMBER). The file goes to storage first, then the row and its
 * ATTACHMENT_ADDED entry are written in one transaction; if that fails (e.g. the card was deleted
 * meanwhile), the stored object is deleted again.
 */
export async function upload(userId: string, cardId: string, file: Upload): Promise<AttachmentDto> {
  const card = await assertCardAccess(userId, cardId, 'attachment.upload');
  const mimeType = await verifiedMimeType(file.buffer);
  if (!mimeType) {
    throw new AppError('UNSUPPORTED_FILE_TYPE', 415, 'This type of file cannot be attached');
  }
  const fileName = sanitizeFileName(file.originalname);
  const storageKey = `${card.workspaceId}/${cardId}/${randomUUID()}`;
  await fileStorage().put(storageKey, file.buffer, mimeType);

  let attachment: AttachmentRow;
  try {
    attachment = await prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          cardId,
          uploaderId: userId,
          storageKey,
          fileName,
          mimeType,
          size: file.buffer.length,
        },
        include: UPLOADER,
      });
      await logActivity(tx, {
        boardId: card.boardId,
        userId,
        cardId,
        type: 'ATTACHMENT_ADDED',
        data: { attachmentId: created.id, fileName },
      });
      return created;
    });
  } catch (error) {
    await removeFiles([storageKey]);
    // The card was deleted after the access check.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw AppError.notFound();
    }
    throw error;
  }
  await emitCardChanged(userId, cardId, card.workspaceId);
  return toAttachmentDto(attachment);
}

/**
 * DELETE /attachments/:attachmentId: its uploader (≥ MEMBER) or ≥ ADMIN. The row goes first (a
 * cover pointing to it is cleared, SetNull), then the file, after the commit.
 */
export async function remove(userId: string, attachmentId: string): Promise<void> {
  const attachment = await prisma.attachment.findUnique({
    where: { id: attachmentId },
    select: {
      uploaderId: true,
      storageKey: true,
      cardId: true,
      card: { select: { boardId: true } },
    },
  });
  if (!attachment) throw AppError.notFound();
  const { board, role } = await assertBoardAccess(
    userId,
    attachment.card.boardId,
    'attachment.deleteOwn',
  );
  if (attachment.uploaderId !== userId && !hasPermission(role, 'attachment.deleteAny')) {
    throw AppError.forbidden();
  }
  try {
    await prisma.attachment.delete({ where: { id: attachmentId } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw AppError.notFound();
    }
    throw error;
  }
  await removeFiles([attachment.storageKey]);
  await emitCardChanged(userId, attachment.cardId, board.workspaceId);
}
