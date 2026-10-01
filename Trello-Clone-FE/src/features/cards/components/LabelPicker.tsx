import { zodResolver } from '@hookform/resolvers/zod';
import { HexColorSchema, LabelNameSchema, type LabelDto } from '@trello-clone/shared';
import { ChevronLeftIcon, PencilIcon, TagIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { readableTextColor } from '@/features/boards';
import { cn } from '@/lib/utils';

import { useLabelMutations, useToggleCardLabel } from '../hooks/useLabels';
import { LABEL_COLORS, labelText } from '../labels';
import { errorMessage } from '../queries';

const SAVE_ERROR = "Couldn't save the label. Check your connection and try again.";

/** A label as a coloured chip with its name (or nothing, for a colour-only label). */
export function LabelChip({ label, className }: { label: LabelDto; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-7 min-w-12 items-center rounded px-2 text-sm font-medium',
        className,
      )}
      style={{ backgroundColor: label.color, color: readableTextColor(label.color) }}
    >
      {label.name || <span className="sr-only">{labelText(label)}</span>}
    </span>
  );
}

interface LabelPickerProps {
  boardId: string;
  cardId: string;
  /** Every label of the board, in order. */
  boardLabels: LabelDto[];
  /** The labels on the card. */
  cardLabels: LabelDto[];
}

type View = { kind: 'list' } | { kind: 'create' } | { kind: 'edit'; label: LabelDto };

/** `data-focus-id` of "Create a new label"; an "Edit label" button carries its label's id. */
const CREATE_BUTTON = 'create';

/**
 * "Labels" in the card modal (docs/design/ui.md → Card modal): a popover listing the board's
 * labels as checkboxes (checked = on this card), each with "Edit"; "Create a new label" and Edit
 * open a form with a name and the colour presets, and Edit can delete the label from the board.
 * Leaving a form puts the focus back on the button that opened it (the popover is not modal, so
 * a focus left on a removed element would fall out of it).
 */
export function LabelPicker({ boardId, cardId, boardLabels, cardLabels }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ kind: 'list' });
  const [returnFocus, setReturnFocus] = useState<string | null>(null);
  const content = useRef<HTMLDivElement>(null);
  const toggle = useToggleCardLabel(boardId, cardId);
  const backToList = (focusId: string) => {
    setReturnFocus(focusId);
    setView({ kind: 'list' });
  };
  useEffect(() => {
    if (view.kind !== 'list' || returnFocus === null) return;
    const target = content.current?.querySelector<HTMLElement>(`[data-focus-id="${returnFocus}"]`);
    (
      target ?? content.current?.querySelector<HTMLElement>(`[data-focus-id="${CREATE_BUTTON}"]`)
    )?.focus();
    setReturnFocus(null);
  }, [view, returnFocus]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setView({ kind: 'list' });
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="secondary" size="sm" className="justify-start">
          <TagIcon aria-hidden="true" />
          Labels
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={content}
        align="start"
        aria-label="Labels"
        className="flex flex-col gap-3"
      >
        {view.kind === 'list' ? (
          <>
            <h4 className="text-center text-sm font-semibold">Labels</h4>
            {boardLabels.length === 0 && (
              <p className="text-sm text-muted-foreground">This board has no labels yet.</p>
            )}
            <LabelList
              boardLabels={boardLabels}
              cardLabels={cardLabels}
              onToggle={(label, on) => toggle.mutate({ label, on })}
              onEdit={(label) => setView({ kind: 'edit', label })}
            />
            <Button
              variant="secondary"
              size="sm"
              data-focus-id={CREATE_BUTTON}
              onClick={() => setView({ kind: 'create' })}
            >
              Create a new label
            </Button>
          </>
        ) : (
          <LabelForm
            boardId={boardId}
            label={view.kind === 'edit' ? view.label : undefined}
            onDone={(focusId) => backToList(focusId)}
          />
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The board's labels as checkboxes. Each keeps its own checked state, so it changes the moment it
 * is clicked (the optimistic cache update only lands after in-flight queries are cancelled); the
 * state is reset in place whenever the card's labels change, so focus stays where it is.
 */
function LabelList({
  boardLabels,
  cardLabels,
  onToggle,
  onEdit,
}: {
  boardLabels: LabelDto[];
  cardLabels: LabelDto[];
  onToggle: (label: LabelDto, on: boolean) => void;
  onEdit: (label: LabelDto) => void;
}) {
  const ids = cardLabels.map((label) => label.id);
  const [checked, setChecked] = useState({ ids: ids.join(), on: new Set(ids) });
  if (checked.ids !== ids.join()) setChecked({ ids: ids.join(), on: new Set(ids) });
  const { on } = checked;

  return (
    <ul className="flex flex-col gap-1">
      {boardLabels.map((label) => (
        <li key={label.id} className="flex items-center gap-2">
          <label className="flex flex-1 items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={on.has(label.id)}
              onChange={(event) => {
                const isOn = event.target.checked;
                setChecked((current) => {
                  const next = new Set(current.on);
                  if (isOn) next.add(label.id);
                  else next.delete(label.id);
                  return { ...current, on: next };
                });
                onToggle(label, isOn);
              }}
            />
            <LabelChip label={label} className="flex-1" />
          </label>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={`Edit label ${labelText(label)}`}
            data-focus-id={label.id}
            onClick={() => onEdit(label)}
          >
            <PencilIcon aria-hidden="true" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

const LabelFormSchema = z.object({ name: LabelNameSchema, color: HexColorSchema });
type LabelFormInput = z.input<typeof LabelFormSchema>;
type LabelFormData = z.output<typeof LabelFormSchema>;

/** Create a label, or edit (and delete) `label`. */
function LabelForm({
  boardId,
  label,
  onDone,
}: {
  boardId: string;
  label: LabelDto | undefined;
  /** Back to the list, focusing the button with this `data-focus-id`. */
  onDone: (focusId: string) => void;
}) {
  const { create, update, remove } = useLabelMutations(boardId);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteButton = useRef<HTMLButtonElement>(null);
  const confirmed = useRef(false);
  // Cancelling the confirmation puts the focus back on "Delete" (the confirm block is removed).
  useEffect(() => {
    if (confirmDelete) confirmed.current = true;
    else if (confirmed.current) deleteButton.current?.focus();
  }, [confirmDelete]);
  // Where the focus goes back to: this label's "Edit" button, or "Create a new label".
  const opener = label?.id ?? CREATE_BUTTON;
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LabelFormInput, unknown, LabelFormData>({
    resolver: zodResolver(LabelFormSchema),
    defaultValues: { name: label?.name ?? '', color: label?.color ?? LABEL_COLORS[0].value },
  });
  const color = form.watch('color');
  const nameError = form.formState.errors.name?.message;
  const run = async (action: () => Promise<unknown>, focusId = opener) => {
    setError(null);
    try {
      await action();
      onDone(focusId);
    } catch (failure) {
      setError(errorMessage(failure, SAVE_ERROR));
    }
  };
  const busy = create.isPending || update.isPending || remove.isPending;

  return (
    <form
      noValidate
      aria-label={label ? 'Edit label' : 'Create label'}
      className="flex flex-col gap-3"
      onSubmit={(event) =>
        void form.handleSubmit((values) =>
          run(() =>
            label
              ? update.mutateAsync({ labelId: label.id, input: values })
              : create.mutateAsync(values),
          ),
        )(event)
      }
    >
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onDone(opener)}
        >
          <ChevronLeftIcon aria-hidden="true" />
          <span className="sr-only">Back to labels</span>
        </Button>
        <h4 className="text-sm font-semibold">{label ? 'Edit label' : 'Create a new label'}</h4>
      </div>
      <LabelChip label={{ id: '', boardId, name: form.watch('name').trim(), color }} />
      <div className="flex flex-col gap-1">
        <label htmlFor="label-name" className="text-xs font-semibold">
          Name
        </label>
        <Input
          id="label-name"
          autoFocus
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'label-name-error' : undefined}
          {...form.register('name')}
        />
        {nameError && (
          <p id="label-name-error" role="alert" className="text-sm text-destructive">
            {nameError}
          </p>
        )}
      </div>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-semibold">Colour</legend>
        <div className="grid grid-cols-5 gap-1.5">
          {LABEL_COLORS.map((preset) => (
            <label
              key={preset.value}
              className="h-7 rounded has-checked:ring-2 has-checked:ring-ring has-checked:ring-offset-1 has-focus-visible:ring-2 has-focus-visible:ring-ring"
              style={{ backgroundColor: preset.value }}
            >
              <input
                type="radio"
                value={preset.value}
                className="sr-only"
                aria-label={preset.name}
                {...form.register('color')}
              />
            </label>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {confirmDelete && label ? (
        <div className="flex flex-col gap-2 rounded-md bg-muted p-2">
          <p className="text-sm">
            The label is removed from every card. This can&apos;t be undone.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              autoFocus
              disabled={busy}
              onClick={() => void run(() => remove.mutateAsync(label.id), CREATE_BUTTON)}
            >
              Delete label
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex justify-between gap-2">
          <Button type="submit" size="sm" disabled={busy}>
            {label ? 'Save' : 'Create'}
          </Button>
          {label && (
            <Button
              ref={deleteButton}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
