import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { delay, http as mswHttp, HttpResponse } from 'msw';

import { setAccessToken } from '@/api/token-store';
import { apiUrl } from '@/testing/data/api';
import { currentUser, freshAccessToken } from '@/testing/data/auth';
import { boardPathFor, roadmapBoard, roadmapDetail } from '@/testing/data/boards';
import {
  blankListTitle,
  blankListTitleMessage,
  doingList,
  listEdits,
  listServerErrors,
  newList,
  roadmapWithLists,
  todoList,
} from '@/testing/data/lists';
import { acmeAs } from '@/testing/data/workspaces';
import { server } from '@/testing/mocks/server';
import { renderApp } from '@/testing/render';

import { predictAppendPosition } from './queries';

import type { BoardDetailDto, ErrorResponse, Role } from '@trello-clone/shared';

const BOARD_URL = apiUrl(`/boards/${roadmapBoard.id}`);
const LISTS_URL = apiUrl(`/boards/${roadmapBoard.id}/lists`);

/**
 * Signed in with `role`; list requests are recorded and succeed (or answer `fail` with a 500).
 * Each GET of the board returns what the server holds at that moment.
 */
function signedInAs(role: Role, board: BoardDetailDto, options: { fail?: ErrorResponse } = {}) {
  const state = {
    board: structuredClone(board),
    posts: [] as unknown[],
    patches: [] as { listId: string; body: unknown }[],
    deletes: [] as string[],
  };
  const LIST_URL = apiUrl('/lists/:listId');
  server.use(
    mswHttp.post(apiUrl('/auth/refresh'), () =>
      HttpResponse.json({ data: { accessToken: freshAccessToken } }),
    ),
    mswHttp.get(apiUrl('/auth/me'), () => HttpResponse.json({ data: currentUser })),
    mswHttp.get(apiUrl('/workspaces'), () => HttpResponse.json({ data: [acmeAs(role)] })),
    mswHttp.get(BOARD_URL, () => HttpResponse.json({ data: state.board })),
    mswHttp.post(LISTS_URL, async ({ request }) => {
      state.posts.push(await request.json());
      // Long enough for the optimistic list to be seen before the answer lands.
      await delay(50);
      if (options.fail) return HttpResponse.json(options.fail, { status: 500 });
      state.board.lists.push({ ...newList.created, cards: [] });
      return HttpResponse.json({ data: newList.created }, { status: 201 });
    }),
    mswHttp.patch(LIST_URL, async ({ params, request }) => {
      const listId = params.listId as string;
      const body = (await request.json()) as { title?: string; archived?: boolean };
      state.patches.push({ listId, body });
      await delay(50);
      if (options.fail) return HttpResponse.json(options.fail, { status: 500 });
      const list = state.board.lists.find((item) => item.id === listId)!;
      Object.assign(list, body);
      if (body.archived) state.board.lists = state.board.lists.filter((item) => item !== list);
      return HttpResponse.json({ data: { ...list, cards: undefined } });
    }),
    mswHttp.delete(LIST_URL, async ({ params }) => {
      state.deletes.push(params.listId as string);
      await delay(50);
      if (options.fail) return HttpResponse.json(options.fail, { status: 500 });
      state.board.lists = state.board.lists.filter((item) => item.id !== params.listId);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return state;
}

async function openBoard(role: Role, board: BoardDetailDto, options?: { fail?: ErrorResponse }) {
  const state = signedInAs(role, board, options);
  renderApp(boardPathFor(roadmapBoard));
  await screen.findByRole('heading', { level: 1, name: roadmapBoard.title });
  return state;
}

const listTitles = () =>
  within(screen.getByRole('list', { name: 'Lists' }))
    .getAllByRole('heading', { level: 2 })
    .map((heading) => heading.textContent);

describe('lists on the board page', () => {
  afterEach(() => setAccessToken(null));

  it('shows the lists in position order', async () => {
    await openBoard('VIEWER', roadmapWithLists);

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
  });

  it('a MEMBER adds a list: it shows at once, the title is trimmed, and no position is sent', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    // Optimistic: the list is there before the server answers, and the field is ready for the next.
    await waitFor(() =>
      expect(listTitles()).toEqual([todoList.title, doingList.title, newList.sent.title]),
    );
    expect(screen.getByRole('textbox', { name: 'List title' })).toHaveValue('');
    await waitFor(() => expect(state.posts).toEqual([newList.sent]));
    await waitFor(() =>
      expect(listTitles()).toEqual([todoList.title, doingList.title, newList.sent.title]),
    );
  });

  it('an empty board offers "Add a list", and Escape closes the composer', async () => {
    await openBoard('MEMBER', roadmapDetail);

    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'List title' }), { key: 'Escape' });

    expect(screen.queryByRole('textbox', { name: 'List title' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Add a list' })).toBeVisible();
  });

  it('a blank title shows the field error and sends nothing', async () => {
    const state = await openBoard('MEMBER', roadmapDetail);

    fireEvent.click(screen.getByRole('button', { name: 'Add a list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: blankListTitle },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    expect(await screen.findByText(blankListTitleMessage)).toBeInTheDocument();
    expect(state.posts).toEqual([]);
  });

  it('a failed add removes the optimistic list and says so', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: listServerErrors.add });

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    await waitFor(() => expect(listTitles()).toContain(newList.sent.title));
    expect(await screen.findByText(listServerErrors.add.error.message)).toBeInTheDocument();
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('an archived board shows its lists without a composer, even to a MEMBER', async () => {
    await openBoard('MEMBER', { ...roadmapWithLists, archived: true });

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
    expect(screen.queryByRole('button', { name: /Add (a|another) list/ })).toBeNull();
  });

  it('a failed add still says so after the composer was closed', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: listServerErrors.addAfterClose });

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(
      await screen.findByText(listServerErrors.addAfterClose.error.message),
    ).toBeInTheDocument();
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('a VIEWER sees the lists but no composer', async () => {
    await openBoard('VIEWER', roadmapWithLists);

    expect(listTitles()).toEqual([todoList.title, doingList.title]);
    expect(screen.queryByRole('button', { name: /Add (a|another) list/ })).toBeNull();
  });
});

const openListMenu = async (title: string) => {
  fireEvent.keyDown(screen.getByRole('button', { name: `List actions for ${title}` }), {
    key: 'Enter',
  });
  return screen.findByRole('menu');
};

describe('list header', () => {
  afterEach(() => setAccessToken(null));

  it('a MEMBER renames a list in place (Enter saves the trimmed title)', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(screen.getByRole('button', { name: todoList.title }));
    const input = screen.getByRole('textbox', { name: 'List title' });
    fireEvent.change(input, { target: { value: listEdits.rename.typed } });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() =>
      expect(listTitles()).toEqual([listEdits.rename.sent.title, doingList.title]),
    );
    await waitFor(() =>
      expect(state.patches).toEqual([{ listId: todoList.id, body: listEdits.rename.sent }]),
    );
  });

  it('Escape cancels a rename and sends nothing', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(screen.getByRole('button', { name: todoList.title }));
    const input = screen.getByRole('textbox', { name: 'List title' });
    fireEvent.change(input, { target: { value: listEdits.rename.typed } });
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(await screen.findByRole('button', { name: todoList.title })).toBeInTheDocument();
    expect(state.patches).toEqual([]);
  });

  it('archiving a list removes it from the board at once and says so', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(
      within(await openListMenu(todoList.title)).getByRole('menuitem', { name: /Archive list/ }),
    );

    await waitFor(() => expect(listTitles()).toEqual([doingList.title]));
    expect(await screen.findByText(`${todoList.title} was archived.`)).toBeInTheDocument();
    expect(state.patches).toEqual([{ listId: todoList.id, body: listEdits.archive.sent }]);
  });

  it('a failed archive puts the list back and says so', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: listServerErrors.archive });

    fireEvent.click(
      within(await openListMenu(todoList.title)).getByRole('menuitem', { name: /Archive list/ }),
    );

    await waitFor(() => expect(listTitles()).toEqual([doingList.title]));
    expect(await screen.findByText(listServerErrors.archive.error.message)).toBeInTheDocument();
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('deleting a list asks first, then removes it', async () => {
    const state = await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(
      within(await openListMenu(doingList.title)).getByRole('menuitem', { name: /Delete list/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    expect(state.deletes).toEqual([]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    await waitFor(() => expect(listTitles()).toEqual([todoList.title]));
    expect(state.deletes).toEqual([doingList.id]);
    expect(await screen.findByText(`${doingList.title} was deleted.`)).toBeInTheDocument();
  });

  it('a failed delete keeps the list and shows the error in the dialog', async () => {
    await openBoard('MEMBER', roadmapWithLists, { fail: listServerErrors.remove });

    fireEvent.click(
      within(await openListMenu(doingList.title)).getByRole('menuitem', { name: /Delete list/ }),
    );
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete list' }));

    expect(
      await within(dialog).findByText(listServerErrors.remove.error.message),
    ).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    // Radix un-hides the page behind the modal once it has closed.
    await waitFor(() => expect(listTitles()).toEqual([todoList.title, doingList.title]));
  });

  it('a list being created is read-only until the server gives it an id', async () => {
    await openBoard('MEMBER', roadmapWithLists);

    fireEvent.click(screen.getByRole('button', { name: 'Add another list' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'List title' }), {
      target: { value: newList.typed },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));

    await waitFor(() => expect(listTitles()).toContain(newList.sent.title));
    const actionsFor = () =>
      screen.queryByRole('button', { name: `List actions for ${newList.sent.title}` });
    expect(actionsFor()).toBeNull();
    await waitFor(() => expect(actionsFor()).not.toBeNull());
  });

  it('a VIEWER sees list titles without rename or actions', async () => {
    await openBoard('VIEWER', roadmapWithLists);

    expect(screen.queryByRole('button', { name: todoList.title })).toBeNull();
    expect(screen.queryByRole('button', { name: /List actions/ })).toBeNull();
  });
});

describe('predictAppendPosition', () => {
  it('predicts what the server stores when appending', () => {
    expect(predictAppendPosition([])).toBe(1024);
    expect(predictAppendPosition(roadmapWithLists.lists)).toBe(newList.created.position);
  });
});
