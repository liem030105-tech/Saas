# UI conventions (Tailwind 4 + shadcn/ui)

What to build: [docs/design/ui.md](../../../../docs/design/ui.md) (layouts, states, interactions, component map, copy). This file covers how to write it.

- **Tokens, not values:** colours, radius, and spacing come from the `@theme` variables in `src/index.css` through shadcn's semantic classes (`bg-background`, `text-muted-foreground`, `border-border`). The only literal colours are the user-chosen board/label colours, applied with `style={{ backgroundColor }}`.
- **Class composition:** `cn()` from `lib/utils` for conditional classes; no string concatenation. Variants with `cva` inside `components/ui` only.
- **shadcn components** are added with the CLI into `components/ui` and then owned by the repo. Change them there (shared look) rather than overriding per usage. Do not add another component library.
- **Icons:** `lucide-react` (shadcn's default). Icon-only buttons need an `aria-label`.
- **States:** every data view renders a `Skeleton` while pending, an `EmptyState` with the primary action, and an `ErrorState` with retry (`components/feedback`).
- **Toasts:** `toast.success` / `toast.error` from `sonner`, for results of actions the user did not see directly (a background save failed, a move rolled back). Form validation errors stay in the form.
- **Accessibility:** real `<button>` / `<a>` elements, visible focus rings (keep shadcn's `focus-visible` styles), dialogs from shadcn (focus trap, Escape), colour never the only signal (overdue due dates also show an icon or text).
- **Responsive:** design for ≥ 1024px first, check 375px: sidebar collapses, card modal becomes one column, the board still scrolls horizontally.
- **Verify visually:** after a UI change, open it with the `run-app` skill and look at the golden path and the empty/error states.
