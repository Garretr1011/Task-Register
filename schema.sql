-- Run this once in Supabase: Dashboard > SQL Editor > New query > paste > Run

create table if not exists tasks (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  urgent boolean not null default false,
  important boolean not null default false,
  bucket text not null default 'inbox',
  category text not null default 'work',
  due text,
  task_date text,
  recur_days jsonb not null default '[]'::jsonb,
  completed_dates jsonb not null default '[]'::jsonb,
  roll_count integer not null default 0,
  sort_order bigint not null default 0,
  done boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table tasks enable row level security;

create policy "select own tasks" on tasks
  for select using (auth.uid() = user_id);

create policy "insert own tasks" on tasks
  for insert with check (auth.uid() = user_id);

create policy "update own tasks" on tasks
  for update using (auth.uid() = user_id);

create policy "delete own tasks" on tasks
  for delete using (auth.uid() = user_id);

create index if not exists tasks_user_id_idx on tasks(user_id);

create table if not exists categories (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label text not null,
  color text not null,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;

create policy "select own categories" on categories
  for select using (auth.uid() = user_id);

create policy "insert own categories" on categories
  for insert with check (auth.uid() = user_id);

create policy "update own categories" on categories
  for update using (auth.uid() = user_id);

create policy "delete own categories" on categories
  for delete using (auth.uid() = user_id);

create index if not exists categories_user_id_idx on categories(user_id);

create table if not exists leave_entries (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  staff_name text not null,
  start_date date not null,
  end_date date not null,
  created_at timestamptz not null default now()
);

alter table leave_entries enable row level security;

create policy "select own leave" on leave_entries
  for select using (auth.uid() = user_id);

create policy "insert own leave" on leave_entries
  for insert with check (auth.uid() = user_id);

create policy "update own leave" on leave_entries
  for update using (auth.uid() = user_id);

create policy "delete own leave" on leave_entries
  for delete using (auth.uid() = user_id);

create index if not exists leave_entries_user_id_idx on leave_entries(user_id);
