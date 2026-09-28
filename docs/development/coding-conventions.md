# Coding Conventions

> **Domain:** code style, naming, Git. Per-layer architecture rules live in `docs/architecture/`.

## TypeScript
- `strict: true`, `noUncheckedIndexedAccess: true`. No `any`; use `unknown` and narrow.
- Types for data crossing the API come from `z.infer<typeof Schema>` in `@trello-clone/shared`; never declare them a second time by hand.
- Named exports only; default exports only where a tool requires them (vite, playwright configs).
- Prefer `async/await`; no floating promises (ESLint `no-floating-promises`).

## Naming
| Kind | Convention | Example |
|------|------------|---------|
| BE files | `<module>.<layer>.ts` | `cards.service.ts` |
| React components | PascalCase | `CardDetailModal.tsx` |
| Hooks | camelCase starting with `use` | `useMoveCard.ts` |
| Zod schemas | PascalCase + suffix | `CreateCardInput`, `CardDto` |
| Constants | UPPER_SNAKE | `PLAN_LIMITS` |
| Realtime events | `domain:past-tense-verb` | `card:moved` |
| Routes | kebab-case, plural nouns | `/workspaces/:id/members` |
| Branches | `feat/…`, `fix/…`, `docs/…`, `chore/…` | `feat/card-move` |

## Formatting and linting
- Prettier: 2 spaces, single quotes, semicolons, `printWidth` 100.
- ESLint: `@typescript-eslint`, `react-hooks`, `import/order`, `no-restricted-imports` (blocks cross-feature/cross-module internals and any FE ↔ BE import).
- No `console.log` in committed code; the BE uses the logger.

## Comments
- Explain **why**, not what.
- `TODO(<name>): …` must reference an issue or a reason.

## Git
- **Conventional Commits:** `feat(cards): move card between boards`, `fix(auth): …`, `docs: …`, `test: …`, `chore: …`.
- One concern per PR, ideally under ~400 changed lines (excluding generated files). PR description covers what, why, and how it was tested.
- Never commit `.env`, build output, or `node_modules`.
- No force-pushes to `main`; merge via PR with green CI.
