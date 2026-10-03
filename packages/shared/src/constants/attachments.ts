// Upload rules for attachments (ATTACHMENTS-001, docs/architecture/security.md → File uploads).

import { PLAN_LIMITS } from './plans';

/**
 * File types an attachment may have (D-19), checked against the file's bytes, never its name.
 * Images among them can be a card cover.
 */
export const ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

/** The types a card cover may have. */
export const COVER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const;

/**
 * The Free plan's largest upload (D-10). The server allows each workspace its plan's
 * `PLAN_LIMITS[plan].maxFileBytes`.
 */
export const MAX_ATTACHMENT_BYTES = PLAN_LIMITS.FREE.maxFileBytes;
