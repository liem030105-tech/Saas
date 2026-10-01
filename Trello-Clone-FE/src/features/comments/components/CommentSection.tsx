import { zodResolver } from '@hookform/resolvers/zod';
import { CommentInputSchema, type CommentDto, type UserSummary } from '@trello-clone/shared';
import { useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { ApiError, NETWORK_ERROR_CODE } from '@/api/client';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Markdown } from '@/components/ui/Markdown';
import { UserAvatar } from '@/components/ui/UserAvatar';
import { formatDateTime } from '@/lib/format-date';

import {
  isOptimisticComment,
  useAddComment,
  useComments,
  useDeleteComment,
  useEditComment,
} from '../queries';

import type { z } from 'zod';

const ADD_ERROR = "Couldn't add the comment. Check your connection and try again.";
const EDIT_ERROR = "Couldn't save the comment. Check your connection and try again.";

const EDITED_AFTER_MS = 1000;

/** The API's message for an error it explains, otherwise `fallback` (offline, timeout, …). */
const errorMessage = (error: unknown, fallback: string) =>
  error instanceof ApiError && error.code !== NETWORK_ERROR_CODE ? error.message : fallback;

/** What the caller may do with comments (UX only; the API re-checks every request). */
export interface CommentAccess {
  /** The signed-in user, the author of their own comments (and of a new one). */
  user: UserSummary | undefined;
  /** Write, and edit or delete their own comments (≥ MEMBER, board not archived). */
  canComment: boolean;
  /** Delete anyone's comment (≥ ADMIN, board not archived). */
  canDeleteAny: boolean;
}

interface CommentSectionProps {
  boardId: string;
  cardId: string;
  access: CommentAccess;
  /** Next to the "Activity" heading (the card modal's "Show details"). */
  headerAction?: ReactNode;
  /** After the comments (the card's activity entries, when shown). */
  children?: ReactNode;
}

/**
 * "Activity" in the card modal (docs/design/ui.md → Card modal): the comment composer, then the
 * card's comments, newest first, rendered as sanitized markdown, with "Load more comments". The
 * card modal can add the card's activity entries after them ("Show details", CARD-005e).
 */
export function CommentSection({
  boardId,
  cardId,
  access,
  headerAction,
  children,
}: CommentSectionProps) {
  const comments = useComments(cardId);
  const list = comments.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section aria-labelledby="card-activity" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 id="card-activity" className="text-xs font-semibold text-muted-foreground uppercase">
          Activity
        </h3>
        {headerAction}
      </div>
      {access.canComment && access.user && (
        <CommentComposer boardId={boardId} cardId={cardId} author={access.user} />
      )}
      {comments.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading comments…
        </p>
      ) : comments.isError && list.length === 0 ? (
        <div role="alert" className="flex items-center gap-2 text-sm">
          Couldn&apos;t load the comments.
          <Button variant="secondary" size="sm" onClick={() => void comments.refetch()}>
            Try again
          </Button>
        </div>
      ) : list.length === 0 ? (
        <p className="text-sm text-muted-foreground">No comments yet.</p>
      ) : (
        <>
          <ol aria-label="Comments" className="flex flex-col gap-3">
            {list.map((comment) => (
              <li key={comment.id}>
                <CommentItem boardId={boardId} cardId={cardId} comment={comment} access={access} />
              </li>
            ))}
          </ol>
          {comments.hasNextPage && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              disabled={comments.isFetchingNextPage}
              onClick={() => void comments.fetchNextPage()}
            >
              {comments.isFetchingNextPage ? 'Loading…' : 'Load more comments'}
            </Button>
          )}
          {comments.isFetchNextPageError && (
            <p role="alert" className="text-sm text-destructive">
              Couldn&apos;t load more comments. Try again.
            </p>
          )}
        </>
      )}
      {children}
    </section>
  );
}

type CommentFormInput = z.input<typeof CommentInputSchema>;
type CommentFormData = z.output<typeof CommentInputSchema>;

/** A comment's text: Zod-validated against the API's schema, with the server's error below. */
function CommentForm({
  label,
  defaultContent,
  submitLabel,
  pending = false,
  serverError,
  onSubmit,
  onCancel,
}: {
  label: string;
  defaultContent: string;
  submitLabel: string;
  /** Saving waits for the server (an edit): the button says so meanwhile. */
  pending?: boolean;
  serverError: string | null;
  /**
   * Resolves true when done (the form then empties itself if it has no `onCancel`); `restore`
   * puts text back into the field if it is still empty.
   */
  onSubmit: (content: string, restore: (content: string) => void) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const form = useForm<CommentFormInput, unknown, CommentFormData>({
    resolver: zodResolver(CommentInputSchema),
    defaultValues: { content: defaultContent },
  });
  const error = form.formState.errors.content?.message ?? serverError;
  const errorId = useId();

  return (
    <form
      noValidate
      aria-label={label}
      className="flex flex-col gap-2"
      // Escape cancels an edit, not the card (CardDetailModal leaves it to this form).
      data-inline-edit={onCancel ? '' : undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && onCancel) onCancel();
      }}
      onSubmit={(event) =>
        void form.handleSubmit(async ({ content }) => {
          const restore = (text: string) => {
            if (form.getValues('content') === '') form.setValue('content', text);
          };
          if ((await onSubmit(content, restore)) && !onCancel) form.reset({ content: '' });
        })(event)
      }
    >
      <textarea
        aria-label={label}
        placeholder={onCancel ? undefined : 'Write a comment…'}
        rows={3}
        autoFocus={Boolean(onCancel)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive"
        {...form.register('content')}
      />
      {error && (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * "Write a comment": the comment shows at once and the field empties; if the server refuses it,
 * the text comes back into the (still empty) field with the error.
 */
function CommentComposer({
  boardId,
  cardId,
  author,
}: {
  boardId: string;
  cardId: string;
  author: UserSummary;
}) {
  const add = useAddComment(boardId, cardId, author);
  const [error, setError] = useState<string | null>(null);

  return (
    <CommentForm
      label="Write a comment"
      defaultContent=""
      submitLabel="Comment"
      serverError={error}
      onSubmit={(content, restore) => {
        setError(null);
        add.mutate(content, {
          onError: (failure) => {
            restore(content);
            setError(errorMessage(failure, ADD_ERROR));
          },
        });
        return Promise.resolve(true);
      }}
    />
  );
}

/**
 * One comment: author, time ("edited" once changed), and its markdown. Its author (≥ MEMBER) can
 * edit and delete it; an ADMIN or OWNER can delete anyone's.
 */
function CommentItem({
  boardId,
  cardId,
  comment,
  access,
}: {
  boardId: string;
  cardId: string;
  comment: CommentDto;
  access: CommentAccess;
}) {
  const edit = useEditComment(cardId);
  const remove = useDeleteComment(boardId, cardId);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const own = access.canComment && comment.author.id === access.user?.id;
  const pending = isOptimisticComment(comment);
  // Both stamps are set when it is written, a moment apart; "edited" means changed later.
  const edited = Date.parse(comment.updatedAt) - Date.parse(comment.createdAt) > EDITED_AFTER_MS;

  return (
    <article
      aria-label={`Comment by ${comment.author.name}`}
      aria-busy={pending || undefined}
      className={pending ? 'flex gap-2 opacity-70' : 'flex gap-2'}
    >
      <UserAvatar user={comment.author} size="sm" className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{comment.author.name}</span>
          <time dateTime={comment.createdAt} className="text-xs text-muted-foreground">
            {formatDateTime(comment.createdAt)}
          </time>
          {edited && <span className="text-xs text-muted-foreground">(edited)</span>}
        </p>
        {editing ? (
          <CommentForm
            label="Edit comment"
            defaultContent={comment.content}
            submitLabel="Save"
            pending={edit.isPending}
            serverError={error}
            onCancel={() => {
              setError(null);
              setEditing(false);
            }}
            onSubmit={async (content) => {
              setError(null);
              try {
                if (content !== comment.content) {
                  await edit.mutateAsync({ commentId: comment.id, content });
                }
                setEditing(false);
                return true;
              } catch (failure) {
                setError(errorMessage(failure, EDIT_ERROR));
                return false;
              }
            }}
          />
        ) : (
          <div className="rounded-md bg-muted/60 px-3 py-2">
            <Markdown>{comment.content}</Markdown>
          </div>
        )}
        {!editing && !pending && (own || access.canDeleteAny) && (
          <div className="flex gap-1">
            {own && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  Delete
                </Button>
              }
              title="Delete comment?"
              description="The comment is deleted for everyone. This can't be undone."
              confirmLabel="Delete comment"
              pendingLabel="Deleting…"
              // The comment goes at once; a failure brings it back with a toast.
              onConfirm={() => {
                remove.mutate(comment);
                return Promise.resolve(null);
              }}
            />
          </div>
        )}
      </div>
    </article>
  );
}
