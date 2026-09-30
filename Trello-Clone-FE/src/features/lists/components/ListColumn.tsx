import type { BoardDetailDto } from '@trello-clone/shared';

interface ListColumnProps {
  list: BoardDetailDto['lists'][number];
}

/** One list on the board (docs/design/ui.md → Board). Cards arrive with CARD-001. */
export function ListColumn({ list }: ListColumnProps) {
  return (
    <section
      aria-label={list.title}
      className="flex w-[272px] shrink-0 flex-col gap-2 rounded-lg bg-muted p-2 text-foreground shadow-sm"
    >
      <h2 className="px-2 py-1 text-sm font-semibold break-words">{list.title}</h2>
    </section>
  );
}
