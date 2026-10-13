import { z } from "zod";

/**
 * Shared geometry/data model for Overhead Shots.
 *
 * Coordinate system (binding, per the engineering brief): feet, origin at
 * the set's top-left corner, x increases right, y increases down, heading
 * in degrees with 0 pointing along +x and positive values clockwise. The
 * database, the blocking agent's tools, the SVG renderer, and
 * `design/overheads/sample-scene.json` all use this same system and all
 * validate against the schemas below.
 */

export const Point2D = z.object({
  x: z.number(),
  y: z.number(),
});
export type Point2D = z.infer<typeof Point2D>;

// ---------------------------------------------------------------------------
// Set (location floor plan, shared across scenes at that location)
// ---------------------------------------------------------------------------

export const WallSchema = z.object({
  id: z.string(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});
export type Wall = z.infer<typeof WallSchema>;

export const DoorSchema = z.object({
  id: z.string(),
  wallId: z.string(),
  hinge: Point2D,
  width: z.number().positive(),
  swingsInto: z.enum(["room", "out"]),
  openAngleDeg: z.number().min(0).max(180),
});
export type Door = z.infer<typeof DoorSchema>;

export const WindowSchema = z.object({
  id: z.string(),
  x1: z.number(),
  y1: z.number(),
  x2: z.number(),
  y2: z.number(),
});
export type Window = z.infer<typeof WindowSchema>;

export const SetPieceSchema = z.object({
  id: z.string(),
  label: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export type SetPiece = z.infer<typeof SetPieceSchema>;

export const SetSchema = z.object({
  id: z.string(),
  name: z.string(),
  units: z.literal("ft"),
  bounds: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
  }),
  walls: z.array(WallSchema).default([]),
  doors: z.array(DoorSchema).default([]),
  windows: z.array(WindowSchema).default([]),
  setPieces: z.array(SetPieceSchema).default([]),
});
export type Set = z.infer<typeof SetSchema>;

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

export const CharacterSchema = z.object({
  id: z.string(),
  name: z.string(),
  initial: z.string().min(1).max(2),
  color: z.object({
    light: z.string(),
    dark: z.string(),
  }),
});
export type Character = z.infer<typeof CharacterSchema>;

// ---------------------------------------------------------------------------
// Camera (a shot's setup)
// ---------------------------------------------------------------------------

export const MovementPathSchema = z.object({
  kind: z.literal("dolly_track"),
  points: z.array(Point2D).min(2),
  distanceFt: z.number().positive(),
});
export type MovementPath = z.infer<typeof MovementPathSchema>;

/**
 * `height` and `support` are deliberately free text, not a closed enum —
 * `components.md`'s CameraGlyph only specifies that they render as plain
 * pill labels ("Eye", "Sticks"), never a fixed vocabulary with its own
 * per-value styling. Validating them as non-empty strings keeps the schema
 * honest about what's actually specified.
 */
export const CameraSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  headingDeg: z.number(),
  lensMm: z.number().positive(),
  height: z.string().min(1),
  support: z.string().min(1),
  /**
   * Schematic cone length by default (see FovCone in components.md). Added
   * per the producer's decision on the design handoff's open question 1:
   * when set, the FOV cone is drawn out to the actual subject distance
   * instead of the fixed ~5ft schematic length.
   */
  focusDistanceFt: z.number().positive().optional(),
  movementPath: MovementPathSchema.nullable().default(null),
});
export type Camera = z.infer<typeof CameraSchema>;

// ---------------------------------------------------------------------------
// Actors (marks + paths)
// ---------------------------------------------------------------------------

export const ActorBeatSchema = z.object({
  beat: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
});
export type ActorBeat = z.infer<typeof ActorBeatSchema>;

export const ActorSchema = z.object({
  characterId: z.string(),
  x: z.number(),
  y: z.number(),
  facingDeg: z.number(),
  path: z.array(ActorBeatSchema).optional(),
});
export type Actor = z.infer<typeof ActorSchema>;

// ---------------------------------------------------------------------------
// Shot (setup + actor marks/paths + size + coverage + title/note)
// ---------------------------------------------------------------------------

/**
 * Standard industry shot sizes. Only five of these appear in
 * `sample-scene.json`; the rest are included because `shotSize` is a closed
 * vocabulary driving pill labels in the shot strip (components.md's
 * "StatusIndicator pill pattern... one fixed vocabulary"), and a blocking
 * agent covering a real scene will need more than five. Flagged in the
 * README under "Design gaps" since the design package itself only
 * confirms the five used in the sample.
 */
export const ShotSizeSchema = z.enum([
  "extreme_wide",
  "wide",
  "medium_wide",
  "medium",
  "medium_close_up",
  "close_up",
  "extreme_close_up",
  "insert",
  "two_shot",
  "over_the_shoulder",
]);
export type ShotSize = z.infer<typeof ShotSizeSchema>;

export const LinesCoveredSchema = z
  .object({
    start: z.number().int().positive(),
    end: z.number().int().positive(),
  })
  .refine((v) => v.end >= v.start, { message: "end must be >= start" });
export type LinesCovered = z.infer<typeof LinesCoveredSchema>;

/** Setup letter within a scene: "A", "B", ... "Z", "AA", ... */
export const SetupLetterSchema = z.string().regex(/^[A-Z]+$/);

export const ShotSchema = z.object({
  id: z.string(),
  label: z.string(),
  title: z.string(),
  shotSize: ShotSizeSchema,
  linesCovered: LinesCoveredSchema,
  note: z.string().nullable().default(null),
  setup: CameraSchema,
  actors: z.array(ActorSchema).default([]),
});
export type Shot = z.infer<typeof ShotSchema>;

// ---------------------------------------------------------------------------
// Full scene fixture (the shape of design/overheads/sample-scene.json)
// ---------------------------------------------------------------------------

export const SceneRefSchema = z.object({
  id: z.string(),
  number: z.string(),
  slug: z.string(),
  heading: z.string(),
  setId: z.string(),
  /** Sensor width in mm, used by FovCone's HFOV formula. Super 35 default is 24.9mm. */
  sensorWidthMm: z.number().positive(),
});
export type SceneRef = z.infer<typeof SceneRefSchema>;

export const OverheadFixtureSchema = z.object({
  set: SetSchema,
  characters: z.array(CharacterSchema),
  scene: SceneRefSchema,
  shots: z.array(ShotSchema),
});
export type OverheadFixture = z.infer<typeof OverheadFixtureSchema>;

/** A full scene snapshot as stored in `overhead_versions.snapshot`. */
export const OverheadSnapshotSchema = z.object({
  set: SetSchema,
  shots: z.array(ShotSchema),
});
export type OverheadSnapshot = z.infer<typeof OverheadSnapshotSchema>;

export const SUPER_35_SENSOR_WIDTH_MM = 24.9;
