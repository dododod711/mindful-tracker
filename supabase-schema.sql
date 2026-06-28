-- Lumen — Friends backend (Supabase / Postgres)
-- Paste this whole file into the Supabase SQL editor and run it once.
-- Security model:
--   * Row Level Security is on for every table.
--   * A friend can only read your shared_state once BOTH sides accept.
--   * Username search goes through a SECURITY DEFINER function so the
--     profiles table can't be enumerated.
--   * Only mood / streak / last check-in / a short status are ever shared.
--     Journal text is never stored here — it stays on the device.

-- ---------- Profiles ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  display_name text,
  created_at   timestamptz default now()
);
-- Case-insensitive unique usernames
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

alter table public.profiles enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (id = auth.uid());

drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles
  for update using (id = auth.uid());

-- Auto-create a profile when a user signs up (username comes from sign-up metadata)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(coalesce(new.raw_user_meta_data->>'username', 'user_' || substr(new.id::text, 1, 8))),
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'username')
  );
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Friendships ----------
create table if not exists public.friendships (
  id         uuid primary key default gen_random_uuid(),
  requester  uuid not null references auth.users(id) on delete cascade,
  addressee  uuid not null references auth.users(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending','accepted','declined')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (requester <> addressee)
);
-- One relationship per pair, regardless of who asked first
create unique index if not exists friendships_pair_idx
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;

drop policy if exists "read own friendships" on public.friendships;
create policy "read own friendships" on public.friendships
  for select using (requester = auth.uid() or addressee = auth.uid());
-- All writes happen through the SECURITY DEFINER functions below.

-- ---------- Shared state (what friends can see) ----------
create table if not exists public.shared_state (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  mood         int check (mood between 1 and 5),
  streak       int default 0,
  last_checkin date,
  status_note  text,
  updated_at   timestamptz default now()
);

alter table public.shared_state enable row level security;

-- You can read your own state, and the state of anyone you're accepted friends
-- with. (This also lets Realtime stream friends' updates to the browser, since
-- Realtime only delivers rows a client is allowed to SELECT.)
drop policy if exists "read own state" on public.shared_state;
drop policy if exists "read own or friends state" on public.shared_state;
create policy "read own or friends state" on public.shared_state
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ( (f.requester = auth.uid() and f.addressee = shared_state.user_id)
           or (f.addressee = auth.uid() and f.requester = shared_state.user_id) )
    )
  );

drop policy if exists "upsert own state" on public.shared_state;
create policy "upsert own state" on public.shared_state
  for insert with check (user_id = auth.uid());

drop policy if exists "update own state" on public.shared_state;
create policy "update own state" on public.shared_state
  for update using (user_id = auth.uid());

-- ---------- Personal cloud sync (private to each user) ----------
-- Opt-in: when signed in, the app mirrors a few localStorage blobs here so a
-- user's own check-ins / journal / good things / letters follow them across
-- devices. Unlike shared_state, this is PRIVATE to the owner — no friend, and
-- no other user, can ever read it. Each row is one JSON blob keyed by name.
create table if not exists public.user_state (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);

alter table public.user_state enable row level security;

drop policy if exists "read own user_state" on public.user_state;
create policy "read own user_state" on public.user_state
  for select using (user_id = auth.uid());

drop policy if exists "insert own user_state" on public.user_state;
create policy "insert own user_state" on public.user_state
  for insert with check (user_id = auth.uid());

drop policy if exists "update own user_state" on public.user_state;
create policy "update own user_state" on public.user_state
  for update using (user_id = auth.uid());

drop policy if exists "delete own user_state" on public.user_state;
create policy "delete own user_state" on public.user_state
  for delete using (user_id = auth.uid());

-- ---------- Encouragements ----------
create table if not exists public.encouragements (
  id         uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users(id) on delete cascade,
  to_user    uuid not null references auth.users(id) on delete cascade,
  kind       text not null default 'support',
  created_at timestamptz default now(),
  read       boolean default false
);

alter table public.encouragements enable row level security;

drop policy if exists "read my encouragements" on public.encouragements;
create policy "read my encouragements" on public.encouragements
  for select using (to_user = auth.uid() or from_user = auth.uid());

drop policy if exists "mark my encouragements read" on public.encouragements;
create policy "mark my encouragements read" on public.encouragements
  for update using (to_user = auth.uid());

-- ---------- RPCs ----------
-- Look up a single user by exact username (no enumeration).
create or replace function public.find_user_by_username(uname text)
returns table(id uuid, username text, display_name text)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.display_name
  from public.profiles p
  where lower(p.username) = lower(trim(uname)) and p.id <> auth.uid()
  limit 1;
$$;

-- Send (or auto-accept a reciprocal) friend request by username.
create or replace function public.request_friend(uname text)
returns text language plpgsql security definer set search_path = public as $$
declare target uuid; existing record;
begin
  select id into target from public.profiles
    where lower(username) = lower(trim(uname)) and id <> auth.uid();
  if target is null then return 'not_found'; end if;

  select * into existing from public.friendships
    where (requester = auth.uid() and addressee = target)
       or (requester = target and addressee = auth.uid());

  if found then
    if existing.status = 'accepted' then return 'already_friends'; end if;
    if existing.status = 'pending' then
      if existing.addressee = auth.uid() then
        update public.friendships set status = 'accepted', updated_at = now() where id = existing.id;
        return 'accepted';
      end if;
      return 'pending';
    end if;
    -- previously declined: reopen as a fresh request from me
    update public.friendships
      set requester = auth.uid(), addressee = target, status = 'pending', updated_at = now()
      where id = existing.id;
    return 'requested';
  end if;

  insert into public.friendships(requester, addressee) values (auth.uid(), target);
  return 'requested';
end; $$;

-- Accept or decline an incoming request.
create or replace function public.respond_request(req_id uuid, accept boolean)
returns text language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.friendships where id = req_id;
  if not found then return 'not_found'; end if;
  if r.addressee <> auth.uid() then return 'forbidden'; end if;
  update public.friendships
    set status = case when accept then 'accepted' else 'declined' end, updated_at = now()
    where id = req_id;
  return case when accept then 'accepted' else 'declined' end;
end; $$;

create or replace function public.unfriend(other uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
  where (requester = auth.uid() and addressee = other)
     or (requester = other and addressee = auth.uid());
end; $$;

-- Accepted friends + their shared state.
create or replace function public.get_friends()
returns table(id uuid, username text, display_name text, mood int, streak int,
              last_checkin date, status_note text, updated_at timestamptz)
language sql security definer set search_path = public as $$
  select p.id, p.username, p.display_name, s.mood, s.streak, s.last_checkin, s.status_note, s.updated_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  left join public.shared_state s on s.user_id = p.id
  where f.status = 'accepted' and (f.requester = auth.uid() or f.addressee = auth.uid())
  order by p.display_name nulls last;
$$;

-- Pending requests (incoming + outgoing).
create or replace function public.get_pending()
returns table(id uuid, username text, display_name text, direction text, created_at timestamptz)
language sql security definer set search_path = public as $$
  select f.id, p.username, p.display_name,
         case when f.addressee = auth.uid() then 'incoming' else 'outgoing' end,
         f.created_at
  from public.friendships f
  join public.profiles p
    on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'pending' and (f.requester = auth.uid() or f.addressee = auth.uid());
$$;

create or replace function public.send_encouragement(target uuid, kind text default 'support')
returns text language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester = auth.uid() and addressee = target)
        or (requester = target and addressee = auth.uid()))
  ) then return 'not_friends'; end if;
  insert into public.encouragements(from_user, to_user, kind)
    values (auth.uid(), target, coalesce(kind, 'support'));
  return 'sent';
end; $$;

create or replace function public.get_encouragements()
returns table(id uuid, from_username text, from_display text, kind text,
              created_at timestamptz, read boolean)
language sql security definer set search_path = public as $$
  select e.id, p.username, p.display_name, e.kind, e.created_at, e.read
  from public.encouragements e
  join public.profiles p on p.id = e.from_user
  where e.to_user = auth.uid()
  order by e.created_at desc
  limit 30;
$$;

create or replace function public.mark_encouragements_read()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.encouragements set read = true where to_user = auth.uid() and read = false;
end; $$;

-- Let signed-in users call the RPCs (not anonymous visitors)
grant execute on function
  public.find_user_by_username(text),
  public.request_friend(text),
  public.respond_request(uuid, boolean),
  public.unfriend(uuid),
  public.get_friends(),
  public.get_pending(),
  public.send_encouragement(uuid, text),
  public.get_encouragements(),
  public.mark_encouragements_read()
to authenticated;

-- ---------- Realtime ----------
-- Stream changes to the browser so friends' moods, requests and encouragements
-- update live (no refresh button needed). RLS still applies to Realtime, so a
-- client only ever receives rows it is allowed to read.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'shared_state') then
    alter publication supabase_realtime add table public.shared_state;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'friendships') then
    alter publication supabase_realtime add table public.friendships;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'encouragements') then
    alter publication supabase_realtime add table public.encouragements;
  end if;
end $$;
