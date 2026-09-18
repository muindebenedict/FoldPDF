-- Keep-alive target for .github/workflows/supabase-keepalive.yml.
--
-- Supabase pauses free-tier projects after 7 days without activity, and
-- FoldPDF only talks to Supabase when someone signs in or submits a form, so a
-- quiet week would take sign-in offline. A daily scheduled job calls this.
--
-- It has to be a query that succeeds: every table refuses the anon role, and a
-- refused request is not reliably counted as activity. This touches no tables
-- and returns nothing but a constant, so exposing it to anon reveals nothing.

create or replace function public.keepalive()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select 'ok'::text;
$$;

revoke all on function public.keepalive() from public;
grant execute on function public.keepalive() to anon;
