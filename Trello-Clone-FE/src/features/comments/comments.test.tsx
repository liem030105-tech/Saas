import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import {
  formatMention,
  type BoardDetailDto,
  type CommentDto,
  type Role,
} from '@trello-clone/shared';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import {
  adaComment,
  commentServerError,
  myComment,
  newCommentInput,
  olderComment,
} from '@/testing/data/comments';
import { markdownSample, xssAttempts } from '@/testing/data/markdown';
import { acmeAs, ownerMember, plainMember } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

type Failing = 'create' | 'update' | 'remove' | 'list';

/**
 * Signed in as Grace with `role` on "Fix login", which has her comment and Ada's on the first
 * page and an older one on the second (`nextCursor` is Ada's comment).
 */
function signedInAs(role: Role, options: { fail?: Failing[]; archived?: boolean } = {}) {
  const fails = (what: Failing) => options.fail?.includes(what) ?? false;
  const failure = () => HttpResponse.json(commentServerError, { status: 500 });
  const state = {
    board: { ...structuredClone(roadmapWithCards), archived: options.archived ?? false },
    comments: [myComment, adaComment, olderComment].map((c) => structuredClone(c)),
    calls: [] as string[],
  } as { board: BoardDetailDto; comments: CommentDto[]; calls: string[] };
  const tileCard = () => state.board.lists[0]!.cards[0]!;
  tileCard().commentCount = state.comments.length;
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: state.board }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId'), () =>
      HttpResponse.json({ data: { ...loginCardDetail, commentCount: state.comments.length } }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId/comments'), ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      state.calls.push(cursor ? `GET comments after ${cursor}` : 'GET comments');
      if (fails('list')) return failure();
      const at = state.comments.findIndex((c) => c.id === cursor);
      // Like the API: a cursor that is not a comment of this card is a bad request.
      if (cursor && at < 0) return HttpResponse.json(commentServerError, { status: 400 });
      const start = cursor ? at + 1 : 0;
      const page = state.comments.slice(start, start + 2);
      const more = start + 2 < state.comments.length;
      return HttpResponse.json({ data: page, nextCursor: more ? page.at(-1)!.id : null });
    }),
    mswHttp.post(apiUrl('/cards/:cardId/comments'), async ({ request }) => {
      const { content } = (await request.json()) as { content: string };
      state.calls.push(`POST ${content}`);
      await delay(20);
      if (fails('create')) return failure();
      const comment: CommentDto = {
        ...myComment,
        id: 'clx0000000000000000000103',
        content,
        createdAt: '2026-09-30T15:00:00.000Z',
        updatedAt: '2026-09-30T15:00:00.000Z',
      };
      state.comments.unshift(comment);
      tileCard().commentCount += 1;
      return HttpResponse.json({ data: comment }, { status: 201 });
    }),
    mswHttp.patch(apiUrl('/comments/:commentId'), async ({ params, request }) => {
      const { content } = (await request.json()) as { content: string };
      state.calls.push(`PATCH ${content}`);
      if (fails('update')) return failure();
      const comment = state.comments.find((c) => c.id === params.commentId)!;
      Object.assign(comment, { content, updatedAt: '2026-09-30T16:00:00.000Z' });
      return HttpResponse.json({ data: comment });
    }),
    mswHttp.delete(apiUrl('/comments/:commentId'), async ({ params }) => {
      state.calls.push(`DELETE ${params.commentId as string}`);
      await delay(20);
      if (fails('remove')) return failure();
      state.comments = state.comments.filter((c) => c.id !== params.commentId);
      tileCard().commentCount -= 1;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openCard(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  const activity = within(dialog).getByRole('region', { name: 'Activity' });
  return { state, dialog, activity };
}

const commentBy = (scope: HTMLElement, name: string) =>
  within(scope).findByRole('article', { name: `Comment by ${name}` });
const tileOf = () => screen.getByRole('link', { name: /Fix login/, hidden: true });

describe('card comments (CARD-005d)', () => {
  afterEach(() => {
    setAccessToken(null);
    toast.dismiss();
  });

  it('a VIEWER reads the comments as markdown, newest first, with no way to change them', async () => {
    const { activity } = await openCard('VIEWER');

    const mine = await commentBy(activity, currentUser.name);
    expect(within(mine).getByText('staging').tagName).toBe('STRONG');
    const list = within(activity).getByRole('list', { name: 'Comments' });
    expect(
      within(list)
        .getAllByRole('article')
        .map((a) => a.getAttribute('aria-label')),
    ).toEqual([`Comment by ${currentUser.name}`, `Comment by ${adaComment.author.name}`]);
    expect(within(await commentBy(activity, adaComment.author.name)).getByText('(edited)'));
    expect(within(mine).queryByText('(edited)')).toBeNull();
    expect(within(activity).queryByRole('textbox')).toBeNull();
    expect(within(activity).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(activity).queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(tileOf()).toHaveTextContent('Comments:3');
  });

  it('"Load more comments" brings the next page, then goes away', async () => {
    const { state, activity } = await openCard('VIEWER');

    fireEvent.click(await within(activity).findByRole('button', { name: 'Load more comments' }));

    expect(await within(activity).findByText(olderComment.content)).toBeVisible();
    expect(state.calls).toEqual(['GET comments', `GET comments after ${adaComment.id}`]);
    expect(within(activity).queryByRole('button', { name: 'Load more comments' })).toBeNull();
  });

  it('a MEMBER adds a comment: trimmed, at the top, the field empties and the tile counts it', async () => {
    const { state, activity } = await openCard('MEMBER');
    await commentBy(activity, currentUser.name);
    const field = within(activity).getByRole('textbox', { name: 'Write a comment' });

    fireEvent.change(field, { target: { value: newCommentInput.typed } });
    fireEvent.click(within(activity).getByRole('button', { name: 'Comment' }));

    expect(await within(activity).findByText(newCommentInput.sent)).toBeVisible();
    await waitFor(() => expect(state.calls).toContain(`POST ${newCommentInput.sent}`));
    await waitFor(() =>
      expect(within(activity).getAllByRole('article')[0]).not.toHaveAttribute('aria-busy'),
    );
    expect(field).toHaveValue('');
    const first = within(activity).getAllByRole('article')[0]!;
    expect(first).toHaveTextContent(newCommentInput.sent);
    await waitFor(() => expect(tileOf()).toHaveTextContent('Comments:4'));
  });

  it('"@" offers the workspace\'s other members; picking one inserts a mention shown as a name', async () => {
    const { state, dialog, activity } = await openCard('MEMBER');
    await commentBy(activity, currentUser.name);
    const field = within(activity).getByRole('textbox', { name: 'Write a comment' });

    fireEvent.change(field, { target: { value: 'Thanks @' } });
    const picker = await within(activity).findByRole('listbox', { name: 'Mention someone' });
    // The author is not offered.
    expect(
      within(picker)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      expect.stringContaining(ownerMember.user.name),
      expect.stringContaining(plainMember.user.name),
    ]);

    // Typing narrows it; Escape closes it without closing the card.
    fireEvent.change(field, { target: { value: 'Thanks @lin' } });
    expect(within(activity).getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(field, { key: 'Escape' });
    await waitFor(() => expect(within(activity).queryByRole('listbox')).toBeNull());
    expect(dialog).toBeVisible();

    fireEvent.change(field, { target: { value: 'Thanks @linu' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    const token = formatMention(plainMember.user.name, plainMember.user.id);
    expect(field).toHaveValue(`Thanks ${token} `);
    // The caret is right after the mention, so typing goes on from there.
    expect((field as HTMLTextAreaElement).selectionStart).toBe(`Thanks ${token} `.length);
    expect(within(activity).queryByRole('listbox')).toBeNull();

    fireEvent.click(within(activity).getByRole('button', { name: 'Comment' }));
    await waitFor(() => expect(state.calls).toContain(`POST Thanks ${token}`));
    const first = within(activity).getAllByRole('article')[0]!;
    expect(within(first).getByText(plainMember.user.name).tagName).toBe('SPAN');
    expect(within(first).queryByRole('link')).toBeNull();
  });

  it('the "@" picker: arrows move and wrap, Tab or a click picks the highlighted person', async () => {
    const { activity } = await openCard('MEMBER');
    await commentBy(activity, currentUser.name);
    const field = within(activity).getByRole('textbox', { name: 'Write a comment' });
    fireEvent.change(field, { target: { value: '@' } });
    const options = await within(activity).findAllByRole('option');
    const selected = () => within(activity).getByRole('option', { selected: true });

    expect(selected()).toBe(options[0]);
    fireEvent.keyDown(field, { key: 'ArrowDown' });
    expect(selected()).toHaveTextContent(plainMember.user.name);
    expect(field).toHaveAttribute('aria-activedescendant', selected().id);
    fireEvent.keyDown(field, { key: 'ArrowDown' }); // wraps to the first
    expect(selected()).toHaveTextContent(ownerMember.user.name);
    fireEvent.keyDown(field, { key: 'ArrowUp' }); // wraps to the last
    expect(selected()).toHaveTextContent(plainMember.user.name);

    fireEvent.keyDown(field, { key: 'Tab' });
    const linus = formatMention(plainMember.user.name, plainMember.user.id);
    expect(field).toHaveValue(`${linus} `);

    fireEvent.change(field, { target: { value: `${linus} and @ad` } });
    fireEvent.mouseDown(
      await within(activity).findByRole('option', { name: ownerMember.user.name }),
    );
    const ada = formatMention(ownerMember.user.name, ownerMember.user.id);
    expect(field).toHaveValue(`${linus} and ${ada} `);
  });

  it('a blank comment is not sent', async () => {
    const { state, activity } = await openCard('MEMBER');
    await commentBy(activity, currentUser.name);

    fireEvent.change(within(activity).getByRole('textbox', { name: 'Write a comment' }), {
      target: { value: '   ' },
    });
    fireEvent.click(within(activity).getByRole('button', { name: 'Comment' }));

    expect(await within(activity).findByRole('alert')).toHaveTextContent('Write a comment');
    expect(state.calls).toEqual(['GET comments']);
  });

  it('a failed comment goes away; its text comes back into the field with the error', async () => {
    const { activity } = await openCard('MEMBER', { fail: ['create'] });
    await commentBy(activity, currentUser.name);
    const field = within(activity).getByRole('textbox', { name: 'Write a comment' });

    fireEvent.change(field, { target: { value: newCommentInput.typed } });
    fireEvent.click(within(activity).getByRole('button', { name: 'Comment' }));

    expect(await within(activity).findByRole('alert')).toHaveTextContent(
      commentServerError.error.message,
    );
    expect(field).toHaveValue(newCommentInput.sent);
    expect(within(activity).queryByText(newCommentInput.sent, { selector: 'p' })).toBeNull();
    await waitFor(() => expect(tileOf()).toHaveTextContent('Comments:3'));
  });

  it('a MEMBER edits their own comment (Escape cancels) but not Ada’s', async () => {
    const { state, dialog, activity } = await openCard('MEMBER');
    const mine = await commentBy(activity, currentUser.name);
    expect(
      within(await commentBy(activity, adaComment.author.name)).queryByRole('button', {
        name: 'Edit',
      }),
    ).toBeNull();

    fireEvent.click(within(mine).getByRole('button', { name: 'Edit' }));
    fireEvent.keyDown(within(mine).getByRole('textbox', { name: 'Edit comment' }), {
      key: 'Escape',
    });
    expect(dialog).toBeInTheDocument();
    expect(within(mine).queryByRole('textbox')).toBeNull();

    fireEvent.click(within(mine).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(mine).getByRole('textbox', { name: 'Edit comment' }), {
      target: { value: 'Fixed in production' },
    });
    fireEvent.click(within(mine).getByRole('button', { name: 'Save' }));

    expect(await within(mine).findByText('Fixed in production')).toBeVisible();
    expect(within(mine).getByText('(edited)')).toBeVisible();
    expect(state.calls).toContain('PATCH Fixed in production');
  });

  it('a failed edit stays open with the error', async () => {
    const { activity } = await openCard('MEMBER', { fail: ['update'] });
    const mine = await commentBy(activity, currentUser.name);

    fireEvent.click(within(mine).getByRole('button', { name: 'Edit' }));
    fireEvent.change(within(mine).getByRole('textbox', { name: 'Edit comment' }), {
      target: { value: 'Fixed in production' },
    });
    fireEvent.click(within(mine).getByRole('button', { name: 'Save' }));

    expect(await within(mine).findByRole('alert')).toHaveTextContent(
      commentServerError.error.message,
    );
    expect(within(mine).getByRole('textbox', { name: 'Edit comment' })).toHaveValue(
      'Fixed in production',
    );
  });

  it('a MEMBER deletes their own comment after confirming; the tile counts one less', async () => {
    const { state, activity } = await openCard('MEMBER');
    const mine = await commentBy(activity, currentUser.name);
    expect(
      within(await commentBy(activity, adaComment.author.name)).queryByRole('button', {
        name: 'Delete',
      }),
    ).toBeNull();

    fireEvent.click(within(mine).getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(mine).not.toBeInTheDocument());
    expect(state.calls).toContain(`DELETE ${myComment.id}`);
    await waitFor(() => expect(tileOf()).toHaveTextContent('Comments:2'));
  });

  it('an ADMIN deletes anyone’s comment but edits only their own', async () => {
    const { state, activity } = await openCard('ADMIN');
    const ada = await commentBy(activity, adaComment.author.name);
    expect(within(ada).queryByRole('button', { name: 'Edit' })).toBeNull();

    fireEvent.click(within(ada).getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));

    await waitFor(() => expect(ada).not.toBeInTheDocument());
    expect(state.calls).toContain(`DELETE ${adaComment.id}`);
  });

  it('a failed delete brings the comment back where it was, with a toast', async () => {
    const { activity } = await openCard('MEMBER', { fail: ['remove'] });
    const mine = await commentBy(activity, currentUser.name);

    fireEvent.click(within(mine).getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));

    expect(await screen.findByText("Couldn't delete the comment. Try again.")).toBeVisible();
    const back = await commentBy(activity, currentUser.name);
    expect(within(activity).getAllByRole('article')[0]).toBe(back);
    await waitFor(() => expect(tileOf()).toHaveTextContent('Comments:3'));
  });

  it('deleting the last comment of a page still lets "Load more comments" work', async () => {
    const { activity } = await openCard('ADMIN');
    const ada = await commentBy(activity, adaComment.author.name);

    fireEvent.click(within(ada).getByRole('button', { name: 'Delete' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Delete comment' }));
    await waitFor(() => expect(ada).not.toBeInTheDocument());
    // Ada's comment was the first page's cursor: the pages are fetched again without it.
    await waitFor(() =>
      expect(within(activity).queryByRole('button', { name: 'Load more comments' })).toBeNull(),
    );

    expect(await within(activity).findByText(olderComment.content)).toBeVisible();
    expect(within(activity).queryByRole('alert')).toBeNull();
  });

  it('on an archived board nobody writes, edits or deletes comments', async () => {
    const { activity } = await openCard('OWNER', { archived: true });
    await commentBy(activity, currentUser.name);

    expect(within(activity).queryByRole('textbox')).toBeNull();
    expect(within(activity).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(activity).queryByRole('button', { name: 'Delete' })).toBeNull();
  });

  it('a card without comments says so', async () => {
    const empty = signedInAs('VIEWER');
    empty.comments = [];
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    expect(await screen.findByText('No comments yet.')).toBeVisible();
  });

  it('a failed load offers "Try again"', async () => {
    const { state, activity } = await openCard('VIEWER', { fail: ['list'] });

    expect(await within(activity).findByRole('alert')).toHaveTextContent(
      "Couldn't load the comments.",
    );
    state.calls.length = 0;
    fireEvent.click(within(activity).getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(state.calls).toEqual(['GET comments']));
  });

  it.each(xssAttempts)('never runs script from a comment: $case', async ({ source }) => {
    const state = signedInAs('VIEWER');
    state.comments = [{ ...myComment, content: `${source}\n\n${markdownSample.source}` }];
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
    const mine = await screen.findByRole('article', { name: `Comment by ${currentUser.name}` });

    expect(within(mine).getByText(markdownSample.bold)).toBeVisible();
    expect(mine.querySelector('script, iframe, [onerror]')).toBeNull();
    expect(mine.querySelector('a[href^="javascript:"]')).toBeNull();
  });
});
