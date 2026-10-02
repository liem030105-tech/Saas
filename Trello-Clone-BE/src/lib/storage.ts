import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { COVER_MIME_TYPES } from '@trello-clone/shared';

import { env } from '../config/env';
import { logger } from '../config/logger';

// File storage (ATTACHMENTS-001, ADR-020): a private S3 bucket. Only object keys are stored in the
// database; every response that shows a file gets a fresh signed GET URL (lifetime D-27). Tests
// swap in an in-memory store (setStorage).

export interface FileStorage {
  /** Stores `body` under `key`. */
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Deletes the object (deleting a missing one is not an error). */
  remove(key: string): Promise<void>;
  /**
   * A GET URL for the object that expires (D-27), served as `mimeType` under `fileName`: images and
   * PDFs open in the browser, anything else downloads.
   */
  signedUrl(key: string, fileName: string, mimeType: string): Promise<string>;
}

const INLINE = new Set<string>([...COVER_MIME_TYPES, 'application/pdf']);

/** A header parameter value per RFC 8187 (also encodes what encodeURIComponent leaves: !'()*). */
const rfc8187 = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export class S3Storage implements FileStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      region?: string;
      endpoint?: string;
      credentials?: { accessKeyId: string; secretAccessKey: string };
    },
  ) {
    this.client = new S3Client({
      region: options.region,
      ...(options.credentials && { credentials: options.credentials }),
      ...(options.endpoint && { endpoint: options.endpoint, forcePathStyle: true }),
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async remove(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  signedUrl(key: string, fileName: string, mimeType: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // The verified type (S3 cannot add nosniff), and only images and PDFs inline: text that is
      // really HTML or script is never rendered from the bucket.
      ResponseContentType: mimeType === 'text/plain' ? 'text/plain; charset=utf-8' : mimeType,
      ResponseContentDisposition: `${INLINE.has(mimeType) ? 'inline' : 'attachment'}; filename*=UTF-8''${rfc8187(fileName)}`,
    });
    return getSignedUrl(this.client, command, { expiresIn: env.S3_URL_TTL_SECONDS });
  }
}

/** Without a bucket configured, every call fails (and the request answers 500, logged). */
class MissingStorage implements FileStorage {
  private fail(): never {
    throw new Error('File storage is not configured (S3_BUCKET, S3_REGION; ADR-020)');
  }
  put = async () => this.fail();
  remove = async () => this.fail();
  signedUrl = async () => this.fail();
}

let storage: FileStorage | null = null;

export function fileStorage(): FileStorage {
  storage ??= env.S3_BUCKET
    ? new S3Storage(env.S3_BUCKET, { region: env.S3_REGION, endpoint: env.S3_ENDPOINT })
    : new MissingStorage();
  return storage;
}

/** Tests replace the store (and back with `null`). */
export function setStorage(next: FileStorage | null) {
  storage = next;
}

/**
 * Deletes objects after the database no longer points to them: a failure is retried once, then
 * logged (the object is orphaned; no cleanup job, see ATTACHMENTS-001 → Risks). Never throws.
 */
export async function removeFiles(keys: readonly string[]) {
  for (const key of keys) {
    try {
      await fileStorage().remove(key);
    } catch {
      try {
        await fileStorage().remove(key);
      } catch (error) {
        logger.error({ err: error, storageKey: key }, 'Could not delete an attachment file');
      }
    }
  }
}
