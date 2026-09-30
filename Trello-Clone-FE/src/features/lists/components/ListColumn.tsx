import { ListHeader } from './ListHeader';

import type { BoardDetailDto } from '@trello-clone/shared';

interface ListColumnProps {
  list: BoardDetailDto['lists'][number];
  canEdit: boolean;
}

/** One list on the board (docs/design/ui.md → Board). Cards arrive with CARD-001. */
export function ListColumn({ list, canEdit }: ListColumnProps) {
  return (
    <section
      aria-label={list.title}
      className="flex w-[272px] shrink-0 flex-col gap-2 rounded-lg bg-muted p-2 text-foreground shadow-sm"
    >
      <ListHeader list={list} canEdit={canEdit} />
    </section>
  );
}
