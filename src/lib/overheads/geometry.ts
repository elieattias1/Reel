import { SUPER_35_SENSOR_WIDTH_MM, type Point2D } from "./schema";

/**
 * Heading convention (resolved conflict — see README "Conflicts between
 * design and brief"): the brief's product decision #3 states headingDeg 0°
 * points along +x, clockwise. `components.md`'s FovCone formula — marked
 * "binding, not a style choice" — computes cone direction as
 * `(sin(headingDeg), −cos(headingDeg))`, which is 0°=up(−y)/"north",
 * clockwise: a different axis than the brief's literal text, 90° apart.
 * Per the producer's direction, this file implements the design's formula
 * exactly as written (0°=up, clockwise) and that convention is used
 * identically in the renderer and validators, per the brief's own
 * requirement that one system be used everywhere.
 */

/** Schematic cone length (components.md: "lengthFt default 5ft at the sample scale"). */
export const DEFAULT_CONE_LENGTH_FT = 5;

/** Rough industry-typical default; configurable per project, always labeled an estimate in the UI. */
export const DEFAULT_MINUTES_PER_SETUP = 45;

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/** Wraps a heading to [0, 360). */
export function normalizeDeg(deg: number): number {
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/**
 * Smallest signed difference `b - a`, in (-180, 180], for shortest-path
 * rotation interpolation when tweening between two shots' headings.
 */
export function shortestAngleDeltaDeg(a: number, b: number): number {
  const diff = normalizeDeg(b - a);
  return diff > 180 ? diff - 360 : diff;
}

/** Unit direction vector for a heading, in this app's (0°=up, clockwise) convention. */
export function headingToUnitVector(headingDeg: number): Point2D {
  const rad = degToRad(headingDeg);
  return { x: Math.sin(rad), y: -Math.cos(rad) };
}

/** A point `distanceFt` away from `origin`, in the direction of `headingDeg`. */
export function pointAtHeading(origin: Point2D, headingDeg: number, distanceFt: number): Point2D {
  const dir = headingToUnitVector(headingDeg);
  return { x: origin.x + dir.x * distanceFt, y: origin.y + dir.y * distanceFt };
}

/**
 * Horizontal field of view, in degrees, for a lens on a given sensor.
 * Binding formula (components.md, product decision #4):
 * `hfovDeg = 2 × atan(sensorWidthMm / (2 × lensMm))`.
 */
export function fovDeg(lensMm: number, sensorWidthMm: number = SUPER_35_SENSOR_WIDTH_MM): number {
  return 2 * radToDeg(Math.atan(sensorWidthMm / (2 * lensMm)));
}

export interface ConeCamera {
  x: number;
  y: number;
  headingDeg: number;
  lensMm: number;
  focusDistanceFt?: number;
}

/**
 * The camera's FOV cone as a 3-point polygon: apex, then the two far
 * points at `headingDeg ∓ hfovDeg/2` (components.md's FovCone geometry).
 * Length is schematic (`DEFAULT_CONE_LENGTH_FT`) unless `focusDistanceFt`
 * is set (producer decision on the design handoff's open question 1).
 */
export function conePolygon(
  camera: ConeCamera,
  sensorWidthMm: number = SUPER_35_SENSOR_WIDTH_MM
): [Point2D, Point2D, Point2D] {
  const apex: Point2D = { x: camera.x, y: camera.y };
  const hfov = fovDeg(camera.lensMm, sensorWidthMm);
  const length = camera.focusDistanceFt ?? DEFAULT_CONE_LENGTH_FT;
  const far1 = pointAtHeading(apex, camera.headingDeg - hfov / 2, length);
  const far2 = pointAtHeading(apex, camera.headingDeg + hfov / 2, length);
  return [apex, far1, far2];
}

/** Signed side of a point relative to the directed line `lineStart -> lineEnd`. */
export function sideOfLine(point: Point2D, lineStart: Point2D, lineEnd: Point2D): -1 | 0 | 1 {
  const cross =
    (lineEnd.x - lineStart.x) * (point.y - lineStart.y) - (lineEnd.y - lineStart.y) * (point.x - lineStart.x);
  if (Math.abs(cross) < 1e-9) return 0;
  return cross > 0 ? 1 : -1;
}

/** Standard ray-casting point-in-polygon test. Boundary points may go either way (acceptable for a validator, not a hit-test). */
export function pointInPolygon(point: Point2D, polygon: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const vi = polygon[i];
    const vj = polygon[j];
    const intersects =
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Shortest distance from a point to a line segment. */
export function distanceToSegment(point: Point2D, segStart: Point2D, segEnd: Point2D): number {
  const dx = segEnd.x - segStart.x;
  const dy = segEnd.y - segStart.y;
  const lengthSq = dx * dx + dy * dy;

  if (lengthSq === 0) {
    return Math.hypot(point.x - segStart.x, point.y - segStart.y);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - segStart.x) * dx + (point.y - segStart.y) * dy) / lengthSq)
  );
  const projX = segStart.x + t * dx;
  const projY = segStart.y + t * dy;
  return Math.hypot(point.x - projX, point.y - projY);
}

/** Axis-aligned rectangle containment, inclusive of the boundary. */
export function pointInRect(
  point: Point2D,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  );
}
