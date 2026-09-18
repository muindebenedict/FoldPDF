# Supabase

FoldPDF's auth and database. Project `gmnfqpyyfxoszaworumz`, West EU (Ireland),
free tier: `https://gmnfqpyyfxoszaworumz.supabase.co`.

Much of what the app depends on is dashboard configuration that the code can't
show. It's recorded here so it can be checked or rebuilt.

## Migrations

Applied by hand in the SQL editor, in filename order. There is no CLI linking.

| File | What it does | Applied |
|---|---|---|
| `migrations/20260918000000_init.sql` | `subscribers`, `support_tickets`, grants, row-level security | 2026-09-18 |
| `migrations/20260918000100_keepalive.sql` | `public.keepalive()` for the daily keep-alive job | 2026-09-18 |

Nothing is readable from the browser. Inserts are limited by column-level grants
and CHECK constraints. The rationale is in the comments at the top of the init
migration.

## Keys

- **Publishable key** (`sb_publishable_...`): public. It goes in
  `VITE_SUPABASE_PUBLISHABLE_KEY` and ships in the site bundle. Row-level
  security is what protects data, not this key.
- **Secret key** (`sb_secret_...`): full access, bypasses RLS. Never put it in a
  `VITE_` variable, the repo, or anything that reaches a browser.

## Dashboard settings the code relies on

**Authentication → URL Configuration**
- Site URL: `https://www.foldpdf.online`
- Redirect URLs: `https://www.foldpdf.online/**`, `http://localhost:3000/**`

The app sends users back to the page they were on, so the wildcards are needed.
Without the localhost entry, sign-in can't be tested locally.

**Authentication → Sign In / Providers**
- Email: on, with **Confirm email** on. The app also treats unconfirmed email
  accounts as signed out, in case this is ever switched off.
- Google: needs a *Web application* OAuth client in the FoldPDF Google Cloud
  project with redirect URI
  `https://gmnfqpyyfxoszaworumz.supabase.co/auth/v1/callback`.

**Authentication → Emails → SMTP Settings**

Required before launch. The built-in sender only allows a few emails per hour,
and templates can't be edited without custom SMTP.

**Authentication → Emails → Templates** (optional, needs SMTP first)

Password reset and email confirmation work with the default templates. The
client uses the implicit flow (`src/lib/supabase.ts`), so the links work on any
device.

One weakness of the default links: some email security scanners, mostly
corporate ones, open every link in an email to check it, and that can use up
the one-time token before the person clicks it. Linking to the app with the
token hash avoids this, because the scanner only loads a static page. `App.tsx`
already handles these links (it calls `verifyOtp`). To use them, replace the
**Reset password** body with:

```html
<h2>Reset your password</h2>
<p>We received a request to reset your password. Follow the link below to choose a new one.</p>
<p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Reset password</a></p>
<p>If you didn't request this, you can safely ignore this email.</p>
```

`{{ .RedirectTo }}` is the `redirectTo` the app passed (its own origin), so the
link works both in production and on localhost. For **Confirm sign up**, use the
same link with `type=email` instead of `type=recovery`.

## Keep-alive

Free projects pause after 7 days without activity.
`.github/workflows/supabase-keepalive.yml` calls `public.keepalive()` daily at
06:17 UTC. If it fails, GitHub emails the repo owner. Check whether the project
was paused or the publishable key rotated.
