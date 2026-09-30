import { BoardTitleSchema, type BoardDetailDto, type UpdateBoardInput } from '@trello-clone/shared';
import { ArchiveIcon, ArchiveRestoreIcon, PaletteIcon, Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EditableTitle } from '@/components/forms/EditableTitle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { BOARD_BACKGROUNDS, readableTextColor } from '../colors';
import { useDeleteBoard, useUpdateBoard } from '../queries';

const SAVE_ERROR = "Couldn't save the board. Check your connection and try again.";
const DELETE_ERROR = "Couldn't delete the board. Check your connection and try again.";

const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR_CODE ? error.message : fallback;

interface BoardHeaderProps {
  board: BoardDetailDto;
  /** Rename, recolour, archive (≥ MEMBER; UX only, the API re-checks). */
  canEdit: boolean;
  /** Delete (≥ ADMIN). */
  canDelete: boolean;
  /** After a delete, e.g. open the workspace. */
  onDeleted: () => void;
}

/**
 * The board header (docs/design/ui.md → Board): the title (click to rename), colour, archive or
 * unarchive, and delete. A caller who may not edit sees the title only.
 */
export function BoardHeader({ board, canEdit, canDelete, onDeleted }: BoardHeaderProps) {
  const updateBoard = useUpdateBoard(board.id);
  const deleteBoard = useDeleteBoard(board.id, board.workspaceId);
  const color = readableTextColor(board.background);

  const save = (input: UpdateBoardInput) =>
    updateBoard.mutate(input, {
      onError: (error) => toast.error(errorMessage(error, SAVE_ERROR)),
    });

  return (
    <header className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ color }}>
      {canEdit ? (
        <EditableTitle
          title={board.title}
          schema={BoardTitleSchema}
          as="h1"
          hint="Rename board"
          inputLabel="Board title"
          headingClassName="text-xl font-semibold"
          inputClassName="h-9 w-72 max-w-full text-lg font-semibold"
          onRename={(title) => save({ title })}
        />
      ) : (
        <h1 className="px-2 text-xl font-semibold">{board.title}</h1>
      )}
      {canEdit && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary" size="sm">
                <PaletteIcon aria-hidden="true" />
                Colour
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuRadioGroup
                value={board.background}
                onValueChange={(background) => {
                  if (background !== board.background) save({ background });
                }}
              >
                {BOARD_BACKGROUNDS.map(({ name, value }) => (
                  <DropdownMenuRadioItem key={value} value={value}>
                    <span
                      aria-hidden="true"
                      className="size-4 rounded-sm"
                      style={{ backgroundColor: value }}
                    />
                    {name}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="secondary"
            size="sm"
            disabled={updateBoard.isPending}
            onClick={() => save({ archived: !board.archived })}
          >
            {board.archived ? (
              <>
                <ArchiveRestoreIcon aria-hidden="true" />
                Unarchive
              </>
            ) : (
              <>
                <ArchiveIcon aria-hidden="true" />
                Archive
              </>
            )}
          </Button>
          {canDelete && (
            <ConfirmDialog
              trigger={
                <Button variant="secondary" size="sm">
                  <Trash2Icon aria-hidden="true" />
                  Delete
                </Button>
              }
              title={`Delete ${board.title}?`}
              description="All its lists and cards are deleted for everyone. This can't be undone."
              confirmLabel="Delete board"
              pendingLabel="Deleting…"
              onConfirm={async () => {
                try {
                  await deleteBoard.mutateAsync();
                } catch (error) {
                  return errorMessage(error, DELETE_ERROR);
                }
                toast.success(`${board.title} was deleted.`);
                onDeleted();
                return null;
              }}
            />
          )}
        </div>
      )}
    </header>
  );
}
