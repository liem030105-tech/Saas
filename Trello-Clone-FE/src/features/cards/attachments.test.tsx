import { File as NodeFile } from 'node:buffer';

import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MAX_ATTACHMENT_BYTES } from '@trello-clone/shared';
import { http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import {
  adasSpec,
  attachmentServerError,
  myScreenshot,
  unsupportedFileError,
  uploadedPhoto,
} from '@/testing/data/attachments';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, CardDetailDto, Role } from '@trello-clone/shared';

// ATTACHMENTS-001c: the card modal's attachments and the tile's cover.

/** Signed in with `role`; "Fix login" has my screenshot and Ada's spec. */
function signedInAs(
  role: Role,
  options: {
    cover?: boolean;
    failUpload?: boolean;
    /** POST …/attachments waits until the test calls `state.answerUpload()`. */
    holdUpload?: boolean;
    failDelete?: boolean;
    /** PATCH /cards/:cardId waits until the test calls `state.answerCover()`. */
    holdCover?: boolean;
    /** PATCH /cards/:cardId fails with a 500. */
    failCover?: boolean;
  } = {},
) {
  const state = {
    board: structuredClone(roadmapWithCards) as BoardDetailDto,
    card: {
      ...structuredClone(loginCardDetail),
      attachments: [structuredClone(myScreenshot), structuredClone(adasSpec)],
    } as CardDetailDto,
    calls: [] as string[],
    answerCover: () => {},
    answerUpload: () => {},
  };
  const uploadAnswered = new Promise<void>((resolve) => {
    state.answerUpload = resolve;
  });
  if (!options.holdUpload) state.answerUpload();
  const coverAnswered = new Promise<void>((resolve) => {
    state.answerCover = resolve;
  });
  if (!options.holdCover) state.answerCover();
  const setCover = (id: string | null) => {
    const url = state.card.attachments.find((file) => file.id === id)?.url ?? null;
    state.card.coverAttachmentId = id;
    state.card.coverUrl = url;
    state.board.lists[0]!.cards[0]!.coverUrl = url;
  };
  if (options.cover) setCover(myScreenshot.id);
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: state.board }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId'), () => HttpResponse.json({ data: state.card })),
    mswHttp.post(apiUrl('/cards/:cardId/attachments'), async ({ request }) => {
      // The raw multipart body: parsing it would need Node's global File, which is jsdom's here.
      const file = { name: /filename="([^"]+)"/.exec(await request.text())?.[1] };
      state.calls.push(`POST ${file.name}`);
      await uploadAnswered;
      if (options.failUpload) return HttpResponse.json(unsupportedFileError, { status: 415 });
      state.card.attachments.unshift(structuredClone(uploadedPhoto));
      return HttpResponse.json({ data: uploadedPhoto }, { status: 201 });
    }),
    mswHttp.patch(apiUrl('/cards/:cardId'), async ({ request }) => {
      const body = (await request.json()) as { coverAttachmentId: string | null };
      state.calls.push(`PATCH cover ${body.coverAttachmentId}`);
      await coverAnswered;
      if (options.failCover) return HttpResponse.json(attachmentServerError, { status: 500 });
      state.calls.push('PATCH answered');
      setCover(body.coverAttachmentId);
      return HttpResponse.json({ data: state.card });
    }),
    mswHttp.delete(apiUrl('/attachments/:attachmentId'), ({ params }) => {
      state.calls.push(`DELETE ${String(params.attachmentId)}`);
      if (options.failDelete) return HttpResponse.json(attachmentServerError, { status: 500 });
      if (state.card.coverAttachmentId === params.attachmentId) setCover(null);
      state.card.attachments = state.card.attachments.filter((f) => f.id !== params.attachmentId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

const tileOf = () => screen.getByRole('link', { name: /Fix login/, hidden: true });
const coverOf = () => tileOf().querySelector('img')?.getAttribute('src') ?? null;

async function openCard(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  const section = await within(dialog).findByRole('region', { name: 'Attachments' });
  return { state, dialog, section };
}

const attach = (section: HTMLElement, file: File) =>
  fireEvent.change(within(section).getByLabelText('Attach a file'), {
    target: { files: [file] },
  });

/**
 * Uploads go through Node's FormData and File: Vitest's jsdom `Request` cannot send a jsdom
 * FormData with a file (it reads a jsdom internal, jsdom 30, and drops the file name), so MSW
 * would never see the upload. Node's FormData comes from its own Request (the class Vitest's
 * extends), its File from `node:buffer` (Node 24's parser looks up the global File, jsdom's here).
 */
async function nodeFormData() {
  const NodeRequest = Object.getPrototypeOf(Request) as typeof Request;
  const form = await new NodeRequest('http://localhost/', {
    method: 'POST',
    body: new URLSearchParams('a=1'),
  }).formData();
  return form.constructor as typeof FormData;
}

const png = (name: string) =>
  new NodeFile([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });

describe('card attachments (ATTACHMENTS-001)', () => {
  // Node's FormData for the uploads (see nodeFormData).
  beforeEach(async () => {
    vi.stubGlobal('FormData', await nodeFormData());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    setAccessToken(null);
    toast.dismiss();
  });

  it('a VIEWER sees the files as links, with nothing to change', async () => {
    const { section } = await openCard('VIEWER');

    const link = within(section).getByRole('link', { name: 'spec.pdf' });
    expect(link).toHaveAttribute('href', adasSpec.url);
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(within(section).queryByRole('button', { name: 'Add attachment' })).toBeNull();
    expect(within(section).queryByRole('button', { name: /Make cover/ })).toBeNull();
    expect(within(section).queryByRole('button', { name: /Delete attachment/ })).toBeNull();
  });

  it('a MEMBER uploads an image and makes it the cover: the tile shows it at once', async () => {
    const { state, section } = await openCard('MEMBER', { holdUpload: true, holdCover: true });

    attach(section, png('photo.png'));

    // The progress shows until the server has the file; "Add attachment" waits for it.
    expect(await within(section).findByRole('status')).toHaveTextContent('Uploading photo.png…');
    expect(within(section).getByRole('progressbar', { name: 'Upload progress' })).toBeVisible();
    expect(within(section).getByRole('button', { name: 'Add attachment' })).toBeDisabled();
    state.answerUpload();
    expect(await within(section).findByRole('link', { name: 'photo.png' })).toBeVisible();
    expect(within(section).queryByRole('status')).toBeNull();
    expect(state.calls).toEqual(['POST photo.png']);
    expect(coverOf()).toBeNull();

    fireEvent.click(within(section).getByRole('button', { name: 'Make cover: photo.png' }));

    // Before the server answers: the tile and the modal already show the cover.
    await waitFor(() => expect(coverOf()).toBe(uploadedPhoto.url));
    expect(within(section).getByRole('button', { name: 'Remove cover: photo.png' })).toBeVisible();
    await waitFor(() =>
      expect(state.calls).toEqual(['POST photo.png', `PATCH cover ${uploadedPhoto.id}`]),
    );
    state.answerCover();
    await waitFor(() => expect(state.calls).toContain('PATCH answered'));
    expect(coverOf()).toBe(uploadedPhoto.url);
    // Only images can be a cover.
    expect(within(section).queryByRole('button', { name: /cover: spec\.pdf/ })).toBeNull();
  });

  it('removing the cover sends null and clears the tile', async () => {
    const { state, section } = await openCard('MEMBER', { cover: true });
    await waitFor(() => expect(coverOf()).toBe(myScreenshot.url));

    fireEvent.click(within(section).getByRole('button', { name: 'Remove cover: screenshot.png' }));

    await waitFor(() => expect(coverOf()).toBeNull());
    await waitFor(() => expect(state.calls).toEqual(['PATCH cover null', 'PATCH answered']));
  });

  it('a failed cover change goes back, with a toast', async () => {
    const { state, section } = await openCard('MEMBER', {
      cover: true,
      holdCover: true,
      failCover: true,
    });
    await waitFor(() => expect(coverOf()).toBe(myScreenshot.url));

    fireEvent.click(within(section).getByRole('button', { name: 'Remove cover: screenshot.png' }));
    await waitFor(() => expect(coverOf()).toBeNull());
    state.answerCover();

    expect(await screen.findByText(attachmentServerError.error.message)).toBeVisible();
    await waitFor(() => expect(coverOf()).toBe(myScreenshot.url));
    expect(
      within(section).getByRole('button', { name: 'Remove cover: screenshot.png' }),
    ).toBeVisible();
  });

  it("a refused upload shows the API's message; a file over the limit is never sent", async () => {
    const { state, section } = await openCard('MEMBER', { failUpload: true });

    attach(section, png('cat.png'));
    expect(await screen.findByText(unsupportedFileError.error.message)).toBeVisible();
    expect(within(section).queryByRole('link', { name: 'cat.png' })).toBeNull();

    const big = png('big.png');
    Object.defineProperty(big, 'size', { value: MAX_ATTACHMENT_BYTES + 1 });
    attach(section, big);
    expect(await screen.findByText('Files can be at most 10 MB.')).toBeVisible();
    expect(state.calls).toEqual(['POST cat.png']);
  });

  it("a MEMBER deletes their own file but not someone else's; deleting the cover clears it", async () => {
    const { state, section } = await openCard('MEMBER', { cover: true });
    await waitFor(() => expect(coverOf()).toBe(myScreenshot.url));
    expect(
      within(section).queryByRole('button', { name: 'Delete attachment spec.pdf' }),
    ).toBeNull();

    fireEvent.click(
      within(section).getByRole('button', { name: 'Delete attachment screenshot.png' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Delete attachment' }));

    await waitFor(() =>
      expect(within(section).queryByRole('link', { name: 'screenshot.png' })).toBeNull(),
    );
    expect(state.calls).toEqual([`DELETE ${myScreenshot.id}`]);
    await waitFor(() => expect(coverOf()).toBeNull());
  });

  it('an ADMIN deletes anyone’s file; a failure stays in the dialog', async () => {
    const { section } = await openCard('ADMIN', { failDelete: true });

    fireEvent.click(within(section).getByRole('button', { name: 'Delete attachment spec.pdf' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete attachment' }));

    const alert = await screen.findByRole('alertdialog');
    expect(await within(alert).findByText(attachmentServerError.error.message)).toBeVisible();
    expect(
      within(section).getByRole('link', { name: 'spec.pdf', hidden: true }),
    ).toBeInTheDocument();
  });
});
