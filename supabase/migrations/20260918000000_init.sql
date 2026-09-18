-- FoldPDF initial schema: replaces the Firestore `subscribers` and
-- `support_tickets` collections. Run once, in the Supabase SQL editor, on a new
-- project.
--
-- Security model carried over from the final firestore.rules:
--   * No catch-all access. Anything without an explicit grant AND policy is
--     denied, and nothing is readable from the client at all.
--   * Column-level INSERT grants play the role of the old
--     request.resource.data.keys().hasOnly([...]) checks: a client can only
--     supply the columns listed, so ids, owners, status and timestamps always
--     come from server-side defaults.
--   * CHECK constraints carry the old per-field size limits.

-- ------------------------------------------------------------------ tables

create table public.subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique
                  check (email = lower(email) and char_length(email) between 3 and 254),
  -- Nullable so rows imported from Firestore (whose users are not migrated)
  -- can exist without an owner. New rows always get the caller's id.
  user_id       uuid default auth.uid()
                  references auth.users (id) on delete cascade,
  subscribed_at timestamptz not null default now()
);

create table public.support_tickets (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null check (char_length(full_name) between 1 and 120),
  email        text not null check (char_length(email) between 3 and 254),
  category     text not null check (char_length(category) between 1 and 120),
  message      text not null check (char_length(message) between 1 and 5000),
  status       text not null default 'open'
                 check (status in ('open', 'in_progress', 'closed')),
  submitted_at timestamptz not null default now()
);

-- -------------------------------------------------------------- privileges

-- Supabase grants every privilege on new public tables to anon and
-- authenticated by default. Start from nothing and add back only inserts.
revoke all on public.subscribers     from anon, authenticated;
revoke all on public.support_tickets from anon, authenticated;

grant insert (email) on public.subscribers to authenticated;
grant insert (full_name, email, category, message) on public.support_tickets to anon, authenticated;

-- ---------------------------------------------------------- row security

alter table public.subscribers     enable row level security;
alter table public.support_tickets enable row level security;

-- A signed-in user may subscribe their own account address and nothing else.
-- There is deliberately no SELECT policy: the client learns about an existing
-- subscription from the unique-constraint error, which only ever concerns the
-- caller's own address, so the list can never be read or enumerated.
create policy "Users can subscribe their own address"
  on public.subscribers
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and email = lower(auth.jwt() ->> 'email')
  );

-- Logged-out visitors must be able to file a ticket. Tickets hold names,
-- emails and free-text about people's documents, so there is no SELECT,
-- UPDATE or DELETE policy: triage them from the dashboard or with the
-- service role, never from the browser.
create policy "Anyone can file a support ticket"
  on public.support_tickets
  for insert
  to anon, authenticated
  with check (status = 'open');
