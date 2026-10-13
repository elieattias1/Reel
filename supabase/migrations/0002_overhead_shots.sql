-- Overhead Shots schema. Run after 0001_init.sql.
-- All new tables follow 0001's project-scoped RLS pattern: a denormalized
-- `project_id` column + an `is_project_member(project_id)` policy, rather
-- than the EXISTS-join pattern used for the handful of pure join tables in
-- 0001 (scene_characters etc.) — these aren't join tables.

-- ---------------------------------------------------------------------------
-- Scene script-line coverage
-- ---------------------------------------------------------------------------

-- The breakdown agent never recorded where a scene starts/ends in the raw
-- script text. Overhead Shots' coverage validator needs this to flag
-- uncovered lines, so it's added here and backfilled two ways: new uploads
-- get it from persistBreakdown (lib/agents/persist-breakdown.ts) at
-- insert time; existing scenes are backfilled once via
-- `npm run backfill:lines` (scripts/backfill-scene-lines.ts).
alter table scenes add column line_start int;
alter table scenes add column line_end int;

-- ---------------------------------------------------------------------------
-- Sets (location floor plans, in feet, shared across scenes at that location)
-- ---------------------------------------------------------------------------

create table sets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  location_id uuid references locations (id) on delete set null,
  name text not null,
  width_ft numeric not null check (width_ft > 0),
  depth_ft numeric not null check (depth_ft > 0),
  -- Walls, doors, windows, set pieces — validated app-side against
  -- lib/overheads/schema.ts's SetSchema (walls/doors/windows/setPieces).
  geometry jsonb not null default '{"walls":[],"doors":[],"windows":[],"setPieces":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Shots (setup + actor marks/paths + size + coverage + title/note), ordered
-- within a scene and lettered 12A, 12B, ...
-- ---------------------------------------------------------------------------

create table shots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  scene_id uuid not null references scenes (id) on delete cascade,
  set_id uuid not null references sets (id) on delete cascade,
  position int not null default 0,
  setup_letter text not null check (setup_letter ~ '^[A-Z]+$'),
  title text not null,
  -- lib/overheads/schema.ts's ShotSizeSchema is the closed vocabulary this
  -- validates against app-side; kept as text here, same as scenes.int_ext
  -- using a check constraint would, except the vocabulary is still open to
  -- producer feedback (see README "Design gaps").
  size text not null,
  -- The shot's Setup (camera): x, y, headingDeg, lensMm, height, support,
  -- focusDistanceFt, movementPath — validated against CameraSchema.
  camera jsonb not null,
  -- Array of { characterId, x, y, facingDeg, path? } — validated against
  -- ActorSchema.
  actors jsonb not null default '[]'::jsonb,
  -- Script line numbers this shot covers, inclusive both ends.
  covers_lines int4range,
  note text,
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scene_id, setup_letter)
);

create index shots_scene_position_idx on shots (scene_id, position);

-- ---------------------------------------------------------------------------
-- Overhead versions — full-scene snapshots for history/undo. The blocking
-- agent writes to the draft layer directly (no approval gate on these
-- writes themselves, per the brief); every write that changes a scene's
-- shots/set takes a new version here first.
-- ---------------------------------------------------------------------------

create table overhead_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  scene_id uuid not null references scenes (id) on delete cascade,
  version_number int not null check (version_number > 0),
  -- { set, shots } — validated against OverheadSnapshotSchema.
  snapshot jsonb not null,
  created_by text not null check (created_by in ('agent', 'human')),
  created_at timestamptz not null default now(),
  unique (scene_id, version_number)
);

create index overhead_versions_scene_idx on overhead_versions (scene_id, version_number desc);

-- ---------------------------------------------------------------------------
-- Overhead corrections — captures every hand edit's before/after per field,
-- per the brief's correction-capture requirement (distinct from version
-- history: this is field-level, for later analysis of where the agent's
-- drafts need the most correcting).
-- ---------------------------------------------------------------------------

create table overhead_corrections (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  shot_id uuid not null references shots (id) on delete cascade,
  field text not null,
  ai_value jsonb,
  human_value jsonb not null,
  created_at timestamptz not null default now()
);

create index overhead_corrections_shot_idx on overhead_corrections (shot_id);

-- ---------------------------------------------------------------------------
-- The blocking agent gets its own resumable session per project, separate
-- from the existing Reel chat agent's session.
-- ---------------------------------------------------------------------------

alter table chat_sessions add column kind text not null default 'chat' check (kind in ('chat', 'blocking'));
alter table chat_sessions drop constraint chat_sessions_project_id_key;
alter table chat_sessions add constraint chat_sessions_project_id_kind_key unique (project_id, kind);

-- ---------------------------------------------------------------------------
-- updated_at triggers (reuses set_updated_at() from 0001)
-- ---------------------------------------------------------------------------

create trigger sets_updated_at before update on sets
  for each row execute function set_updated_at();
create trigger shots_updated_at before update on shots
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table sets enable row level security;
alter table shots enable row level security;
alter table overhead_versions enable row level security;
alter table overhead_corrections enable row level security;

create policy "sets_rw" on sets for all using (is_project_member(project_id));
create policy "shots_rw" on shots for all using (is_project_member(project_id));
create policy "overhead_versions_rw" on overhead_versions for all using (is_project_member(project_id));
create policy "overhead_corrections_rw" on overhead_corrections for all using (is_project_member(project_id));
