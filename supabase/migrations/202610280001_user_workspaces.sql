-- FocusFlow cloud sync stores one versioned workspace per authenticated user.
-- Run only in the Supabase project's SQL editor or with its migration tooling.
create table if not exists public.user_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  workspace jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint user_workspaces_workspace_object check (jsonb_typeof(workspace) = 'object'),
  constraint user_workspaces_workspace_version check (workspace ->> 'version' = '2'),
  constraint user_workspaces_workspace_shape check (
    (
      jsonb_typeof(workspace -> 'profile') = 'object' and
      jsonb_typeof(workspace -> 'settings') = 'object' and
      jsonb_typeof(workspace -> 'goals') = 'object' and
      jsonb_typeof(workspace -> 'timer') = 'object' and
      jsonb_typeof(workspace -> 'ui') = 'object' and
      jsonb_typeof(workspace -> 'tasks') = 'array' and
      jsonb_typeof(workspace -> 'schedule') = 'array' and
      jsonb_typeof(workspace -> 'sessions') = 'array' and
      jsonb_typeof(workspace -> 'notes') = 'array' and
      jsonb_typeof(workspace -> 'revisions') = 'array' and
      jsonb_typeof(workspace -> 'subjects') = 'array' and
      jsonb_typeof(workspace -> 'exams') = 'array'
    ) is true
  ),
  constraint user_workspaces_record_limits check (
    case when jsonb_typeof(workspace -> 'tasks') = 'array' then jsonb_array_length(workspace -> 'tasks') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'schedule') = 'array' then jsonb_array_length(workspace -> 'schedule') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'sessions') = 'array' then jsonb_array_length(workspace -> 'sessions') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'notes') = 'array' then jsonb_array_length(workspace -> 'notes') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'revisions') = 'array' then jsonb_array_length(workspace -> 'revisions') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'subjects') = 'array' then jsonb_array_length(workspace -> 'subjects') <= 2000 else false end and
    case when jsonb_typeof(workspace -> 'exams') = 'array' then jsonb_array_length(workspace -> 'exams') <= 2000 else false end
  ),
  constraint user_workspaces_size_limit check (octet_length(workspace::text) <= 4194304)
);

create or replace function public.focusflow_set_workspace_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

drop trigger if exists focusflow_workspace_updated_at on public.user_workspaces;
create trigger focusflow_workspace_updated_at
before update on public.user_workspaces
for each row execute function public.focusflow_set_workspace_updated_at();

alter table public.user_workspaces enable row level security;
alter table public.user_workspaces force row level security;

revoke all on table public.user_workspaces from anon, authenticated;
grant select, insert, update, delete on table public.user_workspaces to authenticated;

drop policy if exists focusflow_workspace_select_own on public.user_workspaces;
create policy focusflow_workspace_select_own
on public.user_workspaces for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists focusflow_workspace_insert_own on public.user_workspaces;
create policy focusflow_workspace_insert_own
on public.user_workspaces for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists focusflow_workspace_update_own on public.user_workspaces;
create policy focusflow_workspace_update_own
on public.user_workspaces for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists focusflow_workspace_delete_own on public.user_workspaces;
create policy focusflow_workspace_delete_own
on public.user_workspaces for delete to authenticated
using ((select auth.uid()) = user_id);
