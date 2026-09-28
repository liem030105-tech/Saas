---
paths:
  - "Trello-Clone-FE/**"
---

# Frontend (Trello-Clone-FE) rules

Loaded automatically when Claude reads matching files. Procedures, references, and checklists: the `frontend` skill.

- Domain code goes in `features/<x>/` (`api.ts`, `queries.ts`, `components/`, `hooks/`). `components/` holds only domain-agnostic UI.
- Import other features only through their `index.ts`.
- **Server data → TanStack Query** with a key factory in `queries.ts`. **Zustand → UI state only.** Never copy server data into a store.
- Mutations that affect the board use optimistic updates: `onMutate` snapshot → `onError` rollback → `onSettled` invalidate.
- Forms: React Hook Form + `zodResolver` with schemas from `@trello-clone/shared`; never redefine API types by hand.
- API calls go through `src/api` `apiClient` only; never create a new axios instance.
- Role-based UI hiding is UX only; never treat it as security.
- Render markdown only through the sanitized markdown component; never `dangerouslySetInnerHTML`.
- Handle loading, empty, and error states for every query.
- Accessibility: interactive elements are real buttons/links with labels; drag and drop keeps @dnd-kit keyboard sensors.
