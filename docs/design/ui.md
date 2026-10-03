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
| Dark mode | Not in scope (backlog, ADR-022) |

The API accepts any `#rrggbb`; the UI offers only the presets above. Text on a coloured surface uses white or near-black, whichever passes WCAG AA contrast.

## Layouts

### App shell (signed in)
```
┌──────────────────────────────────────────────────────────────────────┐
│ ☰  TaskBoard   [Workspace ▾]               [Search]  🔔3  (Avatar ▾) │  Header 48px
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
Sidebar 240px; hidden behind ☰ below 768px, where it opens as a drawer that closes on navigation, Escape, or a click outside (WORKSPACE-001; the open state is local to the shell). Collapsing it on desktop, if added, keeps that UI state in a Zustand store.

**Notifications** (NOTIFICATIONS-001, [api/notifications.md](../api/notifications.md)): a bell before the user's menu with a red badge for the unread count ("99+" above 99; no badge at 0), named "Notifications, 3 unread" for screen readers. It opens a popover "Notifications": newest first, each entry with the actor's avatar, what happened in bold while unread ("Ada assigned you to Fix login", "Ada commented on Fix login" with the comment's first lines below, "Fix login is due soon", "Ada invited you to Acme as a Member"), the time and a blue dot when unread; "Load more" for older ones; "Mark all as read" while any is unread; "You're all caught up." when empty; "Couldn't load your notifications." with "Try again" on error. Clicking an entry marks it read and opens its card; an invite has "Accept" (then the workspace opens). New notifications appear live, and another tab's reads clear here too.

### Workspace home `/w/:slug`
Grid of board tiles (board colour background, title in white or near-black `#111111`, whichever passes WCAG AA on that colour; 4 per row on desktop, 1 on mobile) plus a "Create board" tile that opens a dialog (title + colour presets). Empty state: "No boards yet." + "Create your first board". Create actions are hidden from a VIEWER (BOARD-001). Tiles link to `/b/:boardId` (the board page arrives with BOARD-002).

### Workspace members `/w/:slug/members`
Linked from the workspace page next to Settings (WORKSPACE-003). One row per member: avatar, name ("(you)" for the caller), email, and role. The caller sees a role dropdown and "Remove" only on rows they may manage (an OWNER: everyone else, with Owner among the roles; an ADMIN: members up to Admin, without Owner); other rows show the role as text. "Remove" and "Leave workspace" (shown to everyone) ask for confirmation in an `AlertDialog`; leaving opens `/`. When the rules refuse an action (e.g. the last owner leaving), the reason is shown ("A workspace needs an owner. Make another member an owner first.").

**Invitations** (WORKSPACE-004, ≥ ADMIN only): "Invite people" opens a dialog with the email and a role menu (Admin, Member, Viewer; never Owner). "Create invite link" then shows the link in a read-only field with "Copy link", its expiry, and "You won't see this link again." (no email is sent, D-18). Below the members, "Pending invites" lists email, role, and expiry with "Revoke" (confirmed in an `AlertDialog`); empty state "No pending invites."

### Accept invite `/invite/:token`
Signed in only: a signed-out visitor goes to `/login?redirectTo=/invite/<token>`, and "Sign up" keeps that `redirectTo`, so a new user returns to the link after registering. The page shows "Joining the workspace…", then opens the workspace with a toast "You joined <name>." Every refusal shows "This invite is invalid or has expired." with "Ask the person who invited you for a new link.", except an existing member ("You're already a member of this workspace."); both link to `/`.

### Workspace settings `/w/:slug/settings`
Linked from the workspace page (WORKSPACE-002). "Details" holds the name and the URL (`/w/` + slug) with "Save changes" (≥ ADMIN; others see them read-only with "Only workspace admins can change these settings."). Only the changed fields are sent; a taken URL shows a field error. "Delete workspace" (OWNER only) opens an `AlertDialog` whose delete button stays disabled until the exact workspace name is typed; afterwards the app opens `/`.

"Plan and billing" (BILLING-001, between "Details" and "Delete workspace", anchor `#billing`) is shown to ADMIN and OWNER (`billing.view`). It lists the plan (Free or Pro), its status when there is one (Active, Trial, Canceled, or "Payment failed: update the card in "Manage billing" to keep Pro."), "Renews {date}" while active or in trial, and the usage against the plan's limits ("Boards 3 of 5", "Members 4 of 5 (pending invites included)", "Files up to 10 MB each"; on Pro just the counts and 100 MB). The OWNER gets "Upgrade to Pro" on Free (with "Pro: unlimited boards and members, files up to 100 MB, $5 per member per month."), which opens Stripe Checkout, and "Manage billing" (the Stripe Customer Portal) once the workspace has a Stripe customer; an ADMIN sees "Only a workspace owner can change the plan." Back from Checkout, `?billing=success` shows "Thanks! Your payment is being confirmed; this takes a few seconds." and the plan is read every 3 seconds until the webhook has made it Pro ("Your workspace is on Pro now. Thank you!"), for about 2 minutes at most (then "Stripe hasn't confirmed the payment yet. Reload this page in a few minutes."); the `billing` parameter is removed from the URL at once, so a reload does not show the message again; `?billing=canceled` shows "Checkout was canceled. Your plan hasn't changed." If Stripe cannot be opened, a toast says "Couldn't open Stripe. Try again in a moment." (a 409, e.g. already Pro, shows the API's message and refreshes the plan).

A `/w/:slug` page keeps following its workspace when the slug changes (here or in another tab) and moves to the new URL; when the workspace is gone (deleted, or access lost) it goes to `/`. A slug the user never saw shows "Page not found".

### Upgrade prompts

A `402 PLAN_LIMIT_REACHED` (BILLING-001) shows the API's message in place of the form's error, in the create-board and invite dialogs: the OWNER gets an "Upgrade to Pro" link to the settings' `#billing` section; others see "Ask a workspace owner to upgrade to Pro." A file over the plan's size limit is refused before uploading (card modal → Attachments).

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
- Header (BOARD-002): the title is a button that turns into a text field (Enter or leaving it saves, Escape cancels), then "Colour" (the presets as a menu), "Archive"/"Unarchive", and "Delete" (ADMIN+, confirmed in an `AlertDialog`, then back to the workspace). A VIEWER sees the title only. An archived board keeps working and shows "This board is archived." under the header. A board the caller cannot see shows "Page not found". "Activity" (CARD-005e, everyone, a VIEWER included) opens a panel on the right with the board's activity feed.
- The workspace page's "Show archived boards" / "Show open boards" toggle switches the grid to the archived boards (no create actions there).
- Board colour fills the page background; lists are light surfaces; the board scrolls horizontally, each list vertically.
- Lists (LIST-001): 272px columns in `position` order, then "Add a list" (empty board) or "Add another list". The new list shows at once (optimistic) and the composer stays in view for the next title. A board without lists shows "No lists yet." to a VIEWER.
- List header (LIST-002): the title renames in place (as the board title), and the ⋯ menu ("List actions for {title}") has "Archive list" (the list leaves the board at once; toast "{title} was archived.") and "Delete list" (confirmed in an `AlertDialog`: "The list and all its cards are deleted for everyone."). A VIEWER sees the title only. There is no view of archived lists yet.
- Cards (CARD-001): each list shows its cards as tiles (title, at most three lines; since CARD-002 a link to the card modal, with the due-date badge: grey, red when overdue, green when completed, and a "Completed" badge without a due date) and ends with "Add a card" ("Add a card to {list}" for screen readers), a textarea composer: Enter adds the card and keeps the composer open, Escape or ✕ closes it. The card shows at once; on failure it disappears with a toast. A VIEWER, an archived board and a list still being created have no composer.
- List order (LIST-003): each list has a grip handle ("Move list {title}") left of its title. Drag it with the pointer, or focus it and use Space, ←/→ and Space (Escape cancels); moves are announced ("List Doing is at position 2 of 3."). The list moves at once; on failure it goes back with the toast "Couldn't move the list. Try again." A VIEWER, an archived board and a list still being created have no handle.
- Card drag (CARD-004): a member drags a card tile with the pointer, or focuses it and uses Space, ↑/↓ (within the list), ←/→ (to the next list) and Space (Escape cancels; Enter still opens the card). Moves are announced ("Card Fix login is at position 1 of 2 in Doing."). A VIEWER, an archived board and a card still being created cannot be dragged.
- Filters (SEARCH-001): under the header, for everyone (a VIEWER too), "Search cards" (title or description) and three menus: "Label" (Any label), "Member" (Anyone) and "Due date" (Any due date, Overdue, Due in the next 7 days, No due date; meanings: D-26). While any is set, matching tiles get an amber outline and the others are dimmed (screen readers hear "Matches the filters" / "Doesn't match the filters"), a status says "n cards match." ("No cards match."), and "Clear filters" restores the board. Each board keeps its filters while the app is open; they follow the board's changes as they arrive.
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
│ Attachments [Add attachment] ▣ shot.png        │  [Checklist] [Due date] │
│ Checklists  ███████░░ 60%                      │                         │
│   ☑ item  ☐ item   + Add an item               │  Actions                │
│ Activity   [Show details]                      │  [Move] [Archive]       │
│   (comment composer)                           │  [Delete]               │
│   Ana moved this card from To do to Doing · 2h │                         │
└────────────────────────────────────────────────┴─────────────────────────┘
```
Delete asks for confirmation (AlertDialog). Markdown renders only through the sanitized `Markdown` component.

CARD-002 implements the title (renames in place), "in list {list}", an "archived" banner, the due date and "Complete" checkbox, the description ("Add a more detailed description…" or the rendered markdown with "Edit"; Save and Cancel; a blank description clears it), and the Actions "Archive"/"Unarchive" and "Delete" (confirmed, then back to the board). A VIEWER and an archived board see the card read-only. A card that is not visible, or is on another board than the URL's, shows "Page not found". Members, labels, checklists and activity arrive with CARD-005.

CARD-005a adds labels: the card's labels show as chips (name, or colour only) under "Labels", and a member gets "Labels" under "Add to card", a popover listing the board's labels as checkboxes (checked = on this card; the change shows at once and goes back with the toast "Couldn't update the card's labels. Try again." on failure). Each label has "Edit label {name}" (name, the ten colour presets, Save, and Delete, which asks first: "The label is removed from every card."); "Create a new label" opens the same form. A colour-only label reads as "{Colour} label". Card tiles show the label chips (colour only) above the title, named for screen readers ("Labels: Urgent, Green label").

CARD-005b adds members: the people on the card show under "Members" (avatar and name), and a member gets "Members" under "Add to card", a popover listing the workspace's members as checkboxes (checked = on this card; the change shows at once and goes back with the toast "Couldn't update the card's members. Try again." on failure). Card tiles show up to three member avatars below the title, then "+n", named for screen readers ("Members: Ada Owner").

CARD-005c adds checklists: each shows its title (renames in place), "Delete" (confirmed: "The checklist and its items are deleted for everyone."), a progress bar with its percentage (green at 100%), its items as checkboxes (ticked items are struck through) with "Delete item {content}", and "Add an item" (Enter adds and keeps the field open; Escape closes it). Ticking, adding and deleting items show at once and go back with the toast "Couldn't update the checklist. Try again." on failure. A member adds a checklist from "Checklist" under "Add to card" (a popover with the title, "Checklist" to start). Card tiles show the checklist badge `done/total` after the due date, green when all are done. A VIEWER sees checklists read-only.

CARD-005d adds comments under "Activity": a member writes one in "Write a comment" (markdown; "Comment" shows it at the top at once and empties the field; if the server refuses it, it goes away and its text comes back into the field with the error below it). Comments show newest first with the author's avatar and name, the time, "(edited)" once changed, and the text rendered through `Markdown`; "Load more comments" brings older ones. The author (≥ MEMBER) has "Edit" (Save and Cancel; Escape cancels) and "Delete" on their own comments, and an ADMIN or OWNER has "Delete" on anyone's (confirmed: "The comment is deleted for everyone."; it goes at once and comes back with the toast "Couldn't delete the comment. Try again." on failure). An edit waits for the server: the form stays open with the error if it fails. A VIEWER and an archived board see comments read-only. Card tiles show the comment count after the checklist badge ("Comments: 2" for screen readers).

NOTIFICATIONS-001 adds mentions (D-28): typing "@" in "Write a comment" opens "Mention someone", the workspace's other members whose name contains what follows the "@" (at most five); ↑/↓ move, Enter or Tab (or a click) inserts `@[Name](mention:<id>)`, Escape closes the list without closing the card. In a rendered comment a mention shows as the highlighted name, never as a link. Mentioned members are notified (`CARD_MENTIONED`) instead of the plain comment notification.

CARD-005e adds the activity feed. "Show details" next to the card's "Activity" heading lists the card's activity after its comments ("Hide details" hides it), and the board's "Activity" panel lists the whole board's. Each entry reads "{name} {what they did}" with its time, newest first, e.g. "Ada moved this card from To do to Doing" or, on the board, "Ada added Fix login to To do"; labels and checklists too (D-25): "added label Urgent to this card" ("the green label" for a colour-only one), "added checklist Launch to this card", "completed Ship it on this card"; lists, cards and people the page no longer shows read "a list", the title the card was added with (or "a card") and "a former member". "Load more activity" brings older entries; loading, empty ("No activity yet.") and error ("Try again") states as for comments. A feed is fetched again each time it opens, and the card's after the card or its comments change.

ATTACHMENTS-001 adds "Attachments" under the description: each file shows a thumbnail (images) or a file icon, its name as a link that opens or downloads it in a new tab, and "{size} · {uploader} · {date}" ("· Cover" for the cover). A member gets "Add attachment" (a file picker; files over the workspace's plan limit (D-10, BILLING-001) are refused at once, on Free with "Files can be at most 10 MB on the Free plan. Upgrade to Pro for files up to 100 MB.", on Pro with "Files can be at most 100 MB."; during the upload "Uploading {file}…" with a progress bar and its percentage, and "Add attachment" waits; a refused file shows the API's message as a toast), "Make cover" / "Remove cover" on images, and "Delete" on their own files (an ADMIN or OWNER on anyone's; confirmed: "The file is deleted for everyone."; the dialog shows a failure). A VIEWER sees the files only, and the section is hidden when there are none; a member sees "No attachments." then. Signed file URLs expire (D-27): a card or board showing files refetches them every 30 minutes while the tab is visible. Card tiles show the cover image edge to edge above the labels.

**Due dates are whole days in UTC:** the picker (a native date input) stores the end of that day in UTC, the day is shown in UTC (so it reads the same in every time zone), and a card is overdue once that day has ended.

### Public pages `/` (signed out), `/pricing`
BILLING-001 (ADR-022). Both have a public header: "TaskBoard" (to `/`), "Pricing", and "Log in" / "Sign up" when signed out, or "Go to your workspaces" when signed in. The landing page (`/` signed out; signed in, `/` opens the workspaces) has the heading "TaskBoard", one line about the app, "Get started free" (to `/register`) and "See pricing", and three feature tiles (boards, lists and cards; live updates and notifications; roles and workspaces). `/pricing` (public, signed in or not) shows Free ("$0") and Pro ("$5 per member per month", D-13) side by side, each with what it includes, read from `PLAN_LIMITS` (boards, members with pending invites, file size, activity history); signed out, "Get started" and "Start free, upgrade later" lead to `/register`; signed in, Pro says "A workspace owner upgrades from the workspace's settings." Below: "Plans are per workspace. Downgrading never deletes anything; …".

### Auth pages `/login`, `/register`
A centered 400px card on a neutral background: title, fields, primary button, link to the other page. Field errors under each field (from Zod); a server error (`INVALID_CREDENTIALS`) as one message above the button.

## Drag and drop behaviour
- Cards move within and across lists; lists reorder horizontally. The drag shows a tilted copy of the card (`DragOverlay`) and a placeholder where it will drop.
- On drop: the move is applied optimistically; on failure the card animates back and a toast says "Couldn't move the card. Try again."
- Keyboard: focus a card, Space to pick up, ↑/↓ to move within its list, ←/→ to move to the next list, Space to drop, Escape to cancel; moves are announced to screen readers.
- While a drag is in progress, polling and refetch results for that board are not applied (avoids jumps).

## shadcn/ui component map
| Need | Component |
|------|-----------|
| Dialogs (create board, card modal) | `Dialog` |
| Confirm destructive action | `AlertDialog`; inside a popover (label picker), an inline confirm step instead, so the popover stays open and keeps focus |
| Menus (list ⋯, board ⋯, avatar) | `DropdownMenu` |
| Pickers (labels, members, colour) | `Popover` (+ `Command` once a list needs search; the label picker is a checkbox list) |
| Due date | Native `<input type="date">` (CARD-002; no calendar dependency) |
| Toasts | `Sonner` |
| Forms | `Form` pattern with React Hook Form, `Input`, `Textarea`, `Button` |
| Loading | `Skeleton` |
| Avatars | `Avatar` |
Add a component with the shadcn CLI when a task first needs it; do not hand-write primitives that shadcn provides.

## Copy
All UI text is English (ADR-019); the MVP has no translations. Sentence case everywhere ("Add a card", not "Add A Card"). Errors say what happened and what to do ("Couldn't save the title. Check your connection and try again."). No technical codes in the UI.
