// Upload rules for attachments (ATTACHMENTS-001, docs/architecture/security.md → File uploads).

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

/** Largest upload: the Free plan's 10 MB (D-10) for every workspace until BILLING-001. */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
