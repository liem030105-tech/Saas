import { describe, expect, it } from 'vitest';

import { S3Storage } from './storage';

// The signed GET URL (ADR-020): signing is local, so no bucket is needed. The response headers it
// asks S3 for are part of the URL's query.

const storage = new S3Storage('test-bucket', {
  region: 'eu-west-1',
  credentials: { accessKeyId: 'test-key-id', secretAccessKey: 'test-only-secret' },
});

const headersOf = async (fileName: string, mimeType: string) => {
  const url = new URL(await storage.signedUrl('ws/card/uuid', fileName, mimeType));
  return {
    type: url.searchParams.get('response-content-type'),
    disposition: url.searchParams.get('response-content-disposition'),
    expires: url.searchParams.get('X-Amz-Expires'),
  };
};

describe('S3Storage.signedUrl', () => {
  it('images and PDFs open inline; anything else downloads; text is served as plain UTF-8', async () => {
    expect(await headersOf('shot.png', 'image/png')).toMatchObject({
      type: 'image/png',
      disposition: "inline; filename*=UTF-8''shot.png",
    });
    expect(await headersOf('notes.txt', 'text/plain')).toMatchObject({
      type: 'text/plain; charset=utf-8',
      disposition: "attachment; filename*=UTF-8''notes.txt",
    });
  });

  it('encodes the name per RFC 8187 and expires (D-27)', async () => {
    const headers = await headersOf("it's (ảnh)*.png", 'image/png');
    expect(headers.disposition).toBe("inline; filename*=UTF-8''it%27s%20%28%E1%BA%A3nh%29%2A.png");
    expect(Number(headers.expires)).toBeGreaterThan(0);
  });
});
