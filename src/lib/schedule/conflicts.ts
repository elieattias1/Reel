import type { SupabaseClient } from "@supabase/supabase-js";
import type { DateRange, RoleStatus, ScheduleConflict } from "@/lib/supabase/types";

// v1 heuristics — not pulled from a real union rulebook. Documented here
// rather than hidden in the check bodies.
const MIN_TURNAROUND_HOURS = 10;
const MINOR_MAX_HOURS = 8;

export interface ConflictSceneInfo {
  id: string;
  scene_number: number;
  complexity_flags: string[];
  primary_location_id: string | null;
}

export interface ConflictDayInfo {
  id: string;
  day_number: number;
  shoot_date: string | null;
  general_crew_call_time: string | null;
  general_crew_wrap_time: string | null;
  /** Scene ids scheduled this day, in order_in_day order. */
  sceneIds: string[];
}

export interface ConflictCastInfo {
  id: string;
  person_name: string | null;
  status: RoleStatus;
}

export interface ConflictCrewInfo {
  id: string;
  role_type: string;
  status: RoleStatus;
}

export interface ConflictCrewRequirement {
  crew_role_type: string;
  headcount: number;
}

export interface ConflictLocationInfo {
  available_date_ranges: DateRange[];
}

/**
 * Everything the five conflict checks need, loaded once. Kept separate from
 * `runConflictChecks` so `preview_impact` (lib/agents/chat-tools/read.ts)
 * can load this once, clone+mutate it for a hypothetical, and re-run checks
 * without a second round trip to Postgres — and so unit tests can construct
 * a context by hand without touching Supabase at all.
 */
export interface ConflictContext {
  projectId: string;
  scheduleVersionId: string | null;
  days: ConflictDayInfo[];
  scenesById: Map<string, ConflictSceneInfo>;
  /** scene_id -> confirmed-or-not cast_role_id[] required by that scene's characters. */
  castByScene: Map<string, string[]>;
  castRolesById: Map<string, ConflictCastInfo>;
  crewRolesById: Map<string, ConflictCrewInfo>;
  crewRequirementsByScene: Map<string, ConflictCrewRequirement[]>;
  availabilityByCastRoleId: Map<string, DateRange[]>;
  locationsById: Map<string, ConflictLocationInfo>;
}

export function dateInRanges(date: string, ranges: DateRange[]): boolean {
  const d = new Date(date).getTime();
  return ranges.some((r) => d >= new Date(r.start).getTime() && d < new Date(r.end).getTime());
}

/** Deterministic, stable across recomputation — used as the UI's React/dedupe key. */
function hashConflictId(type: string, ...parts: (string | undefined)[]): string {
  const input = [type, ...parts.filter(Boolean)].join("|");
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) | 0;
  return `${type}_${(hash >>> 0).toString(16)}`;
}

function checkDoubleBookings(ctx: ConflictContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const daysByShootDate = new Map<string, ConflictDayInfo[]>();

  for (const day of ctx.days) {
    if (!day.shoot_date) continue;

    for (const sceneId of day.sceneIds) {
      for (const castRoleId of ctx.castByScene.get(sceneId) ?? []) {
        const cast = ctx.castRolesById.get(castRoleId);
        if (!cast || cast.status !== "confirmed") continue;
        const ranges = ctx.availabilityByCastRoleId.get(castRoleId);
        if (ranges && dateInRanges(day.shoot_date, ranges)) {
          conflicts.push({
            id: hashConflictId("double_booking", castRoleId, day.id),
            type: "double_booking",
            severity: "error",
            message: `${cast.person_name ?? "This cast member"} is scheduled on Day ${day.day_number} (${day.shoot_date}) but is marked unavailable that date.`,
            schedule_day_id: day.id,
            scene_id: sceneId,
            cast_role_id: castRoleId,
          });
        }
      }
    }

    const list = daysByShootDate.get(day.shoot_date) ?? [];
    list.push(day);
    daysByShootDate.set(day.shoot_date, list);
  }

  // Same confirmed cast member required on two different day rows that
  // happen to share a shoot date (duplicate/overlapping day entries).
  for (const days of daysByShootDate.values()) {
    if (days.length < 2) continue;
    const castToDayIds = new Map<string, Set<string>>();
    for (const day of days) {
      for (const sceneId of day.sceneIds) {
        for (const castRoleId of ctx.castByScene.get(sceneId) ?? []) {
          const set = castToDayIds.get(castRoleId) ?? new Set<string>();
          set.add(day.id);
          castToDayIds.set(castRoleId, set);
        }
      }
    }
    for (const [castRoleId, dayIds] of castToDayIds) {
      if (dayIds.size < 2) continue;
      const cast = ctx.castRolesById.get(castRoleId);
      if (!cast || cast.status !== "confirmed") continue;
      const sortedDayIds = Array.from(dayIds).sort();
      conflicts.push({
        id: hashConflictId("double_booking", castRoleId, ...sortedDayIds),
        type: "double_booking",
        severity: "error",
        message: `${cast.person_name ?? "This cast member"} is required on ${sortedDayIds.length} different shoot days scheduled for the same date.`,
        cast_role_id: castRoleId,
      });
    }
  }

  return conflicts;
}

function checkTurnaroundViolations(ctx: ConflictContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const daysByCast = new Map<string, ConflictDayInfo[]>();

  for (const day of ctx.days) {
    if (!day.shoot_date) continue;
    for (const sceneId of day.sceneIds) {
      for (const castRoleId of ctx.castByScene.get(sceneId) ?? []) {
        const cast = ctx.castRolesById.get(castRoleId);
        if (!cast || cast.status !== "confirmed") continue;
        const list = daysByCast.get(castRoleId) ?? [];
        if (!list.some((d) => d.id === day.id)) list.push(day);
        daysByCast.set(castRoleId, list);
      }
    }
  }

  for (const [castRoleId, days] of daysByCast) {
    const sorted = [...days].sort((a, b) => (a.shoot_date! < b.shoot_date! ? -1 : a.shoot_date! > b.shoot_date! ? 1 : 0));
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const next = sorted[i];
      if (!prev.general_crew_wrap_time || !next.general_crew_call_time) continue;

      const wrap = new Date(`${prev.shoot_date}T${prev.general_crew_wrap_time}`);
      const call = new Date(`${next.shoot_date}T${next.general_crew_call_time}`);
      const hours = (call.getTime() - wrap.getTime()) / 3_600_000;
      if (hours < MIN_TURNAROUND_HOURS) {
        const cast = ctx.castRolesById.get(castRoleId);
        conflicts.push({
          id: hashConflictId("turnaround_violation", castRoleId, prev.id, next.id),
          type: "turnaround_violation",
          severity: "warning",
          message: `${cast?.person_name ?? "This cast member"} has only ${hours.toFixed(1)}h between Day ${prev.day_number} wrap and Day ${next.day_number} call — under the ${MIN_TURNAROUND_HOURS}h minimum.`,
          schedule_day_id: next.id,
          cast_role_id: castRoleId,
        });
      }
    }
  }

  return conflicts;
}

function checkLocationAvailability(ctx: ConflictContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const day of ctx.days) {
    if (!day.shoot_date) continue;
    const locationIds = new Set<string>();
    for (const sceneId of day.sceneIds) {
      const locationId = ctx.scenesById.get(sceneId)?.primary_location_id;
      if (locationId) locationIds.add(locationId);
    }
    for (const locationId of locationIds) {
      const location = ctx.locationsById.get(locationId);
      if (!location || location.available_date_ranges.length === 0) continue;
      if (!dateInRanges(day.shoot_date, location.available_date_ranges)) {
        conflicts.push({
          id: hashConflictId("location_unavailable", locationId, day.id),
          type: "location_unavailable",
          severity: "error",
          message: `Day ${day.day_number} (${day.shoot_date}) is scheduled at a location outside its available date range.`,
          schedule_day_id: day.id,
          location_id: locationId,
        });
      }
    }
  }

  return conflicts;
}

function checkMissingRequiredCrew(ctx: ConflictContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];
  const confirmedCountByType = new Map<string, number>();
  for (const crew of ctx.crewRolesById.values()) {
    if (crew.status === "confirmed") {
      confirmedCountByType.set(crew.role_type, (confirmedCountByType.get(crew.role_type) ?? 0) + 1);
    }
  }

  for (const day of ctx.days) {
    for (const sceneId of day.sceneIds) {
      const requirements = ctx.crewRequirementsByScene.get(sceneId) ?? [];
      const scene = ctx.scenesById.get(sceneId);
      for (const req of requirements) {
        const confirmed = confirmedCountByType.get(req.crew_role_type) ?? 0;
        if (confirmed < req.headcount) {
          conflicts.push({
            id: hashConflictId("missing_required_crew", sceneId, req.crew_role_type),
            type: "missing_required_crew",
            severity: "error",
            message: `Scene ${scene?.scene_number ?? sceneId} needs ${req.headcount}× ${req.crew_role_type.replace(/_/g, " ")} but only ${confirmed} confirmed.`,
            schedule_day_id: day.id,
            scene_id: sceneId,
          });
        }
      }
    }
  }

  return conflicts;
}

function checkMinorHoursExceeded(ctx: ConflictContext): ScheduleConflict[] {
  const conflicts: ScheduleConflict[] = [];

  for (const day of ctx.days) {
    if (!day.general_crew_call_time || !day.general_crew_wrap_time) continue;
    const hasMinorsScene = day.sceneIds.some((id) => ctx.scenesById.get(id)?.complexity_flags.includes("minors"));
    if (!hasMinorsScene) continue;

    const call = new Date(`2000-01-01T${day.general_crew_call_time}`);
    let wrap = new Date(`2000-01-01T${day.general_crew_wrap_time}`);
    if (wrap <= call) wrap = new Date(wrap.getTime() + 24 * 3_600_000); // wrap past midnight
    const hours = (wrap.getTime() - call.getTime()) / 3_600_000;

    if (hours > MINOR_MAX_HOURS) {
      conflicts.push({
        id: hashConflictId("minor_hours_exceeded", day.id),
        type: "minor_hours_exceeded",
        severity: "warning",
        message: `Day ${day.day_number} runs ${hours.toFixed(1)}h with a minors-flagged scene scheduled — over the ${MINOR_MAX_HOURS}h v1 limit.`,
        schedule_day_id: day.id,
      });
    }
  }

  return conflicts;
}

/**
 * Pure: runs all five checks against an already-loaded context and
 * concatenates the results. No Postgres access — this is what makes it
 * reusable for a non-committing `preview_impact` simulation and directly
 * unit-testable.
 */
export function runConflictChecks(ctx: ConflictContext, opts: { dayId?: string } = {}): ScheduleConflict[] {
  const conflicts = [
    ...checkDoubleBookings(ctx),
    ...checkTurnaroundViolations(ctx),
    ...checkLocationAvailability(ctx),
    ...checkMissingRequiredCrew(ctx),
    ...checkMinorHoursExceeded(ctx),
  ];
  return opts.dayId ? conflicts.filter((c) => c.schedule_day_id === opts.dayId) : conflicts;
}

/** Deep-clones a context so a simulation can mutate it without touching the live data. */
export function cloneConflictContext(ctx: ConflictContext): ConflictContext {
  return {
    projectId: ctx.projectId,
    scheduleVersionId: ctx.scheduleVersionId,
    days: ctx.days.map((d) => ({ ...d, sceneIds: [...d.sceneIds] })),
    scenesById: new Map(ctx.scenesById),
    castByScene: new Map(Array.from(ctx.castByScene, ([k, v]) => [k, [...v]])),
    castRolesById: new Map(ctx.castRolesById),
    crewRolesById: new Map(ctx.crewRolesById),
    crewRequirementsByScene: new Map(ctx.crewRequirementsByScene),
    availabilityByCastRoleId: new Map(ctx.availabilityByCastRoleId),
    locationsById: new Map(ctx.locationsById),
  };
}

/** Shared with lib/schedule/dood.ts — both resolve "no version given" to the project's latest. */
export async function resolveVersionId(
  supabase: SupabaseClient,
  projectId: string,
  scheduleVersionId?: string
): Promise<string | null> {
  if (scheduleVersionId) return scheduleVersionId;
  const { data } = await supabase
    .from("schedule_versions")
    .select("id")
    .eq("project_id", projectId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Loads everything `runConflictChecks` needs for one project/version in a
 * small batch of Supabase reads. The only Postgres-touching half of
 * conflict detection — kept separate so it can be called once and reused
 * (see `checkConflicts` below, and `preview_impact`'s simulation).
 */
export async function loadConflictContext(
  supabase: SupabaseClient,
  projectId: string,
  opts: { scheduleVersionId?: string } = {}
): Promise<ConflictContext> {
  const scheduleVersionId = await resolveVersionId(supabase, projectId, opts.scheduleVersionId);

  if (!scheduleVersionId) {
    return {
      projectId,
      scheduleVersionId: null,
      days: [],
      scenesById: new Map(),
      castByScene: new Map(),
      castRolesById: new Map(),
      crewRolesById: new Map(),
      crewRequirementsByScene: new Map(),
      availabilityByCastRoleId: new Map(),
      locationsById: new Map(),
    };
  }

  const { data: dayRows } = await supabase
    .from("schedule_days")
    .select("id, day_number, shoot_date, general_crew_call_time, general_crew_wrap_time")
    .eq("schedule_version_id", scheduleVersionId)
    .order("day_number");
  const days = dayRows ?? [];
  const dayIds = days.map((d) => d.id);

  const { data: scheduleScenes } = dayIds.length
    ? await supabase
        .from("schedule_scenes")
        .select(
          "schedule_day_id, scene_id, order_in_day, scenes(id, scene_number, complexity_flags, primary_location_id)"
        )
        .in("schedule_day_id", dayIds)
        .order("order_in_day")
    : { data: [] };

  const scenesById = new Map<string, ConflictSceneInfo>();
  const sceneIdsByDay = new Map<string, string[]>();
  for (const row of scheduleScenes ?? []) {
    const scene = row.scenes as unknown as {
      id: string;
      scene_number: number;
      complexity_flags: string[];
      primary_location_id: string | null;
    } | null;
    if (!scene) continue;
    scenesById.set(scene.id, {
      id: scene.id,
      scene_number: scene.scene_number,
      complexity_flags: scene.complexity_flags ?? [],
      primary_location_id: scene.primary_location_id,
    });
    const list = sceneIdsByDay.get(row.schedule_day_id) ?? [];
    list.push(scene.id);
    sceneIdsByDay.set(row.schedule_day_id, list);
  }

  const sceneIds = Array.from(scenesById.keys());

  const { data: sceneCharacters } = sceneIds.length
    ? await supabase.from("scene_characters").select("scene_id, character_id").in("scene_id", sceneIds)
    : { data: [] };

  const characterIds = Array.from(new Set((sceneCharacters ?? []).map((sc) => sc.character_id)));
  const { data: castRoleRows } = characterIds.length
    ? await supabase.from("cast_roles").select("id, character_id, person_name, status").in("character_id", characterIds)
    : { data: [] };

  const castRolesByCharacterId = new Map<string, string[]>();
  const castRolesById = new Map<string, ConflictCastInfo>();
  for (const role of castRoleRows ?? []) {
    castRolesById.set(role.id, { id: role.id, person_name: role.person_name, status: role.status });
    if (role.character_id) {
      const list = castRolesByCharacterId.get(role.character_id) ?? [];
      list.push(role.id);
      castRolesByCharacterId.set(role.character_id, list);
    }
  }

  const castByScene = new Map<string, string[]>();
  for (const sc of sceneCharacters ?? []) {
    const roleIds = castRolesByCharacterId.get(sc.character_id) ?? [];
    if (roleIds.length === 0) continue;
    const list = castByScene.get(sc.scene_id) ?? [];
    list.push(...roleIds);
    castByScene.set(sc.scene_id, list);
  }

  const { data: crewRequirementRows } = sceneIds.length
    ? await supabase.from("scene_crew_requirements").select("scene_id, crew_role_type, headcount").in("scene_id", sceneIds)
    : { data: [] };

  const crewRequirementsByScene = new Map<string, ConflictCrewRequirement[]>();
  for (const req of crewRequirementRows ?? []) {
    const list = crewRequirementsByScene.get(req.scene_id) ?? [];
    list.push({ crew_role_type: req.crew_role_type, headcount: req.headcount });
    crewRequirementsByScene.set(req.scene_id, list);
  }

  const { data: crewRoleRows } = await supabase.from("crew_roles").select("id, role_type, status").eq("project_id", projectId);
  const crewRolesById = new Map<string, ConflictCrewInfo>();
  for (const crew of crewRoleRows ?? []) {
    crewRolesById.set(crew.id, { id: crew.id, role_type: crew.role_type, status: crew.status });
  }

  const castRoleIds = Array.from(castRolesById.keys());
  const { data: availabilityRows } = castRoleIds.length
    ? await supabase
        .from("availability")
        .select("cast_role_id, unavailable_date_ranges")
        .eq("project_id", projectId)
        .eq("person_type", "cast")
        .in("cast_role_id", castRoleIds)
    : { data: [] };

  const availabilityByCastRoleId = new Map<string, DateRange[]>();
  for (const row of availabilityRows ?? []) {
    if (row.cast_role_id) availabilityByCastRoleId.set(row.cast_role_id, row.unavailable_date_ranges ?? []);
  }

  const locationIds = Array.from(new Set(Array.from(scenesById.values()).map((s) => s.primary_location_id).filter(Boolean) as string[]));
  const { data: locationRows } = locationIds.length
    ? await supabase.from("locations").select("id, available_date_ranges").in("id", locationIds)
    : { data: [] };

  const locationsById = new Map<string, ConflictLocationInfo>();
  for (const loc of locationRows ?? []) {
    locationsById.set(loc.id, { available_date_ranges: loc.available_date_ranges ?? [] });
  }

  return {
    projectId,
    scheduleVersionId,
    days: days.map((d) => ({ ...d, sceneIds: sceneIdsByDay.get(d.id) ?? [] })),
    scenesById,
    castByScene,
    castRolesById,
    crewRolesById,
    crewRequirementsByScene,
    availabilityByCastRoleId,
    locationsById,
  };
}

/**
 * The single entry point for both the conflicts API route and the
 * `check_conflicts`/`get_day` agent tools — no duplicated logic between UI
 * and agent. "Generate on read," per the spec: no DB cache table.
 */
export async function checkConflicts(
  supabase: SupabaseClient,
  projectId: string,
  opts: { scheduleVersionId?: string; dayId?: string } = {}
): Promise<ScheduleConflict[]> {
  const ctx = await loadConflictContext(supabase, projectId, { scheduleVersionId: opts.scheduleVersionId });
  return runConflictChecks(ctx, { dayId: opts.dayId });
}
