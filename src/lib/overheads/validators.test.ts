import { describe, expect, it } from "vitest";
import {
  axisFromActors,
  checkAxisCrossings,
  checkCameraInOtherCones,
  checkOutOfBounds,
  checkUncoveredLines,
  estimateShootingTime,
  findUncoveredLines,
} from "./validators";

describe("axisFromActors / checkAxisCrossings", () => {
  const axis = axisFromActors([{ x: 0, y: 0 }, { x: 0, y: 10 }])!;

  it("builds the axis through the first two actors", () => {
    expect(axis.through).toEqual([{ x: 0, y: 0 }, { x: 0, y: 10 }]);
  });

  it("returns null with fewer than two actors", () => {
    expect(axisFromActors([{ x: 0, y: 0 }])).toBeNull();
  });

  it("flags only setups on the opposite side from the one that established it", () => {
    const setups = [
      { id: "A", x: -5, y: 5 }, // establishes the left side
      { id: "B", x: -3, y: 2 }, // same side — fine
      { id: "C", x: 5, y: 5 }, // opposite side — flagged
    ];
    const issues = checkAxisCrossings(axis, setups);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "axis_crossing", severity: "warning", subjectId: "C" });
    expect(issues[0].message).toContain("A");
  });

  it("never flags a setup exactly on the line", () => {
    const setups = [{ id: "A", x: -5, y: 5 }, { id: "B", x: 0, y: 7 }];
    expect(checkAxisCrossings(axis, setups)).toEqual([]);
  });
});

describe("checkCameraInOtherCones", () => {
  it("flags a setup that sits inside another setup's frame", () => {
    const setups = [
      { id: "wide", x: 0, y: 0, headingDeg: 0, lensMm: 50 },
      { id: "intruder", x: 0, y: -2, headingDeg: 180, lensMm: 50 },
    ];
    const issues = checkCameraInOtherCones(setups, 24.9);
    expect(issues.some((i) => i.code === "cone_overlap" && i.subjectId === "intruder")).toBe(true);
  });

  it("flags nothing when setups are far apart", () => {
    const setups = [
      { id: "a", x: 0, y: 0, headingDeg: 0, lensMm: 50 },
      { id: "b", x: 100, y: 100, headingDeg: 0, lensMm: 50 },
    ];
    expect(checkCameraInOtherCones(setups, 24.9)).toEqual([]);
  });
});

describe("checkOutOfBounds", () => {
  const set = {
    bounds: { width: 10, height: 10 },
    walls: [{ id: "wall_n", x1: 0, y1: 0, x2: 10, y2: 0 }],
    setPieces: [{ id: "table", label: "Table", x: 4, y: 4, width: 2, height: 2 }],
  };

  it("errors on a position outside the set", () => {
    const issues = checkOutOfBounds(set, [{ id: "cam1", x: 5, y: -1, kind: "camera" as const }]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "out_of_bounds", severity: "error", subjectId: "cam1" }),
    ]);
  });

  it("errors on a position too close to a wall", () => {
    const issues = checkOutOfBounds(set, [{ id: "cam1", x: 5, y: 0.1, kind: "camera" as const }]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "wall_collision", severity: "error", subjectId: "cam1" }),
    ]);
  });

  it("errors on a position inside a set piece", () => {
    const issues = checkOutOfBounds(set, [{ id: "actor1", x: 5, y: 5, kind: "actor" as const }]);
    expect(issues).toEqual([
      expect.objectContaining({ code: "set_piece_collision", severity: "error", subjectId: "actor1" }),
    ]);
  });

  it("passes a clean position through with no issues", () => {
    expect(checkOutOfBounds(set, [{ id: "cam1", x: 1, y: 1, kind: "camera" as const }])).toEqual([]);
  });
});

describe("findUncoveredLines / checkUncoveredLines", () => {
  const scene = { start: 1, end: 20 };
  const shots = [{ linesCovered: { start: 1, end: 5 } }, { linesCovered: { start: 10, end: 15 } }];

  it("finds the gaps between covered ranges", () => {
    expect(findUncoveredLines(scene, shots)).toEqual([
      { start: 6, end: 9 },
      { start: 16, end: 20 },
    ]);
  });

  it("finds no gaps when shots cover the whole scene", () => {
    expect(findUncoveredLines(scene, [{ linesCovered: { start: 1, end: 20 } }])).toEqual([]);
  });

  it("surfaces gaps as info-severity issues", () => {
    const issues = checkUncoveredLines(scene, shots);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ severity: "info", code: "uncovered_lines" });
    expect(issues[0].message).toContain("6");
  });
});

describe("estimateShootingTime", () => {
  it("multiplies setup count by the default minutes-per-setup", () => {
    expect(estimateShootingTime(6)).toEqual({ setupCount: 6, estimatedMinutes: 270 });
  });

  it("accepts a project-configurable override", () => {
    expect(estimateShootingTime(6, 30)).toEqual({ setupCount: 6, estimatedMinutes: 180 });
  });
});
