import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';
import { toast } from 'sonner';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard } from '@/testing/data/boards';
import { loginCard, loginCardDetail, roadmapWithCards } from '@/testing/data/cards';
import { labelToggleError } from '@/testing/data/labels';
import { acmeAs, membersWith, ownerMember, plainMember } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import type { BoardDetailDto, CardDetailDto, Role } from '@trello-clone/shared';

const CARD_MEMBER_URL = apiUrl('/cards/:cardId/members/:userId');
const ada = ownerMember.user;
const linus = plainMember.user;
const summary = ({ id, name, avatarUrl }: typeof ada) => ({ id, name, avatarUrl });

/** Signed in with `role`; "Fix login" has Ada on it. Assign and unassign are recorded. */
function signedInAs(role: Role, options: { failToggle?: boolean } = {}) {
  const state = {
    board: structuredClone(roadmapWithCards) as BoardDetailDto,
    card: { ...structuredClone(loginCardDetail), members: [summary(ada)] } as CardDetailDto,
    calls: [] as string[],
  };
  state.board.lists[0]!.cards[0]!.memberIds = [ada.id];
  const toggle =
    (on: boolean) =>
    async ({ params }: { params: Record<string, unknown> }) => {
      const userId = params.userId as string;
      state.calls.push(`${on ? 'POST' : 'DELETE'} ${userId}`);
      await delay(20);
      if (options.failToggle) return HttpResponse.json(labelToggleError, { status: 500 });
      const user = membersWith(role).find((member) => member.user.id === userId)!.user;
      const others = state.card.members.filter((member) => member.id !== userId);
      state.card.members = on ? [...others, summary(user)] : others;
      state.board.lists[0]!.cards[0]!.memberIds = state.card.members.map((member) => member.id);
      return new HttpResponse(null, { status: 204 });
    };
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(apiUrl('/workspaces/:workspaceId/members'), () =>
      HttpResponse.json({ data: membersWith(role) }),
    ),
    mswHttp.get(apiUrl(`/boards/${roadmapBoard.id}`), () =>
      HttpResponse.json({ data: state.board }),
    ),
    mswHttp.get(apiUrl('/cards/:cardId'), () => HttpResponse.json({ data: state.card })),
    mswHttp.post(CARD_MEMBER_URL, toggle(true)),
    mswHttp.delete(CARD_MEMBER_URL, toggle(false)),
  );
  return state;
}

/** The card's tile on the board (behind the modal, so hidden from the accessibility tree). */
const tileOf = () => screen.getByRole('link', { name: /Fix login/, hidden: true });

/** Who the modal's "Members" section names (it is left out when there are none). */
const modalMembers = (dialog: HTMLElement) => {
  const section = within(dialog).queryByRole('region', { name: 'Members' });
  if (!section) return [];
  return [ada.name, linus.name, currentUser.name].filter(
    (name) => within(section).queryByText(name) !== null,
  );
};

async function openPicker(role: Role, options?: Parameters<typeof signedInAs>[1]) {
  const state = signedInAs(role, options);
  renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);
  const dialog = await screen.findByRole('dialog', { name: loginCard.title });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Members' }));
  const picker = await screen.findByRole('dialog', { name: 'Members' });
  return { state, dialog, picker };
}

describe('card members (CARD-005b)', () => {
  afterEach(() => {
    setAccessToken(null);
    toast.dismiss();
  });

  it('a VIEWER sees who is on the card, read-only; the tile names them', async () => {
    signedInAs('VIEWER');
    renderApp(`${boardPathFor(roadmapBoard)}/c/${loginCard.id}`);

    const dialog = await screen.findByRole('dialog', { name: loginCard.title });
    expect(modalMembers(dialog)).toEqual([ada.name]);
    expect(within(dialog).queryByRole('button', { name: 'Members' })).toBeNull();
    await waitFor(() => expect(tileOf()).toHaveTextContent(`Members: ${ada.name}`));
  });

  it('a MEMBER lists the workspace members, assigns one and unassigns another', async () => {
    const { state, dialog, picker } = await openPicker('MEMBER');

    expect(within(picker).getByRole('checkbox', { name: ada.name })).toBeChecked();
    expect(within(picker).getByRole('checkbox', { name: currentUser.name })).not.toBeChecked();
    fireEvent.click(within(picker).getByRole('checkbox', { name: linus.name }));
    fireEvent.click(within(picker).getByRole('checkbox', { name: ada.name }));

    await waitFor(() => expect(state.calls).toEqual([`POST ${linus.id}`, `DELETE ${ada.id}`]));
    await waitFor(() => expect(modalMembers(dialog)).toEqual([linus.name]));
    await waitFor(() => expect(tileOf()).toHaveTextContent(`Members: ${linus.name}`));
  });

  it('a failed assignment goes back with a toast', async () => {
    const { dialog, picker } = await openPicker('MEMBER', { failToggle: true });
    const box = within(picker).getByRole('checkbox', { name: linus.name });

    fireEvent.click(box);
    expect(box).toBeChecked();

    expect(await screen.findByText("Couldn't update the card's members. Try again.")).toBeVisible();
    await waitFor(() => expect(box).not.toBeChecked());
    expect(modalMembers(dialog)).toEqual([ada.name]);
    expect(tileOf()).not.toHaveTextContent(linus.name);
  });
});
