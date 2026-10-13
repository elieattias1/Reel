import type { OverheadCorrectionRow, OverheadVersionRow, SetRow, ShotRow } from "@/lib/supabase/types";
import {
  CameraSchema,
  SetSchema,
  ShotSizeSchema,
  type Actor,
  type Camera,
  type LinesCovered,
  type Set,
  type Shot,
} from "./schema";

/**
 * Maps between the DB's raw row shapes (jsonb columns, Postgres ranges)
 * and the Zod-validated app types in schema.ts. Every write tool and
 * every reader goes through these, so the DB's actual on-disk shape and
 * the app's in-memory shape can never drift apart silently.
 */

// ---------------------------------------------------------------------------
// Postgres int4range <-> LinesCovered
// ---------------------------------------------------------------------------

/**
 * int4range always canonicalizes to `[lower,upper)` (inclusive lower,
 * exclusive upper) regardless of how it's written — a Postgres guarantee
 * for discrete range types, not an assumption about what supabase-js
 * returns.
 */
export function parseIntRange(range: string | null | undefined): LinesCovered | null {
  if (!range) return null;
  const match = range.match(/^\[(-?\d+),(-?\d+)\)$/);
  if (!match) return null;
  const lower = parseInt(match[1], 10);
  const upper = parseInt(match[2], 10);
  return { start: lower, end: upper - 1 };
}

export function formatIntRange(range: LinesCovered): string {
  return `[${range.start},${range.end + 1})`;
}

// ---------------------------------------------------------------------------
// sets
// ---------------------------------------------------------------------------

export function rowToSet(row: SetRow): Set {
  const geometry = (row.geometry ?? {}) as Partial<Set>;
  return SetSchema.parse({
    id: row.id,
    name: row.name,
    units: "ft",
    bounds: { width: row.width_ft, height: row.depth_ft },
    walls: geometry.walls ?? [],
    doors: geometry.doors ?? [],
    windows: geometry.windows ?? [],
    setPieces: geometry.setPieces ?? [],
  });
}

export interface SetInsert {
  project_id: string;
  location_id: string | null;
  name: string;
  width_ft: number;
  depth_ft: number;
  geometry: { walls: Set["walls"]; doors: Set["doors"]; windows: Set["windows"]; setPieces: Set["setPieces"] };
}

export function setToInsertRow(projectId: string, locationId: string | null, set: Set): SetInsert {
  return {
    project_id: projectId,
    location_id: locationId,
    name: set.name,
    width_ft: set.bounds.width,
    depth_ft: set.bounds.height,
    geometry: { walls: set.walls, doors: set.doors, windows: set.windows, setPieces: set.setPieces },
  };
}

// ---------------------------------------------------------------------------
// shots
// ---------------------------------------------------------------------------

/**
 * `sceneLabel` is the scene's own display label (e.g. "12"), since the
 * shot's full label ("12C") combines it with `setup_letter` — the shots
 * table only stores the letter, scene number/label lives on `scenes`.
 */
export function rowToShot(row: ShotRow, sceneLabel: string): Shot {
  const camera = CameraSchema.parse(row.camera);
  const actors = (row.actors ?? []) as Actor[];
  const linesCovered = parseIntRange(row.covers_lines) ?? { start: 1, end: 1 };

  return {
    id: row.id,
    label: `${sceneLabel}${row.setup_letter}`,
    title: row.title,
    shotSize: ShotSizeSchema.parse(row.size),
    linesCovered,
    note: row.note,
    setup: camera,
    actors,
  };
}

export interface ShotInsert {
  project_id: string;
  scene_id: string;
  set_id: string;
  position: number;
  setup_letter: string;
  title: string;
  size: string;
  camera: Camera;
  actors: Actor[];
  covers_lines: string;
  note: string | null;
}

export function shotToInsertRow(
  projectId: string,
  sceneId: string,
  setId: string,
  position: number,
  setupLetter: string,
  shot: Omit<Shot, "id" | "label">
): ShotInsert {
  return {
    project_id: projectId,
    scene_id: sceneId,
    set_id: setId,
    position,
    setup_letter: setupLetter,
    title: shot.title,
    size: shot.shotSize,
    camera: shot.setup,
    actors: shot.actors,
    covers_lines: formatIntRange(shot.linesCovered),
    note: shot.note,
  };
}

// ---------------------------------------------------------------------------
// overhead_versions / overhead_corrections
// ---------------------------------------------------------------------------

export function rowToSnapshot(row: OverheadVersionRow) {
  return row.snapshot as { set: Set; shots: Shot[] };
}

export type { OverheadCorrectionRow, OverheadVersionRow };
