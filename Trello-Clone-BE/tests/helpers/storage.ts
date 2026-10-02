import { setStorage, type FileStorage } from '../../src/lib/storage';

// An in-memory stand-in for the S3 bucket (ATTACHMENTS-001): tests see what was stored and
// removed, and can make the next call fail. Every test app gets a fresh one (test-app.ts).

export class MemoryStorage implements FileStorage {
  readonly objects = new Map<string, { body: Buffer; contentType: string }>();
  readonly removed: string[] = [];
  /** Makes the next `put` (or `remove`) throw, once. */
  failNext: 'put' | 'remove' | null = null;

  put(key: string, body: Buffer, contentType: string) {
    if (this.take('put')) return Promise.reject(new Error('storage down'));
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  remove(key: string) {
    if (this.take('remove')) return Promise.reject(new Error('storage down'));
    this.objects.delete(key);
    this.removed.push(key);
    return Promise.resolve();
  }

  signedUrl(key: string, fileName: string) {
    return Promise.resolve(
      `https://files.example.test/${key}?name=${encodeURIComponent(fileName)}&signature=test`,
    );
  }

  private take(call: 'put' | 'remove') {
    if (this.failNext !== call) return false;
    this.failNext = null;
    return true;
  }
}

/** Installs a fresh in-memory store and returns it. */
export function installMemoryStorage() {
  const storage = new MemoryStorage();
  setStorage(storage);
  return storage;
}
