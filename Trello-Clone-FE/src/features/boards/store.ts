import { create } from 'zustand';

import type { SearchCardsQuery } from '@trello-clone/shared';

// The board filter bar's state (SEARCH-001): UI state, so Zustand (ADR-005), one entry per board,
// kept while the app is open. The matching cards themselves are server data (useBoardSearch).

export interface BoardFilters {
  /** As typed; trimmed and debounced before it is sent. */
  q: string;
  labelId?: string;
  memberId?: string;
  due?: SearchCardsQuery['due'];
}

const NONE: BoardFilters = { q: '' };

interface BoardFiltersState {
  byBoard: Record<string, BoardFilters>;
  change: (boardId: string, patch: Partial<BoardFilters>) => void;
  clear: (boardId: string) => void;
}

export const useBoardFiltersStore = create<BoardFiltersState>()((set) => ({
  byBoard: {},
  change: (boardId, patch) =>
    set(({ byBoard }) => ({
      byBoard: { ...byBoard, [boardId]: { ...NONE, ...byBoard[boardId], ...patch } },
    })),
  clear: (boardId) =>
    set(({ byBoard }) => {
      const rest = { ...byBoard };
      delete rest[boardId];
      return { byBoard: rest };
    }),
}));

/** One board's filters (none set by default). */
export const useBoardFilters = (boardId: string) =>
  useBoardFiltersStore((state) => state.byBoard[boardId] ?? NONE);

/** Any filter set (text counts once it is more than spaces). */
export const hasFilters = (filters: BoardFilters) =>
  filters.q.trim() !== '' || Boolean(filters.labelId || filters.memberId || filters.due);
