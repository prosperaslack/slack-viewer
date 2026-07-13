-- Latest-60 channel fetch + fast FTS search (security definer, allowlist once)
-- Run in Supabase SQL Editor

drop function if exists public.get_channel_messages(text, int, int);
drop function if exists public.get_channel_messages(text, int, double precision);
drop function if exists public.channel_message_counts();

create or replace function public.archive_stats()
returns table (message_count bigint, channel_count bigint, user_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_allowlisted() then
    return;
  end if;

  return query
  select
    (select count(*)::bigint from public.slack_messages m where coalesce(m.hidden, false) = false),
    (select count(*)::bigint from public.slack_channels),
    (select count(*)::bigint from public.slack_users);
end;
$$;

-- Latest N messages, or N messages around a timestamp (for search navigation)
create or replace function public.get_channel_messages(
  p_channel_id text,
  p_limit int default 60,
  p_around_ts double precision default null
)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  thread_ts text,
  user_id text,
  display_name text,
  avatar text,
  text text,
  subtype text,
  reply_count int,
  reactions jsonb,
  hidden boolean,
  msg_ts double precision
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  lim int := greatest(1, least(coalesce(p_limit, 60), 60));
  half int;
begin
  if not public.is_allowlisted() then
    return;
  end if;

  if p_around_ts is null then
    return query
    select *
    from (
      select
        m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
        m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
        m.reactions, m.hidden, m.msg_ts
      from public.slack_messages m
      where m.channel_id = p_channel_id
        and coalesce(m.hidden, false) = false
      order by m.msg_ts desc
      limit lim
    ) recent
    order by recent.msg_ts asc;
    return;
  end if;

  half := greatest(1, lim / 2);

  return query
  with around as (
    (
      select
        m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
        m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
        m.reactions, m.hidden, m.msg_ts
      from public.slack_messages m
      where m.channel_id = p_channel_id
        and coalesce(m.hidden, false) = false
        and m.msg_ts <= p_around_ts
      order by m.msg_ts desc
      limit half
    )
    union all
    (
      select
        m.channel_id, m.channel_name, m.ts, m.thread_ts, m.user_id,
        m.display_name, m.avatar, m.text, m.subtype, m.reply_count,
        m.reactions, m.hidden, m.msg_ts
      from public.slack_messages m
      where m.channel_id = p_channel_id
        and coalesce(m.hidden, false) = false
        and m.msg_ts > p_around_ts
      order by m.msg_ts asc
      limit lim - half
    )
  )
  select * from around order by msg_ts asc;
end;
$$;

-- Fast full-text search across all channels
create or replace function public.search_slack_messages(q text, lim int default 50)
returns table (
  channel_id text,
  channel_name text,
  ts text,
  thread_ts text,
  user_id text,
  display_name text,
  avatar text,
  text text,
  msg_ts double precision,
  rank real
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  query_limit int := greatest(1, least(coalesce(lim, 50), 50));
  tsq tsquery;
begin
  if not public.is_allowlisted() then
    return;
  end if;

  if q is null or length(trim(q)) = 0 then
    return;
  end if;

  begin
    tsq := websearch_to_tsquery('english', q);
  exception when others then
    tsq := plainto_tsquery('english', q);
  end;

  if tsq is null or tsq = ''::tsquery then
    return;
  end if;

  return query
  select
    m.channel_id,
    m.channel_name,
    m.ts,
    m.thread_ts,
    m.user_id,
    m.display_name,
    m.avatar,
    m.text,
    m.msg_ts,
    ts_rank(m.search_vector, tsq) as rank
  from public.slack_messages m
  where coalesce(m.hidden, false) = false
    and m.search_vector @@ tsq
  order by rank desc, m.msg_ts desc
  limit query_limit;
end;
$$;

grant execute on function public.archive_stats() to authenticated;
grant execute on function public.get_channel_messages(text, int, double precision) to authenticated;
grant execute on function public.search_slack_messages(text, int) to authenticated;

create index if not exists slack_messages_channel_msg_ts_idx
  on public.slack_messages (channel_id, msg_ts);

create index if not exists slack_messages_search_idx
  on public.slack_messages using gin (search_vector);
