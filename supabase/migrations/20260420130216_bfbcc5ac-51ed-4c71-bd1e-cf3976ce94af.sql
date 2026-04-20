-- Profiles table for Rubix Accounts
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null,
  display_name text,
  avatar_url text,
  steam_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_format check (username ~ '^[a-zA-Z0-9_]{3,20}$')
);

-- Case-insensitive unique username
create unique index profiles_username_lower_idx on public.profiles (lower(username));

-- Fast steam_id lookup (used by SteamFriendsPanel Rubix-badge feature)
create index profiles_steam_id_idx on public.profiles(steam_id) where steam_id is not null;

alter table public.profiles enable row level security;

-- Anyone can read profiles (needed for friend badge & username search; no sensitive columns)
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert own profile"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own profile"
  on public.profiles for delete
  to authenticated
  using (auth.uid() = user_id);

-- Generic updated_at trigger fn
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger update_profiles_updated_at
  before update on public.profiles
  for each row execute function public.update_updated_at_column();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_base text;
  v_attempt int := 0;
begin
  v_base := coalesce(
    nullif(regexp_replace(new.raw_user_meta_data->>'username', '[^a-zA-Z0-9_]', '', 'g'), ''),
    nullif(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '', 'g'), ''),
    'user'
  );
  v_base := substring(v_base, 1, 16);
  if length(v_base) < 3 then
    v_base := v_base || 'usr';
  end if;

  v_username := v_base;
  while exists (select 1 from public.profiles where lower(username) = lower(v_username)) loop
    v_attempt := v_attempt + 1;
    v_username := substring(v_base, 1, 16) || v_attempt::text;
    if v_attempt > 9999 then
      v_username := v_base || floor(random() * 100000)::text;
      exit;
    end if;
  end loop;

  insert into public.profiles (user_id, username, display_name, avatar_url)
  values (
    new.id,
    v_username,
    coalesce(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name', v_username),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();