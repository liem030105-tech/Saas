import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

import type { z } from 'zod';

interface EditableTitleProps {
  title: string;
  /** Trims and checks the draft; its first message is shown when the draft is invalid. */
  schema: z.ZodType<string, string>;
  /** The heading level the title renders at. */
  as: 'h1' | 'h2' | 'h3';
  /** Tooltip on the title button, e.g. "Rename board". */
  hint: string;
  /** The field's accessible name, e.g. "Board title". */
  inputLabel: string;
  headingClassName?: string;
  inputClassName?: string;
  onRename: (title: string) => void;
}

/**
 * A title that edits in place (docs/design/ui.md → Rename in place): the title is a button, and
 * clicking it swaps in a field. Enter and Escape leave the field, and leaving it saves (or, after
 * Escape, cancels), so a save runs once however the field is left. An unchanged title saves
 * nothing.
 */
export function EditableTitle({
  title,
  schema,
  as: Heading,
  hint,
  inputLabel,
  headingClassName,
  inputClassName,
  onRename,
}: EditableTitleProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const cancelled = useRef(false);

  const finish = () => {
    if (draft === null) return;
    setDraft(null);
    if (cancelled.current) {
      cancelled.current = false;
      return;
    }
    const parsed = schema.safeParse(draft);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid title');
      return;
    }
    if (parsed.data !== title) onRename(parsed.data);
  };

  if (draft === null) {
    return (
      <Heading className={headingClassName}>
        <button
          type="button"
          // The title stays the button's name; the tooltip becomes its description.
          title={hint}
          className="w-full rounded-md px-2 py-1 text-left break-words hover:bg-black/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => setDraft(title)}
        >
          {title}
        </button>
      </Heading>
    );
  }
  return (
    <Input
      aria-label={inputLabel}
      autoFocus
      value={draft}
      className={cn('bg-background text-foreground', inputClassName)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={(event) => {
        if (event.key === 'Escape') cancelled.current = true;
        if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
      }}
    />
  );
}
