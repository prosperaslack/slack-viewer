-- Single fast bootstrap for login (no RLS row scans on users/channels/messages)
create or replace function public.load_workspace_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.is_allowlisted() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'users', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', u.id,
        'name', u.name,
        'real_name', u.real_name,
        'display_name', u.display_name,
        'email', u.email,
        'avatar_72', u.avatar_72,
        'is_admin', u.is_admin,
        'is_bot', u.is_bot,
        'deleted', u.deleted
      ) order by u.name)
      from public.slack_users u
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'name', c.name,
        'kind', c.kind,
        'topic', c.topic,
        'purpose', c.purpose,
        'member_count', c.member_count,
        'is_general', c.is_general
      ) order by c.is_general desc, c.member_count desc, c.name)
      from public.slack_channels c
    ), '[]'::jsonb),
    'stats', jsonb_build_object(
      'message_count', (select count(*) from public.slack_messages m where coalesce(m.hidden, false) = false),
      'channel_count', (select count(*) from public.slack_channels),
      'user_count', (select count(*) from public.slack_users)
    )
  ) into result;

  return result;
end;
$$;

grant execute on function public.load_workspace_bootstrap() to authenticated;
