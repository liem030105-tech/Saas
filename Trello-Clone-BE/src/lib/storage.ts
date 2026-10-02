import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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
  /** A GET URL for the object that expires; `fileName` names the download. */
  signedUrl(key: string, fileName: string): Promise<string>;
}

class S3Storage implements FileStorage {
  private readonly client: S3Client;

  constructor(private readonly bucket: string) {
    this.client = new S3Client({
      region: env.S3_REGION,
      ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT, forcePathStyle: true }),
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

  signedUrl(key: string, fileName: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      // The browser shows images and PDFs inline and saves the rest under the original name.
      ResponseContentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(fileName)}`,
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
  storage ??= env.S3_BUCKET ? new S3Storage(env.S3_BUCKET) : new MissingStorage();
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
