# Database

Single Neon Postgres project, owned by this repo. The `dplus` marketing site does
not read these tables.

## Rules

1. **Migrations are additive.** New tables, new columns, new indexes. A deploy must
   be able to roll back to the previous build without the database breaking it.
2. **Never edit a migration that has run in production.** The runner stores a
   checksum per file and refuses to continue if an applied file has changed.
3. **One concern per file**, numbered, zero-padded, snake_case:
   `010_qr_something.sql`.
4. **`qr_codes` is on the redirect path.** Any migration touching it is reviewed
   for lock duration before it runs against production.

## Commands

```bash
npm run db:migrate          # apply anything pending
npm run db:migrate:status   # list applied and pending, apply nothing
```

Both read `DATABASE_URL` from `.env.local`.

## Why `on delete restrict` on qr_codes.user_id

Deleting an account must never silently break a printed code. Accounts are
suspended and codes are paused; neither is deleted. A genuine deletion request is
handled deliberately, after the retention window, not by a cascade.
