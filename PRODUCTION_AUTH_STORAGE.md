# ConnectCircle Production Storage

ConnectCircle now supports Turso/libSQL as the preferred no-cost durable
database path. Postgres is still supported as a fallback, and local `.data`
files remain useful for development without a database.

## Runtime Behavior

- If `TURSO_DATABASE_URL` is configured, the app uses Turso first.
- If Turso is not configured, `DATABASE_URL` or `POSTGRES_URL` still enables
  the existing Postgres storage path for users, connections, and direct chat.
- Local development without a database keeps using `.data` files.
- If `VERCEL=1` or `CONNECTCIRCLE_REQUIRE_DATABASE=true` and no database URL is
  configured for critical stores, the app throws instead of silently using local
  files.

## Required Production Variables

Set these in Vercel Project Settings -> Environment Variables:

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
CONNECTCIRCLE_REQUIRE_DATABASE=true
CONNECTCIRCLE_SESSION_SECRET=replace-this-with-a-long-random-string
```

Turso takes priority when it is present, so you can leave old Postgres variables
in place while testing. Once Turso production is verified, remove the old
Postgres variables from Vercel to avoid confusion.

## Schema

Turso uses:

- `connectcircle_chat_messages` for direct messages, with media stored as
  binary blobs instead of base64 JSON text.
- `connectcircle_documents` for smaller app stores, compressed with gzip before
  being saved.

The app creates these tables automatically on first use, and the migration
script creates them before import.

## Migrating Existing Local Data

Create `.env.turso.local` locally:

```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-auth-token
```

Then run:

```bash
npm run migrate:turso
```

This imports users, login throttles, connections, direct chat text/media,
circles, CircleChat data, mood entries, feedback, reports, admin users,
notifications, presence, and support messages.

If the current Postgres database has newer production rows than the local
`.data` files, add both the old Postgres URL and the new Turso variables to
`.env.local`/`.env.turso.local`, then run:

```bash
npm run migrate:postgres-to-turso
```

That imports the Postgres-backed users, login throttles, connections, and direct
messages into Turso. If the old Neon database is already quota-blocked, this
step may need to wait until Neon allows reads again.

## Password Storage

New password accounts use:

- unique random salt per user
- Node scrypt with `N=131072`, `r=8`, `p=1`, `keylen=64`
- a version marker in `password_algorithm`
- constant-time hash comparison during login
- login throttling after repeated failed password attempts

The app keeps compatibility with older local password hashes and upgrades them
after a successful password login.
