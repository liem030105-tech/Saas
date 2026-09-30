import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import { CreateWorkspaceForm } from './CreateWorkspaceForm';
import { workspacePath } from '../paths';

/** "Create workspace" button + dialog; on success it closes and opens the new workspace. */
export function CreateWorkspaceDialog() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Create workspace
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>A workspace holds your team&apos;s boards.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts with an empty form. */}
        {open && (
          <CreateWorkspaceForm
            autoFocus
            onCreated={(workspace) => {
              setOpen(false);
              void navigate(workspacePath(workspace.slug));
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
