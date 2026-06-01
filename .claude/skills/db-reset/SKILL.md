---
name: db-reset
description: Reset and reseed the server's PostgreSQL database from scratch — regenerates the Prisma client, applies migrations, and reseeds with a clean slate. Use when the local dev database is in a bad state or after pulling schema changes.
disable-model-invocation: true
---

Reset the local development database for `apps/server`. This is destructive — it reseeds from scratch.

Run these in order from `apps/server` (stop and report if any step fails):

1. `pnpm db:generate` — regenerate the Prisma client from the current schema.
2. `pnpm db:migrate` — apply pending migrations.
3. `pnpm db:seed:reset` — wipe and reseed the database.

Before running, confirm the server's `.env` exists and `DATABASE_URL` / `DIRECT_URL` point at the **local** dev database, not a shared/production one. If `$ARGUMENTS` names a specific step, run only from that step onward.

After completion, report which steps ran and any seed summary output.
