-- Reel MVP schema
-- Run via the Supabase SQL editor or `supabase db push`.
-- Auth/users are Supabase's built-in `auth.users`; we don't model our own users table.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Projects + collaborators
-- ---------------------------------------------------------------------------

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  logline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table project_collaborators (
  project_id uuid not null references projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'collaborator' check (role in ('collaborator', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create or replace function is_project_member(p_project_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from projects
    where id = p_project_id and owner_id = auth.uid()
  ) or exists (
    select 1 from project_collaborators
    where project_id = p_project_id and user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Scripts + extracted breakdown entities
-- ---------------------------------------------------------------------------

create table scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  filename text not null,
  file_type text not null check (file_type in ('pdf', 'fdx')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table script_versions (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references scripts (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  version_number int not null default 1,
  raw_text text,
  breakdown_status text not null default 'pending'
    check (breakdown_status in ('pending', 'processing', 'complete', 'failed')),
  breakdown_error text,
  created_at timestamptz not null default now()
);

create table locations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table characters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table props (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table scenes (
  id uuid primary key default gen_random_uuid(),
  script_version_id uuid not null references script_versions (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  scene_number int not null,
  int_ext text not null check (int_ext in ('INT', 'EXT', 'INT/EXT')),
  day_night text not null check (day_night in ('DAY', 'NIGHT', 'DAWN', 'DUSK', 'UNSPECIFIED')),
  primary_location_id uuid references locations (id) on delete set null,
  synopsis text,
  complexity_flags jsonb not null default '[]'::jsonb,
  page_count numeric,
  created_at timestamptz not null default now()
);

create table scene_characters (
  scene_id uuid not null references scenes (id) on delete cascade,
  character_id uuid not null references characters (id) on delete cascade,
  primary key (scene_id, character_id)
);

create table scene_props (
  scene_id uuid not null references scenes (id) on delete cascade,
  prop_id uuid not null references props (id) on delete cascade,
  primary key (scene_id, prop_id)
);

create table scene_locations (
  scene_id uuid not null references scenes (id) on delete cascade,
  location_id uuid not null references locations (id) on delete cascade,
  primary key (scene_id, location_id)
);

-- ---------------------------------------------------------------------------
-- Cast + crew (AI-projected vs. confirmed)
-- ---------------------------------------------------------------------------

create table cast_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  role_name text not null,
  character_id uuid references characters (id) on delete set null,
  source text not null default 'ai_projected' check (source in ('ai_projected', 'confirmed')),
  person_name text,
  contact text,
  rate numeric,
  status text not null default 'offered' check (status in ('offered', 'confirmed', 'declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crew_roles (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  role_type text not null,
  headcount int not null default 1,
  source text not null default 'ai_projected' check (source in ('ai_projected', 'confirmed')),
  person_name text,
  contact text,
  rate numeric,
  status text not null default 'offered' check (status in ('offered', 'confirmed', 'declined')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Budget
-- ---------------------------------------------------------------------------

create table budget_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  category text not null,
  description text not null,
  amount numeric not null,
  source_type text not null check (source_type in ('web_search', 'rate_card', 'manual_override')),
  source_url text,
  source_fetched_at timestamptz,
  confidence text not null check (confidence in ('confirmed', 'estimated', 'low_confidence')),
  original_amount numeric,
  original_source_type text,
  corrected_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Schedule (suggested order, not constraint-solved)
-- ---------------------------------------------------------------------------

create table schedule_days (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  day_number int not null,
  shoot_date date,
  created_at timestamptz not null default now(),
  unique (project_id, day_number)
);

create table schedule_scenes (
  schedule_day_id uuid not null references schedule_days (id) on delete cascade,
  scene_id uuid not null references scenes (id) on delete cascade,
  position int not null default 0,
  primary key (schedule_day_id, scene_id)
);

-- ---------------------------------------------------------------------------
-- Reel chat agent: sessions, pending approvals, change log
-- ---------------------------------------------------------------------------

create table chat_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references projects (id) on delete cascade,
  agent_session_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Every write the Reel chat agent wants to make lands here first via
-- canUseTool, which denies the tool call immediately (so the agent turn
-- completes instead of blocking the HTTP request indefinitely) and renders
-- as a Reel ApprovalCard. Approve/Reject are handled by the application,
-- which performs the actual Postgres write only on approval.
create table pending_changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  chat_session_id uuid references chat_sessions (id) on delete set null,
  tool_name text not null,
  title text not null,
  description text not null,
  proposed_input jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id)
);

create table change_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  change_type text not null,
  proposed_by text not null default 'agent' check (proposed_by in ('agent', 'human')),
  approved_by uuid references auth.users (id),
  payload jsonb not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger projects_updated_at before update on projects
  for each row execute function set_updated_at();
create trigger cast_roles_updated_at before update on cast_roles
  for each row execute function set_updated_at();
create trigger crew_roles_updated_at before update on crew_roles
  for each row execute function set_updated_at();
create trigger budget_lines_updated_at before update on budget_lines
  for each row execute function set_updated_at();
create trigger chat_sessions_updated_at before update on chat_sessions
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — every table scoped to project ownership/collaboration
-- ---------------------------------------------------------------------------

alter table projects enable row level security;
alter table project_collaborators enable row level security;
alter table scripts enable row level security;
alter table script_versions enable row level security;
alter table locations enable row level security;
alter table characters enable row level security;
alter table props enable row level security;
alter table scenes enable row level security;
alter table scene_characters enable row level security;
alter table scene_props enable row level security;
alter table scene_locations enable row level security;
alter table cast_roles enable row level security;
alter table crew_roles enable row level security;
alter table budget_lines enable row level security;
alter table schedule_days enable row level security;
alter table schedule_scenes enable row level security;
alter table chat_sessions enable row level security;
alter table pending_changes enable row level security;
alter table change_log enable row level security;

create policy "projects_select" on projects for select using (is_project_member(id));
create policy "projects_insert" on projects for insert with check (owner_id = auth.uid());
create policy "projects_update" on projects for update using (is_project_member(id));
create policy "projects_delete" on projects for delete using (owner_id = auth.uid());

create policy "collaborators_select" on project_collaborators for select using (is_project_member(project_id));
create policy "collaborators_manage" on project_collaborators for all using (
  exists (select 1 from projects where id = project_id and owner_id = auth.uid())
);

-- Generic pattern for every project-scoped table below: members can read and
-- write, only project membership (owner or collaborator) is required for MVP.
create policy "scripts_rw" on scripts for all using (is_project_member(project_id));
create policy "script_versions_rw" on script_versions for all using (is_project_member(project_id));
create policy "locations_rw" on locations for all using (is_project_member(project_id));
create policy "characters_rw" on characters for all using (is_project_member(project_id));
create policy "props_rw" on props for all using (is_project_member(project_id));
create policy "scenes_rw" on scenes for all using (is_project_member(project_id));
create policy "cast_roles_rw" on cast_roles for all using (is_project_member(project_id));
create policy "crew_roles_rw" on crew_roles for all using (is_project_member(project_id));
create policy "budget_lines_rw" on budget_lines for all using (is_project_member(project_id));
create policy "schedule_days_rw" on schedule_days for all using (is_project_member(project_id));
create policy "chat_sessions_rw" on chat_sessions for all using (is_project_member(project_id));
create policy "pending_changes_rw" on pending_changes for all using (is_project_member(project_id));
create policy "change_log_rw" on change_log for all using (is_project_member(project_id));

create policy "scene_characters_rw" on scene_characters for all using (
  exists (select 1 from scenes where scenes.id = scene_id and is_project_member(scenes.project_id))
);
create policy "scene_props_rw" on scene_props for all using (
  exists (select 1 from scenes where scenes.id = scene_id and is_project_member(scenes.project_id))
);
create policy "scene_locations_rw" on scene_locations for all using (
  exists (select 1 from scenes where scenes.id = scene_id and is_project_member(scenes.project_id))
);
create policy "schedule_scenes_rw" on schedule_scenes for all using (
  exists (select 1 from schedule_days where schedule_days.id = schedule_day_id and is_project_member(schedule_days.project_id))
);

-- ---------------------------------------------------------------------------
-- Storage: a private bucket for uploaded scripts (confidentiality requirement)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('scripts', 'scripts', false)
on conflict (id) do nothing;

create policy "scripts_bucket_rw" on storage.objects for all using (
  bucket_id = 'scripts' and (storage.foldername(name))[1] in (
    select id::text from projects where is_project_member(id)
  )
);

-- ---------------------------------------------------------------------------
-- Budgeting agent price cache — cost control: the same pricing query within
-- a time window reuses the cached WebSearch result instead of re-searching.
-- Written only by server-side agent code via the service-role client, which
-- bypasses RLS; no policies are defined, so it is unreachable from anon/
-- authenticated clients.
-- ---------------------------------------------------------------------------

create table price_cache (
  query_key text primary key,
  amount numeric not null,
  source_type text not null check (source_type in ('web_search', 'rate_card')),
  source_url text,
  confidence text not null check (confidence in ('confirmed', 'estimated', 'low_confidence')),
  fetched_at timestamptz not null default now()
);

alter table price_cache enable row level security;

-- ---------------------------------------------------------------------------
-- Chat transcript for display. The Claude Agent SDK's own session (resumed
-- via chat_sessions.agent_session_id) is the agent's working memory; this
-- table is purely so the UI can re-render history on page load without
-- querying the SDK's local session store.
-- ---------------------------------------------------------------------------

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  pending_change_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table chat_messages enable row level security;
create policy "chat_messages_rw" on chat_messages for all using (is_project_member(project_id));
