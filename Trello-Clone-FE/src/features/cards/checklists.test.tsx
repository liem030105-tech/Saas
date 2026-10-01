import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import { labelToggleError } from '@/testing/data/labels';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, CardDetailDto, ChecklistDto, Role } from '@trello-clone/shared';

const launch: ChecklistDto = {
  id: 'clx0000000000000000000081',
  title: 'Launch',
  position: 1024,
  items: [
    { id: 'clx0000000000000000000082', content: 'Write docs', done: true, position: 1024 },
    { id: 'clx0000000000000000000083', content: 'Ship it', done: false, position: 2048 },
  ],
};

/** Signed in with `role`; "Fix login" has the Launch checklist (1 of 2 done). */
function signedInAs(role: Role, options: { failToggle?: boolean } = {}) {
  const state = {
    board: structuredClone(roadmapWithCards) as BoardDetailDto,
    card: {
      ...structuredClone(loginCardDetail),
      checklists: [structuredClone(launch)],
    } as CardDetailDto,
    calls: [] as string[],
    created: 0,
  };
  const progress = () => {
    const items = state.card.checklists.flatMap((checklist) => checklist.items);
    state.board.lists[0]!.cards[0]!.checklist = {
      done: items.filter((item) => item.done).length,
      total: items.length,
    };
  };
  progress();
  const checklistOf = (id: unknown) => state.card.checklists.find((c) => c.id === id)!;
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
    mswHttp.post(apiUrl('/cards/:cardId/checklists'), async ({ request }) => {
      const { title } = (await request.json()) as { title: string };
      state.calls.push(`POST checklist ${title}`);
      const checklist = { id: 'clx0000000000000000000084', title, position: 2048, items: [] };
      state.card.checklists.push(checklist);
      return HttpResponse.json({ data: checklist }, { status: 201 });
    }),
    mswHttp.delete(apiUrl('/checklists/:checklistId'), ({ params }) => {
      state.calls.push(`DELETE checklist`);
      state.card.checklists = state.card.checklists.filter((c) => c.id !== params.checklistId);
      progress();
      return new HttpResponse(null, { status: 204 });
    }),
    mswHttp.post(apiUrl('/checklists/:checklistId/items'), async ({ params, request }) => {
      const { content } = (await request.json()) as { content: string };
      state.calls.push(`POST item ${content}`);
      state.created += 1;
      const item = {
        id: `clx000000000000000000009${state.created}`,
        content,
        done: false,
        position: 4096 * state.created,
      };
      checklistOf(params.checklistId).items.push(item);
      progress();
      return HttpResponse.json({ data: item }, { status: 201 });
    }),
    mswHttp.patch(apiUrl('/checklists/:checklistId/items/:itemId'), async ({ params, request }) => {
      const body = (await request.json()) as { done: boolean };
      state.calls.push(`PATCH item ${body.done}`);
      await delay(20);
      if (options.failToggle) return HttpResponse.json(labelToggleError, { status: 500 });
      const item = checklistOf(params.checklistId).items.find((x) => x.id === params.itemId)!;
      item.done = body.done;
      progress();
      return HttpResponse.json({ data: item });
    }),
    mswHttp.delete(apiUrl('/checklists/:checklistId/items/:itemId'), ({ params }) => {
      state.calls.push('DELETE item');
      const checklist = checklistOf(params.checklistId);
      checklist.items = checklist.items.filter((x) => x.id !== params.itemId);
      progress();
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

const tileOf = () => screen.getByRole('link', { name: /Fix login/, hidden: true });

async function openCard(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  const section = await within(dialog).findByRole('region', { name: 'Launch' });
  return { state, dialog, section };
}

const progressOf = (section: HTMLElement) =>
  within(section).getByRole('progressbar').getAttribute('aria-valuenow');

describe('card checklists (CARD-005c)', () => {
  afterEach(() => {
    setAccessToken(null);
    toast.dismiss();
  });

  it('a VIEWER sees the checklist and its progress, read-only', async () => {
    const { dialog, section } = await openCard('VIEWER');

    expect(progressOf(section)).toBe('50');
    expect(within(section).getByRole('checkbox', { name: 'Write docs' })).toBeChecked();
    expect(within(section).getByRole('checkbox', { name: 'Ship it' })).toBeDisabled();
    expect(within(section).queryByRole('button', { name: 'Add an item' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Checklist' })).toBeNull();
    await waitFor(() => expect(tileOf()).toHaveTextContent('1/2'));
  });

  it('a MEMBER ticks an item: the bar, the request and the tile badge follow', async () => {
    const { state, section } = await openCard('MEMBER');

    fireEvent.click(within(section).getByRole('checkbox', { name: 'Ship it' }));

    expect(within(section).getByRole('checkbox', { name: 'Ship it' })).toBeChecked();
    await waitFor(() => expect(progressOf(section)).toBe('100'));
    await waitFor(() => expect(state.calls).toEqual(['PATCH item true']));
    await waitFor(() => expect(tileOf()).toHaveTextContent('2/2'));
  });

  it('a failed tick goes back with a toast', async () => {
    const { section } = await openCard('MEMBER', { failToggle: true });
    const box = within(section).getByRole('checkbox', { name: 'Ship it' });

    fireEvent.click(box);

    expect(await screen.findByText("Couldn't update the checklist. Try again.")).toBeVisible();
    await waitFor(() => expect(box).not.toBeChecked());
    expect(progressOf(section)).toBe('50');
  });

  it('a MEMBER adds items one after another and deletes one', async () => {
    const { state, section } = await openCard('MEMBER');

    fireEvent.click(within(section).getByRole('button', { name: 'Add an item' }));
    for (const content of ['  Tell users ', 'Celebrate']) {
      fireEvent.change(within(section).getByRole('textbox', { name: 'Item' }), {
        target: { value: content },
      });
      fireEvent.submit(within(section).getByRole('form', { name: 'Add an item' }));
      await waitFor(() =>
        expect(within(section).getByRole('textbox', { name: 'Item' })).toHaveValue(''),
      );
    }
    expect(await within(section).findByRole('checkbox', { name: 'Celebrate' })).toBeInTheDocument();
    await waitFor(() =>
      expect(state.calls).toEqual(['POST item Tell users', 'POST item Celebrate']),
    );

    fireEvent.click(within(section).getByRole('button', { name: 'Delete item Write docs' }));
    await waitFor(() =>
      expect(within(section).queryByRole('checkbox', { name: 'Write docs' })).toBeNull(),
    );
    await waitFor(() => expect(tileOf()).toHaveTextContent('0/3'));
  });

  it('a MEMBER adds a checklist from "Add to card", and deletes one after confirming', async () => {
    const { state, dialog, section } = await openCard('MEMBER');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Checklist' }));
    const popover = await screen.findByRole('dialog', { name: 'Add checklist' });
    fireEvent.change(within(popover).getByRole('textbox', { name: 'Title' }), {
      target: { value: ' QA ' },
    });
    fireEvent.click(within(popover).getByRole('button', { name: 'Add' }));
    expect(await within(dialog).findByRole('region', { name: 'QA' })).toBeInTheDocument();

    fireEvent.click(within(section).getByRole('button', { name: 'Delete' }));
    const confirm = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete checklist' }));
    await waitFor(() =>
      expect(within(dialog).queryByRole('region', { name: 'Launch' })).toBeNull(),
    );
    expect(state.calls).toEqual(['POST checklist QA', 'DELETE checklist']);
  });
});
