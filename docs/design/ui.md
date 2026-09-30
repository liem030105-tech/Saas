# UI Design

> **Domain:** what every screen looks like and how it behaves, so each task builds the same product. Structure and state rules: [architecture/frontend.md](../architecture/frontend.md). Routes: [frontend.md → Routes](../architecture/frontend.md#routes).
> Palettes and visual tokens below are **proposed defaults (D-24)**; the layout, states, and interaction rules are requirements.

## Principles
- **Trello-familiar, not a copy:** horizontal lists of cards on a coloured board; everything editable in place.
- **Fast feedback:** mutations update the UI optimistically; errors roll back with a toast that says what failed.
- **Every query has three extra states:** loading (skeleton, not a spinner for layout areas), empty (one sentence + the primary action), error (message + "Try again").
- **Keyboard and screen reader first-class:** everything reachable by Tab; drag and drop also works with the keyboard (@dnd-kit keyboard sensor); dialogs trap focus and close on Escape.

## Visual tokens (proposed, D-24)
Defined once as Tailwind 4 theme variables in `src/index.css` (`@theme`), used through shadcn/ui's semantic tokens (`bg-background`, `text-muted-foreground`, …). Never hard-code hex values in components, except the user-chosen board and label colours.

| Token | Value |
|-------|-------|
| Font | System UI stack (`ui-sans-serif, system-ui, …`); 14px base, 12px secondary |
| Radius | `--radius: 0.5rem` (cards and lists), `0.375rem` (buttons, inputs) |
| Spacing | 4px scale; list width `272px`; list gap `12px`; card gap `8px` |
| Board backgrounds | `#0079bf` (default) `#d29034` `#519839` `#b04632` `#89609e` `#cd5a91` `#4bbf6b` `#00aecc` `#838c91` |
| Label colours | `#61bd4f` `#f2d600` `#ff9f1a` `#eb5a46` `#c377e0` `#0079bf` `#00c2e0` `#51e898` `#ff78cb` `#344563` |
| Dark mode | Not in scope (backlog, D-08) |

The API accepts any `#rrggbb`; the UI offers only the presets above. Text on a coloured surface uses white or near-black, whichever passes WCAG AA contrast.

## Layouts

### App shell (signed in)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  TaskBoard   [Workspace ▾]                    [Search]  (Avatar ▾) │  Header 48px
├──────────────┬───────────────────────────────────────────────────────┤
│ Workspace    │                                                       │
│  • Boards    │                  page content                         │
│  • Members   │                                                       │
│  • Settings  │                                                       │
│ Boards       │                                                       │
│  ▪ Roadmap   │                                                       │
│  ▪ Sprint 12 │                                                       │
└──────────────┴───────────────────────────────────────────────────────┘
```
Sidebar 240px, collapsible (UI state in a Zustand store); hidden behind ☰ below 768px.

### Workspace home `/w/:slug`
Grid of board tiles (board colour background, title in white, 4 per row on desktop, 1 on mobile) plus a "Create board" tile that opens a dialog (title + colour presets). Empty state: "No boards yet" + "Create your first board".

### Board `/b/:boardId`
```
┌ Board title (click to rename)   [Members avatars]  [⋯ menu] ─────────────────────────┐
│ ┌ To do ─────── ⋯ ┐ ┌ Doing ─────── ⋯ ┐ ┌ Done ──────── ⋯ ┐ ┌ + Add another list ┐ │
│ │ ┌─────────────┐ │ │ ┌─────────────┐ │ │                 │ └────────────────────┘ │
│ │ │▬▬ ▬▬  Title │ │ │ │ Title       │ │ │                 │                        │
│ │ │📅 12 Oct ☑ 2/5│ │ │ └─────────────┘ │ │                 │                        │
│ │ └─────────────┘ │ │ + Add a card    │ │ + Add a card    │                        │
│ │ + Add a card    │ └─────────────────┘ └─────────────────┘                        │
│ └─────────────────┘                                                      ← scroll → │
└────────────────────────────────────────────────────────────────────────────────────┘
```
- Board colour fills the page background; lists are light surfaces; the board scrolls horizontally, each list vertically.
- **Card tile:** label chips (colour only, 40×8px), title (max 3 lines), then badges: due date (red when overdue, green when completed), checklist `done/total`, comment count, member avatars (max 3 + "+n").
- **Add a card / Add another list:** an inline composer (textarea + "Add" + ✕). Enter submits and keeps the composer open for the next item; Escape closes. Never a dialog.
- **Rename in place:** clicking a board or list title swaps it for an input; Enter or blur saves, Escape cancels.
- **Archived board:** banner "This board is archived" with "Restore" for MEMBER+; all editing disabled.
- VIEWER sees no composers, no drag handles, no edit menus (UX only; the API enforces it).

### Card modal `/b/:boardId/c/:cardId`
A dialog over the board (URL-addressable, so reload and share work). Two columns on desktop, one on mobile:
```
┌ Card title (editable)                         in list "Doing"         ✕ ┐
│ Labels ▪▪  Members ◯◯  Due 12 Oct ☐ complete  │  Add to card            │
│ Description (markdown, click to edit)          │  [Members] [Labels]     │
│ Checklists  ███████░░ 60%                      │  [Checklist] [Due date] │
│   ☑ item  ☐ item   + Add an item               │  Actions                │
│ Activity   [Show details]                      │  [Move] [Archive]       │
│   (comment composer)                           │  [Delete]               │
│   Ana moved this card from To do to Doing · 2h │                         │
└────────────────────────────────────────────────┴─────────────────────────┘
```
Delete asks for confirmation (AlertDialog). Markdown renders only through the sanitized `Markdown` component.

### Auth pages `/login`, `/register`
A centered 400px card on a neutral background: title, fields, primary button, link to the other page. Field errors under each field (from Zod); a server error (`INVALID_CREDENTIALS`) as one message above the button.

## Drag and drop behaviour
- Cards move within and across lists; lists reorder horizontally. The drag shows a tilted copy of the card (`DragOverlay`) and a placeholder where it will drop.
- On drop: the move is applied optimistically; on failure the card animates back and a toast says "Couldn't move the card. Try again."
- Keyboard: focus a card, Space to pick up, arrow keys to move, Space to drop, Escape to cancel; moves are announced to screen readers.
- While a drag is in progress, polling and refetch results for that board are not applied (avoids jumps).

## shadcn/ui component map
| Need | Component |
|------|-----------|
| Dialogs (create board, card modal) | `Dialog` |
| Confirm destructive action | `AlertDialog` |
| Menus (list ⋯, board ⋯, avatar) | `DropdownMenu` |
| Pickers (labels, members, colour) | `Popover` + `Command` |
| Due date | `Popover` + `Calendar` |
| Toasts | `Sonner` |
| Forms | `Form` pattern with React Hook Form, `Input`, `Textarea`, `Button` |
| Loading | `Skeleton` |
| Avatars | `Avatar` |
Add a component with the shadcn CLI when a task first needs it; do not hand-write primitives that shadcn provides.

## Copy
All UI text is English (ADR-019); the MVP has no translations. Sentence case everywhere ("Add a card", not "Add A Card"). Errors say what happened and what to do ("Couldn't save the title. Check your connection and try again."). No technical codes in the UI.
