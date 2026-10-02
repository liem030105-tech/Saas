import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';

import { boardsApi } from '../api';
import { searchKeys } from '../queries';
import { useBoardFilters } from '../store';

import type { SearchCardsQuery } from '@trello-clone/shared';

/** How long typing (or a burst of board changes) pauses before the cards are searched. */
export const SEARCH_DEBOUNCE_MS = 300;
/** At most this many matches come back (D-14). */
export const SEARCH_LIMIT = 100;

/** `value` once it has stopped changing for `ms`; an empty value at once (clearing is instant). */
function useDebounced(value: string, ms: number) {
  const [debounced, setDebounced] = useState(value);
  // Cleared: forget the old text now, so typing again soon never brings it back.
  if (value === '' && debounced !== '') setDebounced('');
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return value === '' ? '' : debounced;
}

/**
 * The cards matching the board's filters (store.ts), from GET /boards/:boardId/search.
 * - `matches` is null while no filter is set (nothing is dimmed), else the matching card ids. While
 *   the filters change (typing), the last answer for this board stays shown, with `searching`; after
 *   the filters were cleared, an old answer is never shown again.
 * - `boardUpdatedAt` is the board query's `dataUpdatedAt`: each change to the board (an own edit
 *   once confirmed, a realtime event, a refetch) searches again, at most once per pause.
 */
export function useBoardSearch(boardId: string, boardUpdatedAt: number) {
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
  // The board whose filters stayed set since its last answer: only its answer may stand in.
  const keepFrom = useRef<string | null>(null);
  const result = useQuery({
    queryKey: searchKeys.query(boardId, query),
    queryFn: ({ signal }) => boardsApi.search(boardId, query, signal),
    enabled: active,
    placeholderData: (previous) => (keepFrom.current === boardId ? previous : undefined),
  });
  const answered = active && result.data !== undefined && !result.isPlaceholderData;
  useEffect(() => {
    if (!active) keepFrom.current = null;
    else if (answered) keepFrom.current = boardId;
  }, [active, answered, boardId]);

  // Search again after board changes, once they pause.
  const seen = useRef(boardUpdatedAt);
  useEffect(() => {
    if (seen.current === boardUpdatedAt) return;
    seen.current = boardUpdatedAt;
    const timer = setTimeout(
      () => void queryClient.invalidateQueries({ queryKey: searchKeys.board(boardId) }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [boardUpdatedAt, boardId, queryClient]);

  const found = active ? result.data : undefined;
  const matches = useMemo(() => (found ? new Set(found.map((card) => card.id)) : null), [found]);
  return {
    active,
    /** No answer for the current filters yet (an earlier one may still be shown). */
    searching: active && !result.isError && (result.isPending || result.isPlaceholderData),
    matches,
    count: matches?.size ?? 0,
    capped: (found?.length ?? 0) >= SEARCH_LIMIT,
    failed: active && result.isError,
    retry: () => void result.refetch(),
  };
}
