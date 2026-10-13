import { describe, expect, it } from "vitest";
import { formatIntRange, parseIntRange, rowToSet, rowToShot, setToInsertRow, shotToInsertRow } from "./db";
import type { SetRow, ShotRow } from "@/lib/supabase/types";

describe("parseIntRange / formatIntRange", () => {
  it("round-trips through Postgres's canonical [lower,upper) form", () => {
    const range = { start: 10, end: 15 };
    const canonical = formatIntRange(range);
    expect(canonical).toBe("[10,16)");
    expect(parseIntRange(canonical)).toEqual(range);
  });

  it("handles a single-line range", () => {
    expect(formatIntRange({ start: 21, end: 21 })).toBe("[21,22)");
    expect(parseIntRange("[21,22)")).toEqual({ start: 21, end: 21 });
  });

  it("returns null for null/undefined input", () => {
    expect(parseIntRange(null)).toBeNull();
    expect(parseIntRange(undefined)).toBeNull();
  });
});

describe("rowToSet / setToInsertRow", () => {
  const row: SetRow = {
    id: "set_1",
    project_id: "proj_1",
    location_id: "loc_1",
    name: "Diner",
    width_ft: 24,
    depth_ft: 13,
    geometry: { walls: [{ id: "w1", x1: 0, y1: 0, x2: 10, y2: 0 }], doors: [], windows: [], setPieces: [] },
    created_at: "now",
    updated_at: "now",
  };

  it("maps a set row into the schema shape", () => {
    const set = rowToSet(row);
    expect(set.bounds).toEqual({ width: 24, height: 13 });
    expect(set.walls).toHaveLength(1);
  });

  it("round-trips a set through insert-row shape", () => {
    const set = rowToSet(row);
    const insert = setToInsertRow("proj_1", "loc_1", set);
    expect(insert.width_ft).toBe(24);
    expect(insert.geometry.walls).toEqual(set.walls);
  });
});

describe("rowToShot / shotToInsertRow", () => {
  const row: ShotRow = {
    id: "shot_1",
    project_id: "proj_1",
    scene_id: "scene_1",
    set_id: "set_1",
    position: 0,
    setup_letter: "A",
    title: "Wide",
    size: "wide",
    camera: { id: "setup_1", x: 1, y: 1, headingDeg: 0, lensMm: 24, height: "eye", support: "sticks", movementPath: null },
    actors: [],
    covers_lines: "[1,5)",
    note: null,
    status: "draft",
    created_at: "now",
    updated_at: "now",
  };

  it("combines the scene label and setup letter into the shot's full label", () => {
    const shot = rowToShot(row, "12");
    expect(shot.label).toBe("12A");
    expect(shot.linesCovered).toEqual({ start: 1, end: 4 });
  });

  it("round-trips a shot through insert-row shape", () => {
    const shot = rowToShot(row, "12");
    const insert = shotToInsertRow("proj_1", "scene_1", "set_1", 0, "A", shot);
    expect(insert.covers_lines).toBe("[1,5)");
    expect(insert.camera).toEqual(shot.setup);
  });
});
