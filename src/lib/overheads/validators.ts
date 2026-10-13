import {
  conePolygon,
  distanceToSegment,
  DEFAULT_MINUTES_PER_SETUP,
  pointInPolygon,
  pointInRect,
  sideOfLine,
} from "./geometry";
import type { Actor, Camera, Point2D, Set, Shot } from "./schema";

export type ValidationSeverity = "info" | "warning" | "error";

/**
 * Shape matches components.md's ValidationMarker props ({x, y, severity,
 * message}) plus a machine-readable `code` and the id of whatever this
 * concerns, so the renderer can place a marker and the validation-list
 * panel can group/filter without re-deriving either.
 */
export interface ValidationIssue {
  severity: ValidationSeverity;
  code:
    | "axis_crossing"
    | "cone_overlap"
    | "out_of_bounds"
    | "wall_collision"
    | "set_piece_collision"
    | "uncovered_lines";
  message: string;
  subjectId?: string;
  x?: number;
  y?: number;
}

// ---------------------------------------------------------------------------
// 180° line check
// ---------------------------------------------------------------------------

export interface AxisLine {
  through: [Point2D, Point2D];
}

/**
 * The axis of action, drawn through two actors' eyeline (components.md's
 * AxisLine). Null if there aren't at least two actors to draw it through.
 */
export function axisFromActors(actors: Pick<Actor, "x" | "y">[]): AxisLine | null {
  if (actors.length < 2) return null;
  return { through: [actors[0], actors[1]] };
}

/**
 * Flags any setup on the opposite side of the 180° line from the scene's
 * established side — the side the first setup (by shot order) was on.
 * Setups exactly on the line (sideOfLine === 0) are never flagged.
 */
export function checkAxisCrossings(
  axis: AxisLine,
  setupsInOrder: Pick<Camera, "id" | "x" | "y">[]
): ValidationIssue[] {
  if (setupsInOrder.length === 0) return [];

  const [a, b] = axis.through;
  const establishedSide = sideOfLine(setupsInOrder[0], a, b);
  if (establishedSide === 0) return [];

  const issues: ValidationIssue[] = [];
  for (const setup of setupsInOrder.slice(1)) {
    const side = sideOfLine(setup, a, b);
    if (side !== 0 && side !== establishedSide) {
      issues.push({
        severity: "warning",
        code: "axis_crossing",
        message: `Setup ${setup.id} crosses the 180° line established by setup ${setupsInOrder[0].id}.`,
        subjectId: setup.id,
        x: setup.x,
        y: setup.y,
      });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Camera inside another setup's cone (all-setups mode only)
// ---------------------------------------------------------------------------

/**
 * Flags a setup whose position sits inside another setup's frame — i.e.
 * one camera has wandered into another's shot. Only meaningful once every
 * setup is visible at once (all-setups mode); the caller decides when to
 * run this.
 */
export function checkCameraInOtherCones(
  setups: Pick<Camera, "id" | "x" | "y" | "headingDeg" | "lensMm" | "focusDistanceFt">[],
  sensorWidthMm: number
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const subject of setups) {
    for (const other of setups) {
      if (subject.id === other.id) continue;
      const cone = conePolygon(other, sensorWidthMm);
      if (pointInPolygon(subject, cone)) {
        issues.push({
          severity: "warning",
          code: "cone_overlap",
          message: `Setup ${subject.id} sits inside setup ${other.id}'s frame.`,
          subjectId: subject.id,
          x: subject.x,
          y: subject.y,
        });
      }
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Camera/actor outside the set, inside a wall, or inside a set piece
// ---------------------------------------------------------------------------

/**
 * Effective wall thickness for collision purposes. Walls are modeled as
 * zero-width line segments (SetWall in components.md draws a line, "never
 * a filled rect"); no thickness-in-feet is specified anywhere in the
 * design package, so this is a documented assumption, not a spec value —
 * see README "Design gaps."
 */
export const WALL_COLLISION_THRESHOLD_FT = 0.25;

export interface BoundsSubject {
  id: string;
  x: number;
  y: number;
  kind: "camera" | "actor";
}

/**
 * Errors for any camera or actor position that's outside the set's
 * bounds, within `WALL_COLLISION_THRESHOLD_FT` of a wall segment, or
 * inside a set piece's footprint.
 */
export function checkOutOfBounds(set: Pick<Set, "bounds" | "walls" | "setPieces">, subjects: BoundsSubject[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const rect = { x: 0, y: 0, width: set.bounds.width, height: set.bounds.height };

  for (const subject of subjects) {
    if (!pointInRect(subject, rect)) {
      issues.push({
        severity: "error",
        code: "out_of_bounds",
        message: `${subject.kind === "camera" ? "Setup" : "Actor"} ${subject.id} is outside the set.`,
        subjectId: subject.id,
        x: subject.x,
        y: subject.y,
      });
      continue;
    }

    const wallHit = set.walls.find(
      (wall) =>
        distanceToSegment(subject, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 }) <
        WALL_COLLISION_THRESHOLD_FT
    );
    if (wallHit) {
      issues.push({
        severity: "error",
        code: "wall_collision",
        message: `${subject.kind === "camera" ? "Setup" : "Actor"} ${subject.id} is inside wall ${wallHit.id}.`,
        subjectId: subject.id,
        x: subject.x,
        y: subject.y,
      });
      continue;
    }

    const pieceHit = set.setPieces.find((piece) =>
      pointInRect(subject, { x: piece.x, y: piece.y, width: piece.width, height: piece.height })
    );
    if (pieceHit) {
      issues.push({
        severity: "error",
        code: "set_piece_collision",
        message: `${subject.kind === "camera" ? "Setup" : "Actor"} ${subject.id} is inside ${pieceHit.label}.`,
        subjectId: subject.id,
        x: subject.x,
        y: subject.y,
      });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Uncovered script lines
// ---------------------------------------------------------------------------

export interface LineRange {
  start: number;
  end: number;
}

/**
 * Gaps between a scene's full line range and the union of every shot's
 * `linesCovered`. Returns each uncovered sub-range in ascending order.
 */
export function findUncoveredLines(scene: LineRange, shots: Pick<Shot, "linesCovered">[]): LineRange[] {
  const covered = shots
    .map((s) => s.linesCovered)
    .filter((r): r is LineRange => Boolean(r))
    .sort((a, b) => a.start - b.start);

  const gaps: LineRange[] = [];
  let cursor = scene.start;

  for (const range of covered) {
    if (range.start > cursor) {
      gaps.push({ start: cursor, end: Math.min(range.start - 1, scene.end) });
    }
    cursor = Math.max(cursor, range.end + 1);
    if (cursor > scene.end) break;
  }

  if (cursor <= scene.end) {
    gaps.push({ start: cursor, end: scene.end });
  }

  return gaps.filter((g) => g.start <= g.end);
}

export function checkUncoveredLines(scene: LineRange, shots: Pick<Shot, "linesCovered">[]): ValidationIssue[] {
  return findUncoveredLines(scene, shots).map((gap) => ({
    severity: "info" as const,
    code: "uncovered_lines" as const,
    message:
      gap.start === gap.end
        ? `Line ${gap.start} isn't covered by any shot.`
        : `Lines ${gap.start}–${gap.end} aren't covered by any shot.`,
  }));
}

// ---------------------------------------------------------------------------
// Setup count & estimated shooting time
// ---------------------------------------------------------------------------

export interface ShootingTimeEstimate {
  setupCount: number;
  estimatedMinutes: number;
}

/**
 * Setup count and a rough shooting-time estimate for a scene.
 * `minutesPerSetup` is a project-configurable default
 * (`DEFAULT_MINUTES_PER_SETUP`); callers must label the result as an
 * estimate in the UI, per the brief.
 */
export function estimateShootingTime(
  setupCount: number,
  minutesPerSetup: number = DEFAULT_MINUTES_PER_SETUP
): ShootingTimeEstimate {
  return { setupCount, estimatedMinutes: setupCount * minutesPerSetup };
}
