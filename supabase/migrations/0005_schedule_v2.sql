-- Stripboard, versioned scheduling, conflict/DOOD data model, and the
-- scene-crew-requirement + availability inputs the chat agent and the
-- conflict rail both need. Builds on 0001's schedule_days/schedule_scenes.
-- Never edit 0001-0004 — this is purely additive, per the established
-- migration convention.

-- ---------------------------------------------------------------------------
-- scenes: eighths (page-eighths), derived at breakdown time from
-- line_start/line_end. page_count (already a column since 0001, never
-- populated by any code path) is filled in alongside it rather than given
-- its own derivation.
-- ---------------------------------------------------------------------------

alter table scenes add column eighths int;

-- ---------------------------------------------------------------------------
-- locations: extend in place rather than introduce a second table — the
-- spec's "new locations table" is really new columns on the existing one.
-- ---------------------------------------------------------------------------

alter table locations add column address text;
alter table locations add column available_date_ranges jsonb not null default '[]'::jsonb;
alter table locations add column permit_status text
  check (permit_status in ('not_required', 'pending', 'approved', 'denied'));

-- ---------------------------------------------------------------------------
-- location_distances — company-move drive time between two locations.
-- Direct-policy table (own project_id), per 0002's established convention,
-- not an EXISTS-join table, since it references two locations rather than
-- one parent row.
-- ---------------------------------------------------------------------------

create table location_distances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  location_a_id uuid not null references locations (id) on delete cascade,
  location_b_id uuid not null references locations (id) on delete cascade,
  drive_minutes int not null check (drive_minutes >= 0),
  created_at timestamptz not null default now(),
  check (location_a_id <> location_b_id),
  unique (project_id, location_a_id, location_b_id)
);

create index location_distances_project_idx on location_distances (project_id);

-- ---------------------------------------------------------------------------
-- availability — unavailable date ranges for a confirmed cast or crew
-- member. One row per person; the check constraint makes person_type a
-- discriminated union over exactly one of cast_role_id/crew_role_id.
-- ---------------------------------------------------------------------------

create table availability (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  person_type text not null check (person_type in ('cast', 'crew')),
  cast_role_id uuid references cast_roles (id) on delete cascade,
  crew_role_id uuid references crew_roles (id) on delete cascade,
  unavailable_date_ranges jsonb not null default '[]'::jsonb,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (person_type = 'cast' and cast_role_id is not null and crew_role_id is null) or
    (person_type = 'crew' and crew_role_id is not null and cast_role_id is null)
  )
);

create unique index availability_cast_idx on availability (cast_role_id) where person_type = 'cast';
create unique index availability_crew_idx on availability (crew_role_id) where person_type = 'crew';

create trigger availability_updated_at before update on availability
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_versions — every schedule edit (manual or agent-proposed)
-- belongs to a version. A project's primary version is its highest
-- version_number; a chat "what if" fork creates a new version row rather
-- than mutating the primary one. Mirrors overhead_versions' exact
-- (parent_id, version_number) unique + descending index pattern.
-- ---------------------------------------------------------------------------

create table schedule_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  version_number int not null check (version_number > 0),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  note text,
  unique (project_id, version_number)
);

create index schedule_versions_project_idx on schedule_versions (project_id, version_number desc);

alter table schedule_versions enable row level security;
create policy "schedule_versions_rw" on schedule_versions for all using (is_project_member(project_id));

-- Backfill: every project that already has schedule_days gets a version 1
-- row, so existing schedules don't break once schedule_version_id is
-- required below.
insert into schedule_versions (project_id, version_number, note)
select distinct project_id, 1, 'backfilled from pre-versioning schedule'
from schedule_days
where project_id not in (select project_id from schedule_versions);

-- ---------------------------------------------------------------------------
-- schedule_days — extend in place with stripboard day-header fields and a
-- version reference.
-- ---------------------------------------------------------------------------

alter table schedule_days add column schedule_version_id uuid references schedule_versions (id) on delete cascade;
alter table schedule_days add column general_crew_call_time time;
alter table schedule_days add column general_crew_wrap_time time;
alter table schedule_days add column location_cluster text;
alter table schedule_days add column company_move boolean not null default false;
alter table schedule_days add column status text not null default 'draft'
  check (status in ('draft', 'locked', 'shot'));
alter table schedule_days add column estimated_total_eighths numeric;
alter table schedule_days add column updated_at timestamptz not null default now();

update schedule_days sd
set schedule_version_id = sv.id
from schedule_versions sv
where sv.project_id = sd.project_id and sv.version_number = 1 and sd.schedule_version_id is null;

alter table schedule_days alter column schedule_version_id set not null;

-- day_number was unique per project; now unique per (version, day_number),
-- since multiple versions can each have their own "Day 3".
alter table schedule_days drop constraint schedule_days_project_id_day_number_key;
alter table schedule_days add constraint schedule_days_version_day_number_key unique (schedule_version_id, day_number);

create trigger schedule_days_updated_at before update on schedule_days
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- schedule_scenes — extend in place with explicit ordering and locking.
-- `position` is left in place (nothing reads it after this migration, but
-- dropping a column from a shipped table is unnecessary risk for a field
-- nothing references going forward).
-- ---------------------------------------------------------------------------

alter table schedule_scenes add column order_in_day int;
alter table schedule_scenes add column estimated_duration_minutes int;
alter table schedule_scenes add column locked boolean not null default false;

update schedule_scenes set order_in_day = position where order_in_day is null;
alter table schedule_scenes alter column order_in_day set not null;

-- ---------------------------------------------------------------------------
-- scene_crew_requirements — derived at breakdown time from complexity_flags
-- (see lib/agents/persist-breakdown.ts), not hand-entered. Direct-policy
-- table despite the join-table-sounding name, since it has its own
-- project_id (per 0002's convention: own-project_id tables get a direct
-- policy, EXISTS-join is reserved for genuine pure join tables).
-- ---------------------------------------------------------------------------

create table scene_crew_requirements (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  scene_id uuid not null references scenes (id) on delete cascade,
  crew_role_type text not null,
  headcount int not null default 1 check (headcount > 0),
  reason text not null,
  created_at timestamptz not null default now()
);

create index scene_crew_requirements_scene_idx on scene_crew_requirements (scene_id);

-- ---------------------------------------------------------------------------
-- RLS — direct-policy pattern for every new table with its own project_id.
-- schedule_days_rw/schedule_scenes_rw already cover the extended columns
-- above; no change needed there.
-- ---------------------------------------------------------------------------

alter table location_distances enable row level security;
alter table availability enable row level security;
alter table scene_crew_requirements enable row level security;

create policy "location_distances_rw" on location_distances for all using (is_project_member(project_id));
create policy "availability_rw" on availability for all using (is_project_member(project_id));
create policy "scene_crew_requirements_rw" on scene_crew_requirements for all using (is_project_member(project_id));

-- No realtime publication changes in this migration: no concrete
-- live-multi-viewer streaming need exists yet for schedule/conflict/DOOD
-- data, matching 0003/0004's conservative precedent (realtime was only
-- added there for agent-turn-in-progress streaming of shots/sets).
