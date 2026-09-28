# Forms: React Hook Form 7 + Zod 4 schemas from shared

The same schema validates in the browser and on the server; never redefine field rules in the FE.

```tsx
import { zodResolver } from '@hookform/resolvers/zod';
import { CreateBoardInput } from '@trello-clone/shared';
import { useForm } from 'react-hook-form';

import { ApiError } from '@/api/client';

export function CreateBoardForm({ workspaceId, onDone }: Props) {
  const createBoard = useCreateBoard(workspaceId);
  const form = useForm<CreateBoardInput>({
    resolver: zodResolver(CreateBoardInput),
    defaultValues: { title: '', background: '#0079bf' },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await createBoard.mutateAsync(values);
      onDone();
    } catch (error) {
      // map server field errors (400 VALIDATION_ERROR details) back onto the fields
      if (error instanceof ApiError && error.code === 'VALIDATION_ERROR') {
        for (const d of error.details) form.setError(d.path as keyof CreateBoardInput, { message: d.message });
      } else {
        form.setError('root', { message: "Couldn't create the board. Try again." });
      }
    }
  });

  return (
    <form onSubmit={onSubmit} noValidate>
      {/* shadcn Form components: FormField / FormItem / FormLabel / FormControl / FormMessage */}
      <Button type="submit" disabled={form.formState.isSubmitting}>Create board</Button>
    </form>
  );
}
```
- Labels on every input (`FormLabel`), errors under the field (`FormMessage`), a form-level error above the submit button.
- Disable the submit button while submitting; never double-submit.
- Inline composers (add card, add list) use the same schema but a lighter layout: Enter submits, Escape cancels, the field keeps focus after a successful add.
- Business errors (`409 CONFLICT`, `422 BUSINESS_RULE_VIOLATION`) are shown as the API message in the form's root error, not as a toast, when the user can fix them in the form.
