import { zodResolver } from '@hookform/resolvers/zod';
import {
  CreateInviteInputSchema,
  type CreatedInviteDto,
  type CreateInviteData,
  type CreateInviteInput,
  type WorkspaceDto,
} from '@trello-clone/shared';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/format-date';

import { PLAN_LIMIT_ERROR, UpgradePrompt } from './UpgradePrompt';
import { useCreateInvite } from '../queries';
import { INVITE_ROLES, ROLE_LABELS } from '../roleLabels';

export const LINK_COPIED_MESSAGE = 'Invite link copied.';
const GENERIC_ERROR = "Couldn't create the invite. Check your connection and try again.";
const COPY_ERROR = "Couldn't copy the link. Select it and copy it yourself.";

/**
 * "Invite people" (≥ ADMIN): email + role, then the invite link to copy and share. No email is
 * sent (D-18), and the link is shown only this once.
 */
export function InviteDialog({ workspace }: { workspace: WorkspaceDto }) {
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<CreatedInviteDto | null>(null);

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) setCreated(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="self-start">Invite people</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite to {workspace.name}</DialogTitle>
          <DialogDescription>
            {created
              ? 'Share this link with them. It works once, only for their email address.'
              : 'Create an invite link for their email address. No email is sent.'}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <InviteLink invite={created} onAnother={() => setCreated(null)} />
        ) : (
          <InviteForm workspaceId={workspace.id} onCreated={setCreated} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function InviteForm({
  workspaceId,
  onCreated,
}: {
  workspaceId: string;
  onCreated: (invite: CreatedInviteDto) => void;
}) {
  const createInvite = useCreateInvite(workspaceId);
  const form = useForm<CreateInviteInput, unknown, CreateInviteData>({
    resolver: zodResolver(CreateInviteInputSchema),
    defaultValues: { email: '', role: 'MEMBER' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      onCreated(await createInvite.mutateAsync(values));
    } catch (error) {
      if (error instanceof ApiError && error.code === 'PLAN_LIMIT_REACHED') {
        form.setError('root', { type: PLAN_LIMIT_ERROR, message: error.message });
        return;
      }
      if (error instanceof ApiError && error.code === 'CONFLICT') {
        form.setError('email', { message: error.message });
        return;
      }
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        const emailError = error.details.find((detail) => detail.path === 'email');
        if (emailError) {
          form.setError('email', { message: emailError.message });
          return;
        }
      }
      form.setError('root', {
        message:
          error instanceof ApiError && error.code !== NETWORK_ERROR_CODE
            ? error.message
            : GENERIC_ERROR,
      });
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          aria-invalid={Boolean(errors.email)}
          aria-describedby={errors.email ? 'invite-email-error' : undefined}
          {...form.register('email')}
        />
        {errors.email && (
          <p id="invite-email-error" className="text-xs text-destructive">
            {errors.email.message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <span id="invite-role-label" className="text-sm font-medium">
          Role
        </span>
        <Controller
          control={form.control}
          name="role"
          render={({ field }) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="self-start"
                  aria-labelledby="invite-role-label invite-role-value"
                >
                  <span id="invite-role-value">{ROLE_LABELS[field.value]}</span>
                  <ChevronDownIcon aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuRadioGroup value={field.value} onValueChange={field.onChange}>
                  {INVITE_ROLES.map((role) => (
                    <DropdownMenuRadioItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </div>
      {errors.root &&
        (errors.root.type === PLAN_LIMIT_ERROR ? (
          <UpgradePrompt workspaceId={workspaceId} message={errors.root.message ?? ''} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            {errors.root.message}
          </p>
        ))}
      <Button type="submit" disabled={isSubmitting} className="self-start">
        {isSubmitting ? 'Creating link…' : 'Create invite link'}
      </Button>
    </form>
  );
}

function InviteLink({ invite, onAnother }: { invite: CreatedInviteDto; onAnother: () => void }) {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite.inviteUrl);
      toast.success(LINK_COPIED_MESSAGE);
    } catch {
      toast.error(COPY_ERROR);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="invite-link">
          Invite link for {invite.email} ({ROLE_LABELS[invite.role]})
        </Label>
        <div className="flex gap-2">
          <Input
            id="invite-link"
            readOnly
            value={invite.inviteUrl}
            onFocus={(event) => event.target.select()}
          />
          <Button type="button" onClick={() => void copy()}>
            Copy link
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Expires {formatDate(invite.expiresAt)}. You won&apos;t see this link again.
        </p>
      </div>
      <Button type="button" variant="outline" className="self-start" onClick={onAnother}>
        Invite someone else
      </Button>
    </div>
  );
}
