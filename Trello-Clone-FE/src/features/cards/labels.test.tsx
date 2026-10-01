import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard } from '@/testing/data/cards';
import {
  greenLabel,
  labelCreateError,
  labelEdits,
  labelToggleError,
  loginCardWithLabel,
  roadmapWithLabels,
  urgentLabel,
} from '@/testing/data/labels';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, CardDetailDto, LabelDto, Role } from '@trello-clone/shared';

const CARD_LABEL_URL = apiUrl('/cards/:cardId/labels/:labelId');

/** Signed in with `role` on roadmapBoard (with labels); label requests are recorded. */
function signedInAs(
  role: Role,
  options: {
    /** Toggling these labels fails with a 500 (all of them when `true`). */
    failToggle?: boolean | string[];
    failCreate?: boolean;
  } = {},
) {
  const state = {
    board: structuredClone(roadmapWithLabels) as BoardDetailDto,
    card: structuredClone(loginCardWithLabel) as CardDetailDto,
    calls: [] as string[],
    bodies: [] as unknown[],
  };
  const toggle =
    (on: boolean) =>
    async ({ params }: { params: Record<string, unknown> }) => {
      const labelId = params.labelId as string;
      state.calls.push(`${on ? 'POST' : 'DELETE'} ${labelId}`);
      await delay(50);
      const fails =
        options.failToggle === true ||
        (Array.isArray(options.failToggle) && options.failToggle.includes(labelId));
      if (fails) return HttpResponse.json(labelToggleError, { status: 500 });
      const label = state.board.labels.find((item) => item.id === labelId)!;
      const others = state.card.labels.filter((item) => item.id !== labelId);
      state.card.labels = on ? [...others, label] : others;
      state.board.lists[0]!.cards[0]!.labelIds = state.card.labels.map((item) => item.id);
      return new HttpResponse(null, { status: 204 });
    };
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
    mswHttp.post(CARD_LABEL_URL, toggle(true)),
    mswHttp.delete(CARD_LABEL_URL, toggle(false)),
    mswHttp.post(apiUrl(`/boards/${roadmapBoard.id}/labels`), async ({ request }) => {
      state.bodies.push(await request.json());
      if (options.failCreate) return HttpResponse.json(labelCreateError, { status: 400 });
      state.board.labels.push(labelEdits.create.created);
      return HttpResponse.json({ data: labelEdits.create.created }, { status: 201 });
    }),
    mswHttp.patch(apiUrl('/labels/:labelId'), async ({ params, request }) => {
      const body = (await request.json()) as Partial<LabelDto>;
      state.bodies.push(body);
      const label = state.board.labels.find((item) => item.id === params.labelId)!;
      Object.assign(label, body);
      return HttpResponse.json({ data: label });
    }),
    mswHttp.delete(apiUrl('/labels/:labelId'), ({ params }) => {
      state.calls.push(`DELETE label ${params.labelId as string}`);
      state.board.labels = state.board.labels.filter((item) => item.id !== params.labelId);
      state.card.labels = state.card.labels.filter((item) => item.id !== params.labelId);
      state.board.lists[0]!.cards[0]!.labelIds = state.card.labels.map((item) => item.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openPicker(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Labels' }));
  const picker = await screen.findByRole('dialog', { name: 'Labels' });
  return { state, dialog, picker };
}

/** The card's tile on the board (behind the modal, so hidden from the accessibility tree). */
const tileOf = () => screen.getByRole('link', { name: /Fix login/, hidden: true });

/** The label chips shown in the card modal (the section is left out when there are none). */
const modalChips = (dialog: HTMLElement) => {
  const list = within(dialog).queryByRole('list', { name: 'Labels' });
  return list
    ? within(list)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    : [];
};

describe('card labels (CARD-005a)', () => {
  afterEach(() => {
    setAccessToken(null);
    toast.dismiss();
  });

  it('a VIEWER sees the labels but cannot change them; the tile names them for screen readers', async () => {
    signedInAs('VIEWER');
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);

    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    expect(modalChips(dialog)).toEqual(['Urgent']);
    expect(within(dialog).queryByRole('button', { name: 'Labels' })).toBeNull();
    expect(tileOf()).toHaveTextContent('Labels: Urgent');
  });

  it('a MEMBER puts a label on and takes one off; the modal and the tile follow', async () => {
    const { state, dialog, picker } = await openPicker('MEMBER');

    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Green label' }));
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Urgent' }));

    await waitFor(() =>
      expect(state.calls).toEqual([`POST ${greenLabel.id}`, `DELETE ${urgentLabel.id}`]),
    );
    await waitFor(() => expect(modalChips(dialog)).toEqual(['Green label']));
    await waitFor(() => expect(tileOf()).toHaveTextContent('Labels: Green label'));
  });

  it('a failed change goes back with a toast: the checkbox, the modal and the tile', async () => {
    const { dialog, picker } = await openPicker('MEMBER', { failToggle: true });
    const green = within(picker).getByRole('checkbox', { name: 'Green label' });

    fireEvent.click(green);
    expect(green).toBeChecked();

    expect(await screen.findByText("Couldn't update the card's labels. Try again.")).toBeVisible();
    await waitFor(() => expect(modalChips(dialog)).toEqual(['Urgent']));
    expect(green).not.toBeChecked();
    expect(tileOf()).not.toHaveTextContent('Green label');
  });

  it('when the first of two quick changes fails, only it goes back; the second stays', async () => {
    const { state, dialog, picker } = await openPicker('MEMBER', { failToggle: [greenLabel.id] });

    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Green label' }));
    fireEvent.click(within(picker).getByRole('checkbox', { name: 'Urgent' }));

    expect(await screen.findByText("Couldn't update the card's labels. Try again.")).toBeVisible();
    // Urgent's removal is still on its way (the server answers it later), and still shows.
    expect(modalChips(dialog)).toEqual([]);
    expect(within(picker).getByRole('checkbox', { name: 'Urgent' })).not.toBeChecked();
    await waitFor(() => expect(state.calls).toHaveLength(2));
    expect(within(picker).getByRole('checkbox', { name: 'Urgent' })).not.toBeChecked();
  });

  it('a refused label keeps the form open with the reason', async () => {
    const { picker } = await openPicker('MEMBER', { failCreate: true });

    fireEvent.click(within(picker).getByRole('button', { name: 'Create a new label' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(await within(picker).findByRole('alert')).toHaveTextContent(
      'Name must be at most 50 characters',
    );
    expect(within(picker).getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });

  it('leaving a form puts the focus back on the button that opened it', async () => {
    const { picker } = await openPicker('MEMBER');

    fireEvent.click(within(picker).getByRole('button', { name: 'Edit label Green label' }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Back to labels' }));
    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: 'Edit label Green label' })).toHaveFocus(),
    );

    fireEvent.click(within(picker).getByRole('button', { name: 'Create a new label' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: labelEdits.create.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(within(picker).getByRole('button', { name: 'Create a new label' })).toHaveFocus(),
    );
  });

  it('a MEMBER creates a label; it is listed for the card', async () => {
    const { state, picker } = await openPicker('MEMBER');

    fireEvent.click(within(picker).getByRole('button', { name: 'Create a new label' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: labelEdits.create.typed },
    });
    fireEvent.click(screen.getByRole('radio', { name: labelEdits.create.colour }));
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    expect(
      await within(picker).findByRole('checkbox', { name: labelEdits.create.created.name }),
    ).not.toBeChecked();
    expect(state.bodies).toEqual([labelEdits.create.sent]);
  });

  it('a MEMBER renames a label, then deletes it after confirming', async () => {
    const { state, picker } = await openPicker('MEMBER');

    fireEvent.click(within(picker).getByRole('button', { name: 'Edit label Green label' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: labelEdits.rename.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await within(picker).findByRole('checkbox', { name: 'Ready' })).toBeInTheDocument();
    expect(state.bodies).toEqual([labelEdits.rename.sent]);

    fireEvent.click(within(picker).getByRole('button', { name: 'Edit label Urgent' }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(picker).getByRole('button', { name: 'Delete label' }));

    await waitFor(() =>
      expect(within(picker).queryByRole('checkbox', { name: 'Urgent' })).toBeNull(),
    );
    expect(state.calls).toEqual([`DELETE label ${urgentLabel.id}`]);
    await waitFor(() => expect(tileOf()).not.toHaveTextContent('Urgent'));
  });
});
