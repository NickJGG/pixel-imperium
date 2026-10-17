# Deploying

One Fly machine serves the built SPA, `/api` and (from co-op on) `/ws` on one origin; Postgres lives on Supabase.

## First deploy

1. **Supabase**: create a project in the region nearest Fly's `iad` (US East, N. Virginia). Under Connect, copy the **Session pooler** connection string (port 5432). Not the Transaction pooler (port 6543): it breaks prepared statements, which `postgres` uses.
2. **Fly app**: `fly launch --no-deploy --copy-config` (keep the name in `fly.toml`, or change `app` to whatever Fly gives you).
3. **Secrets**:
   ```sh
   fly secrets set \
     DATABASE_URL='postgres://…pooler.supabase.com:5432/postgres' \
     BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
     BETTER_AUTH_URL='https://<domain>' \
     GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… \
     DISCORD_CLIENT_ID=… DISCORD_CLIENT_SECRET=…
   ```
4. **OAuth redirects**: add `https://<domain>/api/auth/callback/google` in Google Cloud and `https://<domain>/api/auth/callback/discord` in the Discord developer portal.
5. **Deploy**: `fly deploy --ha=false`. The release command (`pnpm db:migrate`) applies Drizzle migrations to Supabase before the new machine starts.
6. **Domain**: buy it at a registrar, `fly certs add <domain>`, add the DNS records it prints, and wait for `fly certs show <domain>` to report the certificate issued.

## Check

- `/` loads, and a deep link like `/play/<id>` loads too (the server falls back to `index.html`).
- `/api/health` answers `ok`.
- Sign in with Google and Discord, then solve a puzzle and see it in the album.

## Later deploys

`fly deploy`. Migrations run on every release; a failed migration stops the deploy with the old machine still serving.

## Notes

- Supabase free projects pause after 7 days with no traffic and must be restored by hand from the dashboard. Upgrade to Pro at public launch.
- Keep one machine: co-op rooms live in its memory. `auto_stop_machines = 'off'` keeps it awake, and the server saves state on SIGTERM within Fly's 30s `kill_timeout`.
