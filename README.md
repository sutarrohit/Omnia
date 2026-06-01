# Template

A [Turborepo](https://turborepo.dev/) monorepo containing a **Next.js web frontend** and a **Hono API server**, sharing common ESLint/TypeScript configs and a UI component library. Package manager is **pnpm**, and all code is **TypeScript**.

## What's inside?

```
sales/
├── apps/
│   ├── web/        → Next.js 16 frontend (React 19, Tailwind v4, shadcn/ui)
│   └── server/     → Hono API server (@repo/api), Prisma + Postgres
├── packages/
│   ├── ui/                 → @repo/ui — shared React component library
│   ├── eslint-config/      → @repo/eslint-config — shared ESLint configs
│   └── typescript-config/  → @repo/typescript-config — shared tsconfig bases
├── turbo.json              → Turborepo task pipeline
└── pnpm-workspace.yaml      → workspace globs (apps/*, packages/*)
```

### Apps and Packages

| Package                   | Path                         | Description                    |
| ------------------------- | ---------------------------- | ------------------------------ |
| `web`                     | `apps/web`                   | Next.js frontend               |
| `@repo/api`               | `apps/server`                | Hono backend API               |
| `@repo/ui`                | `packages/ui`                | Shared React component library |
| `@repo/eslint-config`     | `packages/eslint-config`     | Shared ESLint configuration    |
| `@repo/typescript-config` | `packages/typescript-config` | Shared `tsconfig.json` bases   |

---

## `apps/web` — Frontend

A **Next.js 16** application using the **App Router** (`app/`), **React 19** (with the React Compiler), **Tailwind CSS v4**, and **shadcn/ui** components built on Radix UI.

**Key tech:**

- **Next.js 16** + **React 19** — App Router under `app/`.
- **Tailwind CSS v4** — styling, configured via `postcss.config.mjs` and `app/globals.css`.
- **shadcn/ui** + **Radix UI** — UI primitives in `components/ui` (`components.json` config).
- **TanStack Query** (`@tanstack/react-query`) — server-state/data fetching, with a shared client in `lib/getQueryClient.ts`.
- **next-themes** — light/dark theme support (`providers/theme-provider.tsx`).
- **lucide-react** — icons.

**Structure:**

```
apps/web/
├── app/                → routes, layout, global styles (App Router)
├── components/ui/      → shadcn/ui components
├── providers/          → React context providers (theme, query client)
├── lib/
│   ├── api/            → typed API hooks/queries (TanStack Query)
│   ├── getQueryClient.ts
│   └── utils.ts
└── utils/
    ├── request.ts      → fetch wrapper around the API server
    └── handleResponse.ts
```

**Talking to the API:** `utils/request.ts` wraps `fetch` and points at the server via the
`NEXT_PUBLIC_API_URL` environment variable, defaulting to `http://localhost:4000/api/v1`.

> **Note:** This repo pins a pre-release/breaking version of Next.js. See `apps/web/AGENTS.md` —
> APIs and conventions may differ from older Next.js; consult `node_modules/next/dist/docs/` when in doubt.

**Scripts** (run from `apps/web/` or via Turbo filters):

| Script           | Description                  |
| ---------------- | ---------------------------- |
| `pnpm run dev`   | Start the Next.js dev server |
| `pnpm run build` | Production build             |
| `pnpm run start` | Serve the production build   |
| `pnpm run lint`  | Lint with ESLint             |

---

## `apps/server` — API

A **Hono** backend (`@repo/api`) exposing a typed, OpenAPI-documented REST API. It runs on
**Node.js** locally via `@hono/node-server` and is deployable to **AWS Lambda** via CDK.

**Key tech:**

- **Hono** + **@hono/zod-openapi** / **hono-openapi** — routing with Zod-validated, OpenAPI-documented endpoints.
- **@hono/swagger-ui** — interactive API docs.
- **Prisma 7** (`@prisma/client` + `@prisma/adapter-pg`) — Postgres data access.
- **Zod** — request/response validation and env-var validation (`src/env.ts`).
- **Pino** (`hono-pino`) — structured logging.
- **hono-rate-limiter** — rate limiting middleware.

**Structure:**

```
apps/server/
├── src/
│   ├── app.ts          → shared Hono app (routes + middleware + OpenAPI)
│   ├── index.ts        → local Node entry point (@hono/node-server, port 4000)
│   ├── env.ts          → Zod-validated environment config
│   ├── lib/            → app factory, Prisma client, OpenAPI config, error helpers
│   ├── middlewares/    → logging, rate limit, error & not-found handlers
│   ├── routes/         → feature routes (e.g. demo/) — route + handler + index
│   └── services/       → business logic (e.g. demoService)
├── prisma/
│   ├── schema.prisma   → User, Post, Demo, Product models
│   └── seed.ts         → database seeding
├── lambda/index.ts     → AWS Lambda entry point (hono/aws-lambda)
├── infra/stack.ts      → AWS CDK stack (Lambda + Function URL)
└── deploy.md           → AWS Lambda deployment guide
```

**Endpoints:** routes are mounted under `/api/v1` (e.g. `GET /api/v1/demo`), plus a `GET /health`
health check. The shared `src/app.ts` is used by both the local Node server and the Lambda handler.

**Scripts** (run from `apps/server/`):

| Script                 | Description                                        |
| ---------------------- | -------------------------------------------------- |
| `pnpm run dev`         | Start the dev server with hot reload (tsx watch)   |
| `pnpm run build`       | Compile TypeScript to `dist/`                      |
| `pnpm run start`       | Run the compiled server (`node dist/index.js`)     |
| `pnpm run test`        | Run tests (Vitest)                                 |
| `pnpm run db:migrate`  | Run Prisma migrations (dev)                        |
| `pnpm run db:generate` | Generate the Prisma client                         |
| `pnpm run db:seed`     | Seed the database                                  |
| `pnpm run cdk:deploy`  | Deploy to AWS Lambda (see `apps/server/deploy.md`) |

See **`apps/server/deploy.md`** for the full AWS Lambda + CDK deployment guide.

---

## Getting Started

### Prerequisites

- **Node.js** 18+
- **pnpm** 9 (`packageManager` is pinned to `pnpm@9.0.0`)
- A **PostgreSQL** database (for the API server)

### Install

```sh
pnpm install
```

### Configure the API server

```sh
cd apps/server
cp .env.example .env
# edit .env: set DATABASE_URL, DIRECT_URL, FRONTEND_URL, etc.
pnpm run db:generate
pnpm run db:migrate
```

### Develop

From the repo root, run **everything** with Turbo:

```sh
pnpm run dev
```

Or develop a single app with a [filter](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters):

```sh
pnpm exec turbo dev --filter=web
pnpm exec turbo dev --filter=@repo/api
```

By default the web app runs on `http://localhost:3000` and the API on `http://localhost:4000`.

---

## Common Commands

All run from the repo root and fan out across the workspace via Turborepo:

| Command                | Description                 |
| ---------------------- | --------------------------- |
| `pnpm run dev`         | Run all apps in dev mode    |
| `pnpm run build`       | Build all apps and packages |
| `pnpm run lint`        | Lint the whole monorepo     |
| `pnpm run check-types` | Type-check all packages     |
| `pnpm run format`      | Format with Prettier        |

Scope any task to one package with `--filter`, e.g. `pnpm exec turbo build --filter=web`.

---

## Shared Packages

- **`@repo/ui`** — shared React components, imported as `@repo/ui/<component>`. Generate a new
  component with `pnpm --filter @repo/ui run generate:component`.
- **`@repo/eslint-config`** — shared ESLint configurations consumed by every app/package.
- **`@repo/typescript-config`** — base `tsconfig.json`s (e.g. `base.json`) extended throughout the monorepo.

---

## Tooling

- [Turborepo](https://turborepo.dev/) — task running and caching
- [TypeScript](https://www.typescriptlang.org/) — static typing across the monorepo
- [ESLint](https://eslint.org/) — linting
- [Prettier](https://prettier.io) — formatting
