// Attachment test data (ATTACHMENTS-001): tiny files recognised by their bytes (D-19).

/** A 1×1 PNG. */
export const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** A Windows executable's header, renamed to look like an image. */
export const exeBytes = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(126, 0x90)]);

export const attachmentData = {
  workspaceName: 'Files',
  boardTitle: 'Roadmap',
  listTitle: 'To do',
  cardTitle: 'Fix login',
  png: { name: 'screen shot.png', bytes: pngBytes, mimeType: 'image/png' },
  text: {
    name: 'notes.txt',
    bytes: Buffer.from('Steps:\n1. Open /login\n'),
    mimeType: 'text/plain',
  },
  /** Saved as `.png`, but its bytes are an executable: refused (415). */
  disguised: { name: 'cat.png', bytes: exeBytes },
  /** Bytes with a NUL and no known signature: refused (415). */
  binary: { name: 'data.bin', bytes: Buffer.from([0, 1, 2, 3, 0, 255]) },
  /** A name with a path and characters a file system or header must not get. */
  unsafeName: { sent: '../../etc/pa<ss>wd:"x?.png', stored: 'passwdx.png' },
  /** One byte over the 10 MB limit (D-10). */
  tooLargeBytes: 10 * 1024 * 1024 + 1,
};
