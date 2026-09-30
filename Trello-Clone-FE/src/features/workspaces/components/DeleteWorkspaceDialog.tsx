import { type WorkspaceDto } from '@trello-clone/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { useDeleteWorkspace } from '../queries';

export const WORKSPACE_DELETED_MESSAGE = 'Workspace deleted.';
const GENERIC_ERROR = "Couldn't delete the workspace. Check your connection and try again.";

/**
 * "Delete workspace" (OWNER) with a confirmation that asks for the workspace's name
 * (docs/design/ui.md → Confirm destructive action). On success it opens `/`.
 */
export function DeleteWorkspaceDialog({ workspace }: { workspace: WorkspaceDto }) {
  const [open, setOpen] = useState(false);
  const [typedName, setTypedName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const deleteWorkspace = useDeleteWorkspace(workspace.id);
  const navigate = useNavigate();
  const confirmed = typedName === workspace.name;

  const onOpenChange = (next: boolean) => {
    if (deleteWorkspace.isPending) return;
    setOpen(next);
    setTypedName('');
    setError(null);
  };

  const onDelete = async () => {
    setError(null);
    try {
      await deleteWorkspace.mutateAsync();
      toast.success(WORKSPACE_DELETED_MESSAGE);
      await navigate('/', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError && caught.code !== NETWORK_ERROR_CODE
          ? caught.message
          : GENERIC_ERROR,
      );
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" className="self-start">
          Delete workspace
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {workspace.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            All boards, lists, and cards in this workspace are deleted for every member. This
            can&apos;t be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed) void onDelete();
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="delete-workspace-confirm">
              Type <strong>{workspace.name}</strong> to confirm
            </Label>
            <Input
              id="delete-workspace-confirm"
              autoComplete="off"
              value={typedName}
              onChange={(event) => setTypedName(event.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteWorkspace.isPending}>Cancel</AlertDialogCancel>
            <Button
              type="submit"
              variant="destructive"
              disabled={!confirmed || deleteWorkspace.isPending}
            >
              {deleteWorkspace.isPending ? 'Deleting…' : 'Delete workspace'}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
