import { buildErrorBody } from './api';
import { currentUser } from './auth';

import type { AttachmentDto } from '@trello-clone/shared';

// Attachment test data (ATTACHMENTS-001): the URLs stand in for the API's signed S3 URLs.

const me = { id: currentUser.id, name: currentUser.name, avatarUrl: null };
const ada = { id: 'clx0000000000000000000003', name: 'Ada Lovelace', avatarUrl: null };

const attachment = (
  id: string,
  fileName: string,
  mimeType: string,
  uploader: AttachmentDto['uploader'],
): AttachmentDto => ({
  id,
  fileName,
  mimeType,
  size: 2048,
  url: `https://files.example.test/${id}?signature=test`,
  createdAt: '2026-10-01T09:00:00.000Z',
  uploader,
});

/** An image the signed-in user uploaded. */
export const myScreenshot = attachment(
  'clx00000000000000000000a1',
  'screenshot.png',
  'image/png',
  me,
);
/** A PDF someone else uploaded: a MEMBER cannot delete it, an ADMIN can. */
export const adasSpec = attachment('clx00000000000000000000a2', 'spec.pdf', 'application/pdf', ada);
/** What POST /cards/:cardId/attachments answers for an uploaded `photo.png`. */
export const uploadedPhoto = attachment('clx00000000000000000000a3', 'photo.png', 'image/png', me);

export const unsupportedFileError = buildErrorBody({
  code: 'UNSUPPORTED_FILE_TYPE',
  message: 'This file type is not allowed',
  details: [],
});
