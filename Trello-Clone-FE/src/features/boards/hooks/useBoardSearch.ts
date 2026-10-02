import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { boardsApi } from '../api';
import { useBoardFilters } from '../store';

import type { BoardDetailDto, SearchCardsQuery } from '@trello-clone/shared';

/** How long typing pauses before the text is searched. */
export const SEARCH_DEBOUNCE_MS = 300;
/** At most this many matches come back (D-14). */
export const SEARCH_LIMIT = 100;

// Search results (SEARCH-001) sit under their own prefix, not under ['board', id]: board fetches
// (and the realtime rules that watch them) never count a search.
export const searchKeys = {
  board: (boardId: string) => ['board-search', boardId] as const,
  query: (boardId: string, query: SearchCardsQuery) =>
    [...searchKeys.board(boardId), query] as const,
};

function useDebounced<T>(value: T, ms: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/**
 * The cards matching the board's filters (store.ts), from GET /boards/:boardId/search: `matches`
 * is null while no filter is set (nothing is dimmed), else the matching card ids (the previous
 * ones while a new search runs). Whenever the cached board changes (an own change, a realtime
 * event, a refetch) the search runs again, so the highlight follows the board.
 */
export function useBoardSearch(boardId: string, board: BoardDetailDto | undefined) {
  const queryClient = useQueryClient();
  const filters = useBoardFilters(boardId);
  const q = useDebounced(filters.q.trim(), SEARCH_DEBOUNCE_MS);
  const query: SearchCardsQuery = {
    ...(q && { q }),
    ...(filters.labelId && { labelId: filters.labelId }),
    ...(filters.memberId && { memberId: filters.memberId }),
    ...(filters.due && { due: filters.due }),
  };
  const active = Object.keys(query).length > 0;
  const result = useQuery({
    queryKey: searchKeys.query(boardId, query),
    queryFn: () => boardsApi.search(boardId, query),
    enabled: active,
    placeholderData: keepPreviousData,
  });

  const seen = useRef(board);
  useEffect(() => {
    if (seen.current === board) return;
    seen.current = board;
    void queryClient.invalidateQueries({ queryKey: searchKeys.board(boardId) });
  }, [board, boardId, queryClient]);

  const found = active ? result.data : undefined;
  const matches = useMemo(() => (found ? new Set(found.map((card) => card.id)) : null), [found]);
  return {
    active,
    /** The first answer for these filters has not come yet. */
    searching: active && !result.data && !result.isError,
    matches,
    count: matches?.size ?? 0,
    capped: (result.data?.length ?? 0) >= SEARCH_LIMIT,
    failed: active && result.isError,
    retry: () => void result.refetch(),
  };
}
