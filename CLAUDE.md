# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project layout

pnpm + Turborepo monorepo. Package manager is pinned to **pnpm 9** (`packageManager` in root `package.json`); use `pnpm`, not npm/yarn.

- `apps/web` — Next.js 16 (App Router, React 19, React Compiler enabled), Tailwind CSS v4, shadcn/ui. Package name `web`.
- `apps/server` — Hono API (`@repo/api`), Prisma 7 + PostgreSQL, zod-openapi/Swagger docs, Pino logging. Deploys to AWS Lambda via CDK.
- `packages/eslint-config` (`@repo/eslint-config`) — shared flat ESLint configs.
- `packages/typescript-config` (`@repo/typescript-config`) — shared tsconfig bases.

## Commands

Run from repo root (Turborepo fans out to all workspaces):

- `pnpm dev` — run all apps (web :3000, server :4000)
- `pnpm build` / `pnpm lint` / `pnpm check-types` — build / lint / type-check everything
- `pnpm format` — Prettier over `**/*.{ts,tsx,md}`

Scope a task to one workspace with `--filter` (by package name):

```
pnpm exec turbo dev --filter=web
pnpm exec turbo dev --filter=@repo/api
```

Server-only scripts (run in `apps/server`):

- Tests use **Vitest**: `pnpm test`, `pnpm test:watch`, `pnpm test:coverage`. The web app has no tests.
- DB: `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:seed:reset`
- Deploy (AWS CDK): `pnpm cdk:synth`, `pnpm cdk:diff`, `pnpm cdk:deploy`, `pnpm cdk:destroy`

## Setup gotchas

- **Server DB must be set up before first `dev` run:** in `apps/server`, `cp .env.example .env`, fill in Postgres creds, then `pnpm db:generate && pnpm db:migrate`.
- **Prisma uses two URLs:** `DATABASE_URL` is the pooled connection; `DIRECT_URL` is the direct connection used for migrations. Both are required.
- **Web → API:** the web app reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000/api/v1`); see `apps/web/utils/request.ts`.

## Conventions

- TypeScript is **strict** everywhere with `noUncheckedIndexedAccess` enabled — array/record access yields `T | undefined`; handle it.
- Path alias `@/*` maps to each app's root.
- ESLint 9 flat config; the shared config routes all rules through `only-warn` (errors surface as warnings). Still fix them.
- **Next.js 16 is newer than your training data** — its APIs, conventions, and file structure may differ. Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js code (see `apps/web/AGENTS.md`).

## Git

Branch off `main` and open a PR to merge (no enforced branch-naming scheme). Don't commit straight to `main`.
