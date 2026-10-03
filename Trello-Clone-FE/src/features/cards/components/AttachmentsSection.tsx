import {
  ATTACHMENT_MIME_TYPES,
  COVER_MIME_TYPES,
  PLAN_LIMITS,
  type AttachmentDto,
  type CardDetailDto,
  type Plan,
} from '@trello-clone/shared';
import { FileIcon, PaperclipIcon } from 'lucide-react';
import { useRef } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format-date';

import { errorMessage } from '../queries';

import type { Attachments } from '../hooks/useAttachments';

const DELETE_ERROR = "Couldn't delete the attachment. Check your connection and try again.";
const MB = 1024 * 1024;

/** Refusing a file over the plan's limit (D-10) before uploading it; the API checks again. */
export const tooLargeMessage = (plan: Plan) =>
  plan === 'FREE'
    ? `Files can be at most ${PLAN_LIMITS.FREE.maxFileBytes / MB} MB on the Free plan. Upgrade to Pro for files up to ${PLAN_LIMITS.PRO.maxFileBytes / MB} MB.`
    : `Files can be at most ${PLAN_LIMITS[plan].maxFileBytes / MB} MB.`;

/** "512 B", "3.4 KB", "2.1 MB". */
export function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const isImage = (file: AttachmentDto) =>
  (COVER_MIME_TYPES as readonly string[]).includes(file.mimeType);

interface AttachmentsSectionProps {
  card: CardDetailDto;
  attachments: Attachments;
  /** Upload and change the cover (≥ MEMBER, board not archived; UX only, the API re-checks). */
  canEdit: boolean;
  /** Whether this file may be deleted: the uploader's own (≥ MEMBER) or any (≥ ADMIN). */
  canDelete: (file: AttachmentDto) => boolean;
  /** Makes an image attachment the cover, or removes the cover (`null`). */
  onSetCover: (attachmentId: string | null) => void;
  /** The workspace's plan, which sets the largest file (BILLING-001). */
  plan: Plan;
}

/**
 * The card modal's attachments (ATTACHMENTS-001, docs/design/ui.md → Card modal): newest first,
 * each a link that opens or downloads the file (its URL is signed and expires; useCard refetches
 * the card for fresh ones, D-27), with "Make cover" for an image and Delete behind a confirmation.
 * "Add attachment" picks a file; files over the plan's size limit are refused before uploading.
 */
export function AttachmentsSection({
  card,
  attachments,
  canEdit,
  canDelete,
  onSetCover,
  plan,
}: AttachmentsSectionProps) {
  const input = useRef<HTMLInputElement>(null);
  const { upload, remove, progress } = attachments;
  if (!canEdit && card.attachments.length === 0) return null;

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > PLAN_LIMITS[plan].maxFileBytes) {
      toast.error(tooLargeMessage(plan));
      return;
    }
    upload.mutate(file);
  };

  return (
    <section aria-labelledby="card-attachments" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-attachments" className="text-xs font-semibold text-muted-foreground uppercase">
          Attachments
        </h3>
        {canEdit && (
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={progress !== null}
              onClick={() => input.current?.click()}
            >
              <PaperclipIcon aria-hidden="true" />
              Add attachment
            </Button>
            <input
              ref={input}
              type="file"
              aria-label="Attach a file"
              className="sr-only"
              tabIndex={-1}
              accept={ATTACHMENT_MIME_TYPES.join(',')}
              onChange={(event) => {
                pick(event.target.files?.[0]);
                event.target.value = ''; // the same file can be picked again
              }}
            />
          </>
        )}
      </div>

      {progress !== null && (
        // The live region says once what is uploading; the bar carries the percentage.
        <div className="flex items-center gap-2 text-sm">
          <span role="status" className="truncate">
            Uploading {upload.variables?.name}…
          </span>
          <progress aria-label="Upload progress" value={progress} max={1} className="h-2 flex-1" />
          <span aria-hidden="true">{Math.round(progress * 100)}%</span>
        </div>
      )}

      {card.attachments.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {card.attachments.map((file) => {
            const cover = card.coverAttachmentId === file.id;
            return (
              <li key={file.id} className="flex items-start gap-3">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  tabIndex={-1}
                  aria-hidden="true"
                  className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-muted"
                >
                  {isImage(file) ? (
                    <img src={file.url} alt="" className="size-full object-cover" />
                  ) : (
                    <FileIcon className="size-5 text-muted-foreground" />
                  )}
                </a>
                <div className="flex min-w-0 flex-1 flex-col">
                  <a
                    href={file.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="truncate text-sm font-medium hover:underline"
                  >
                    {file.fileName}
                  </a>
                  <span className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} · {file.uploader.name} ·{' '}
                    {formatDate(file.createdAt)}
                    {cover && ' · Cover'}
                  </span>
                  <div className="flex gap-1">
                    {canEdit && isImage(file) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`${cover ? 'Remove cover' : 'Make cover'}: ${file.fileName}`}
                        onClick={() => onSetCover(cover ? null : file.id)}
                      >
                        {cover ? 'Remove cover' : 'Make cover'}
                      </Button>
                    )}
                    {canDelete(file) && (
                      <ConfirmDialog
                        trigger={
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Delete attachment ${file.fileName}`}
                          >
                            Delete
                          </Button>
                        }
                        title={`Delete ${file.fileName}?`}
                        description="The file is deleted for everyone. This can't be undone."
                        confirmLabel="Delete attachment"
                        pendingLabel="Deleting…"
                        onConfirm={async () => {
                          try {
                            await remove.mutateAsync(file.id);
                            return null;
                          } catch (error) {
                            return errorMessage(error, DELETE_ERROR);
                          }
                        }}
                      />
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No attachments.</p>
      )}
    </section>
  );
}
