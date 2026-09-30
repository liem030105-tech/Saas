import { ListTitleSchema, type BoardDetailDto } from '@trello-clone/shared';
import { ArchiveIcon, EllipsisIcon, Trash2Icon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { EditableTitle } from '@/components/forms/EditableTitle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { useDeleteList, useUpdateList } from '../queries';

const DELETE_ERROR = "Couldn't delete the list. Check your connection and try again.";

interface ListHeaderProps {
  list: BoardDetailDto['lists'][number];
  /** Rename, archive, delete (≥ MEMBER; UX only, the API re-checks). */
  canEdit: boolean;
}

/**
 * A list's title (click to rename) and its ⋯ menu: "Archive list" and "Delete list", the latter
 * confirmed in an AlertDialog (docs/design/ui.md → Board). A VIEWER sees the title only.
 */
export function ListHeader({ list, canEdit }: ListHeaderProps) {
  const updateList = useUpdateList(list.boardId);
  const deleteList = useDeleteList(list.boardId);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (!canEdit) {
    return <h2 className="px-2 py-1 text-sm font-semibold break-words">{list.title}</h2>;
  }
  return (
    <div className="flex items-start gap-1">
      <div className="min-w-0 flex-1">
        <EditableTitle
          title={list.title}
          schema={ListTitleSchema}
          as="h2"
          hint="Rename list"
          inputLabel="List title"
          headingClassName="text-sm font-semibold"
          inputClassName="h-8 text-sm font-semibold"
          onRename={(title) => updateList.mutate({ list, input: { title } })}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`List actions for ${list.title}`}
          >
            <EllipsisIcon aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => updateList.mutate({ list, input: { archived: true } })}>
            <ArchiveIcon aria-hidden="true" />
            Archive list
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
            <Trash2Icon aria-hidden="true" />
            Delete list
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        title={`Delete ${list.title}?`}
        description="The list and all its cards are deleted for everyone. This can't be undone."
        confirmLabel="Delete list"
        pendingLabel="Deleting…"
        onConfirm={async () => {
          try {
            await deleteList.mutateAsync(list.id);
          } catch (error) {
            return error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
              ? error.message
              : DELETE_ERROR;
          }
          toast.success(`${list.title} was deleted.`);
          return null;
        }}
      />
    </div>
  );
}
