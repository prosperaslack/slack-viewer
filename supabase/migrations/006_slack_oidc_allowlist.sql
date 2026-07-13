-- Allow Slack OIDC sign-ins through the archive (workspace gate via Slack app).
-- Email allowlist still applies for community-password accounts.
create or replace function public.is_allowlisted()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Signed in with Slack (OIDC)
    coalesce(auth.jwt() -> 'app_metadata' ->> 'provider', '') = 'slack_oidc'
    or coalesce(auth.jwt() -> 'app_metadata' -> 'providers', '[]'::jsonb)
         ? 'slack_oidc'
    -- Or email is on the community allowlist
    or exists (
      select 1
      from public.allowed_emails a
      where a.active = true
        and lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;
