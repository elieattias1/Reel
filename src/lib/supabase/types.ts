// Hand-written types mirroring supabase/migrations/0001_init.sql.
// Regenerate with `supabase gen types typescript` once the project is linked
// to a real Supabase instance, and swap this file for the generated one.

export type Confidence = "confirmed" | "estimated" | "low_confidence";
export type SourceType = "web_search" | "rate_card" | "manual_override";
export type RoleSource = "ai_projected" | "confirmed";
export type RoleStatus = "offered" | "confirmed" | "declined";
export type PendingStatus = "pending" | "approved" | "rejected";

export interface Project {
  id: string;
  owner_id: string;
  name: string;
  logline: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScriptRow {
  id: string;
  project_id: string;
  filename: string;
  file_type: "pdf" | "fdx";
  storage_path: string;
  created_at: string;
}

export interface ScriptVersion {
  id: string;
  script_id: string;
  project_id: string;
  version_number: number;
  raw_text: string | null;
  breakdown_status: "pending" | "processing" | "complete" | "failed";
  breakdown_error: string | null;
  created_at: string;
}

export interface LocationRow {
  id: string;
  project_id: string;
  name: string;
}

export interface CharacterRow {
  id: string;
  project_id: string;
  name: string;
}

export interface PropRow {
  id: string;
  project_id: string;
  name: string;
}

export interface Scene {
  id: string;
  script_version_id: string;
  project_id: string;
  scene_number: number;
  int_ext: "INT" | "EXT" | "INT/EXT";
  day_night: "DAY" | "NIGHT" | "DAWN" | "DUSK" | "UNSPECIFIED";
  primary_location_id: string | null;
  synopsis: string | null;
  complexity_flags: string[];
  page_count: number | null;
  /** 1-indexed, inclusive. Null for scenes persisted before migration 0002 and not yet backfilled. */
  line_start: number | null;
  line_end: number | null;
  created_at: string;
}

export interface CastRole {
  id: string;
  project_id: string;
  role_name: string;
  character_id: string | null;
  source: RoleSource;
  person_name: string | null;
  contact: string | null;
  rate: number | null;
  status: RoleStatus;
  notes: string | null;
}

export interface CrewRole {
  id: string;
  project_id: string;
  role_type: string;
  headcount: number;
  source: RoleSource;
  person_name: string | null;
  contact: string | null;
  rate: number | null;
  status: RoleStatus;
  notes: string | null;
}

export interface BudgetLineRow {
  id: string;
  project_id: string;
  category: string;
  description: string;
  amount: number;
  source_type: SourceType;
  source_url: string | null;
  source_fetched_at: string | null;
  confidence: Confidence;
  original_amount: number | null;
  original_source_type: SourceType | null;
  created_at: string;
  updated_at: string;
}

export interface ScheduleDay {
  id: string;
  project_id: string;
  day_number: number;
  shoot_date: string | null;
}

export interface ScheduleSceneRow {
  schedule_day_id: string;
  scene_id: string;
  position: number;
}

export type ChatSessionKind = "chat" | "blocking";

export interface ChatSession {
  id: string;
  project_id: string;
  kind: ChatSessionKind;
  agent_session_id: string | null;
}

export interface PendingChange {
  id: string;
  project_id: string;
  chat_session_id: string | null;
  tool_name: string;
  title: string;
  description: string;
  proposed_input: Record<string, unknown>;
  status: PendingStatus;
  created_at: string;
}

export interface ChangeLogEntry {
  id: string;
  project_id: string;
  change_type: string;
  proposed_by: "agent" | "human";
  approved_by: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Overhead Shots. `geometry`/`camera`/`actors`/`snapshot` are typed `unknown`
// here (this file mirrors raw column shapes, not app-level validation) —
// parse them with the Zod schemas in lib/overheads/schema.ts before use.
// ---------------------------------------------------------------------------

export interface SetRow {
  id: string;
  project_id: string;
  location_id: string | null;
  name: string;
  width_ft: number;
  depth_ft: number;
  geometry: unknown;
  created_at: string;
  updated_at: string;
}

export interface ShotRow {
  id: string;
  project_id: string;
  scene_id: string;
  set_id: string;
  position: number;
  setup_letter: string;
  title: string;
  size: string;
  camera: unknown;
  actors: unknown;
  /** Postgres int4range as returned by supabase-js, e.g. "[10,15]". */
  covers_lines: string | null;
  note: string | null;
  status: "draft" | "final";
  created_at: string;
  updated_at: string;
}

export interface OverheadVersionRow {
  id: string;
  project_id: string;
  scene_id: string;
  version_number: number;
  snapshot: unknown;
  created_by: "agent" | "human";
  created_at: string;
}

export interface OverheadCorrectionRow {
  id: string;
  project_id: string;
  shot_id: string;
  field: string;
  ai_value: unknown;
  human_value: unknown;
  created_at: string;
}
