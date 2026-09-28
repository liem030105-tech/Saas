# TaskBoard – Trello Clone SaaS

A Kanban-style task management SaaS (workspaces, boards, lists, cards, drag and drop, realtime collaboration, Free/Pro plans), built as a pnpm monorepo with a React frontend and a Node.js backend.

> **Status:** architecture and documentation phase. Application code starts in Phase 0 – see [`plan.md`](plan.md).

## Repository layout

```
├── Trello-Clone-FE/      # @trello-clone/web    – React + Vite frontend
├── Trello-Clone-BE/      # @trello-clone/api    – Node.js + Express + Prisma backend
├── packages/shared/      # @trello-clone/shared – shared Zod schemas, types, constants
├── docs/                 # technical documentation
├── .claude/              # Claude Code instructions, skills, commands
└── plan.md               # project blueprint and roadmap
```

## Getting started
Prerequisites, installation, environment variables, and daily commands: [`docs/development/setup.md`](docs/development/setup.md).

## Where to start
- **Project blueprint & roadmap:** [`plan.md`](plan.md)
- **Architecture:** [`docs/architecture/overview.md`](docs/architecture/overview.md)
- **API:** [`docs/api/README.md`](docs/api/README.md)
- **Local setup:** [`docs/development/setup.md`](docs/development/setup.md)
- **Architecture decisions:** [`docs/decisions/README.md`](docs/decisions/README.md)
- **Working with Claude Code:** [`.claude/CLAUDE.md`](.claude/CLAUDE.md)

## Tech stack
React, TypeScript, Vite, TanStack Query, Zustand, @dnd-kit, Tailwind CSS, shadcn/ui · Node.js, Express, Prisma, PostgreSQL, Socket.IO, Zod · Vitest, Supertest, Playwright · pnpm workspace.
