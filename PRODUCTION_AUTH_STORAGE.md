# ConnectCircle Production Auth Storage

This pass moves student user accounts and password hashes away from local
`.data/users.json` when a Postgres connection string is configured.

## Runtime Behavior

- Local development without `DATABASE_URL` keeps using `.data/users.json`.
- Vercel/production should use Postgres through `DATABASE_URL` or `POSTGRES_URL`.
- If `VERCEL=1` or `CONNECTCIRCLE_REQUIRE_DATABASE=true` and no database URL is
  configured, user storage throws an error instead of silently using local files.

## Required Production Variables

Set these in Vercel Project Settings -> Environment Variables:

```env
DATABASE_URL=postgres://user:password@host/database?sslmode=require
CONNECTCIRCLE_REQUIRE_DATABASE=true
CONNECTCIRCLE_SESSION_SECRET=replace-this-with-a-long-random-string
```

Vercel Marketplace Postgres integrations, such as Neon, may inject
`POSTGRES_URL` automatically. The app accepts either `DATABASE_URL` or
`POSTGRES_URL`.

## Schema

The app creates the `connectcircle_users` and
`connectcircle_user_login_attempts` tables automatically on first use when
Postgres is configured. The same schema is also available at:

```text
database/connectcircle-users.sql
```

Connection requests, friendships, and blocked-user records also use Postgres
when `DATABASE_URL` or `POSTGRES_URL` is configured. Local development without
a database keeps using `.data/connections.json`.

Direct chat messages and their image/video attachment metadata also use
Postgres when `DATABASE_URL` or `POSTGRES_URL` is configured. Local development
without a database keeps using `.data/chat-messages.json`.

## Migrating Existing Local Users

After adding `DATABASE_URL` to `.env.local`, run:

```bash
npm run migrate:users
```

This imports `.data/users.json` into Postgres. Existing password hashes are not
exposed or converted during import. If an old account logs in successfully, the
app upgrades that password hash to the current scrypt work factor.

To import local connection and direct-message history into the same database,
run:

```bash
npm run migrate:connections
npm run migrate:chat
```

## Password Storage

New password accounts use:

- unique random salt per user
- Node scrypt with `N=131072`, `r=8`, `p=1`, `keylen=64`
- a version marker in `password_algorithm`
- constant-time hash comparison during login
- login throttling after repeated failed password attempts

The app keeps compatibility with older local password hashes and upgrades them
after a successful password login.

## Still To Migrate

These app areas still use local `.data` files and should be migrated before
real production:

- circles
- mood entries and shared moods
- reports and admin accounts
- feedback records, if persisted locally
