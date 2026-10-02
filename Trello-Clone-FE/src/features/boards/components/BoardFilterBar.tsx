import { SEARCH_DUE_FILTERS } from '@trello-clone/shared';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { hasFilters, useBoardFilters, useBoardFiltersStore } from '../store';

import type { BoardFilters } from '../store';

/** A label or member to filter by, as the board names it. */
export interface FilterOption {
  id: string;
  name: string;
}

interface BoardFilterBarProps {
  boardId: string;
  labels: readonly FilterOption[];
  members: readonly FilterOption[];
  /** What the search found (useBoardSearch). */
  result: {
    active: boolean;
    searching: boolean;
    count: number;
    capped: boolean;
    failed: boolean;
    retry: () => void;
  };
}

const DUE_LABELS: Record<NonNullable<BoardFilters['due']>, string> = {
  overdue: 'Overdue',
  week: 'Due in the next 7 days',
  none: 'No due date',
};

const SELECT =
  'h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50';

/**
 * The board toolbar (SEARCH-001, docs/design/ui.md → Board): search text, label, member and due
 * filters. Matching cards stay highlighted on the board and the others are dimmed; "Clear filters"
 * restores the board. The filters live in the board filter store (UI state).
 */
export function BoardFilterBar({ boardId, labels, members, result }: BoardFilterBarProps) {
  const filters = useBoardFilters(boardId);
  const change = useBoardFiltersStore((state) => state.change);
  const clear = useBoardFiltersStore((state) => state.clear);
  const set = (patch: Partial<BoardFilters>) => change(boardId, patch);
  const status =
    !result.active || result.failed
      ? ''
      : result.searching
        ? 'Searching…'
        : result.count === 0
          ? 'No cards match.'
          : `${result.count}${result.capped ? '+' : ''} ${result.count === 1 ? 'card matches' : 'cards match'}.`;

  return (
    <search aria-label="Filter cards" className="mx-4 mb-2 flex flex-wrap items-center gap-2">
      <Input
        type="search"
        aria-label="Search cards"
        placeholder="Search cards…"
        className="h-9 w-56 bg-background text-foreground"
        maxLength={100}
        value={filters.q}
        onChange={(event) => set({ q: event.target.value })}
      />
      <select
        aria-label="Label"
        className={SELECT}
        value={filters.labelId ?? ''}
        onChange={(event) => set({ labelId: event.target.value || undefined })}
      >
        <option value="">Any label</option>
        {labels.map((label) => (
          <option key={label.id} value={label.id}>
            {label.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Member"
        className={SELECT}
        value={filters.memberId ?? ''}
        onChange={(event) => set({ memberId: event.target.value || undefined })}
      >
        <option value="">Anyone</option>
        {members.map((member) => (
          <option key={member.id} value={member.id}>
            {member.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Due date"
        className={SELECT}
        value={filters.due ?? ''}
        onChange={(event) => set({ due: (event.target.value || undefined) as BoardFilters['due'] })}
      >
        <option value="">Any due date</option>
        {SEARCH_DUE_FILTERS.map((due) => (
          <option key={due} value={due}>
            {DUE_LABELS[due]}
          </option>
        ))}
      </select>
      {hasFilters(filters) && (
        <Button variant="secondary" size="sm" onClick={() => clear(boardId)}>
          Clear filters
        </Button>
      )}
      {result.active && result.failed && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 text-sm text-foreground"
        >
          Couldn&apos;t search the cards.
          <Button variant="secondary" size="sm" onClick={result.retry}>
            Try again
          </Button>
        </p>
      )}
      {/* Always in the page (empty when unused), so screen readers announce what it says. */}
      <p
        role="status"
        className={
          status ? 'rounded-md bg-background/90 px-2 py-1 text-sm text-foreground' : 'sr-only'
        }
      >
        {status}
      </p>
    </search>
  );
}
