import { describe, expect, it } from "vitest";
import {
  conePolygon,
  distanceToSegment,
  extendLineToRect,
  fovDeg,
  headingToUnitVector,
  normalizeDeg,
  pointAtHeading,
  pointInPolygon,
  pointInRect,
  shortestAngleDeltaDeg,
  sideOfLine,
} from "./geometry";

describe("fovDeg", () => {
  it("matches the binding HFOV formula for Super 35 (24.9mm) at common lenses", () => {
    expect(fovDeg(50, 24.9)).toBeCloseTo(27.9646, 3);
    expect(fovDeg(24, 24.9)).toBeCloseTo(54.8361, 3);
    expect(fovDeg(85, 24.9)).toBeCloseTo(16.6658, 3);
    expect(fovDeg(100, 24.9)).toBeCloseTo(14.1936, 3);
  });

  it("defaults the sensor to Super 35 (24.9mm) when omitted", () => {
    expect(fovDeg(50)).toBeCloseTo(fovDeg(50, 24.9), 9);
  });

  it("widens as focal length shortens", () => {
    expect(fovDeg(24)).toBeGreaterThan(fovDeg(50));
    expect(fovDeg(50)).toBeGreaterThan(fovDeg(100));
  });
});

describe("headingToUnitVector", () => {
  it("treats 0° as up (-y), 90° as right (+x), per the design's binding FovCone formula", () => {
    expect(headingToUnitVector(0).x).toBeCloseTo(0, 9);
    expect(headingToUnitVector(0).y).toBeCloseTo(-1, 9);
    expect(headingToUnitVector(90).x).toBeCloseTo(1, 9);
    expect(headingToUnitVector(90).y).toBeCloseTo(0, 9);
    expect(headingToUnitVector(180).x).toBeCloseTo(0, 9);
    expect(headingToUnitVector(180).y).toBeCloseTo(1, 9);
  });

  it("is a unit vector at every heading", () => {
    for (const deg of [0, 17, 45, 91, 179, 225, 311, 359]) {
      const v = headingToUnitVector(deg);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 9);
    }
  });
});

describe("pointAtHeading", () => {
  it("moves straight up for heading 0", () => {
    const p = pointAtHeading({ x: 10, y: 10 }, 0, 5);
    expect(p.x).toBeCloseTo(10, 9);
    expect(p.y).toBeCloseTo(5, 9);
  });

  it("moves straight right for heading 90", () => {
    const p = pointAtHeading({ x: 10, y: 10 }, 90, 5);
    expect(p.x).toBeCloseTo(15, 9);
    expect(p.y).toBeCloseTo(10, 9);
  });
});

describe("normalizeDeg / shortestAngleDeltaDeg", () => {
  it("wraps into [0, 360)", () => {
    expect(normalizeDeg(370)).toBeCloseTo(10, 9);
    expect(normalizeDeg(-10)).toBeCloseTo(350, 9);
    expect(normalizeDeg(0)).toBe(0);
  });

  it("picks the shorter rotation direction, including across the 0/360 seam", () => {
    expect(shortestAngleDeltaDeg(10, 20)).toBeCloseTo(10, 9);
    expect(shortestAngleDeltaDeg(350, 10)).toBeCloseTo(20, 9);
    expect(shortestAngleDeltaDeg(10, 350)).toBeCloseTo(-20, 9);
    expect(shortestAngleDeltaDeg(0, 180)).toBeCloseTo(180, 9);
  });
});

describe("conePolygon", () => {
  it("returns [apex, far1, far2] where far1/far2 are the schematic cone length away", () => {
    const [apex, far1, far2] = conePolygon({ x: 5, y: 5, headingDeg: 0, lensMm: 50 }, 24.9);
    expect(apex).toEqual({ x: 5, y: 5 });
    expect(Math.hypot(far1.x - apex.x, far1.y - apex.y)).toBeCloseTo(5, 6);
    expect(Math.hypot(far2.x - apex.x, far2.y - apex.y)).toBeCloseTo(5, 6);
  });

  it("uses focusDistanceFt for cone length when provided (producer decision: open question 1)", () => {
    const [apex, far1] = conePolygon({ x: 0, y: 0, headingDeg: 0, lensMm: 50, focusDistanceFt: 12 }, 24.9);
    expect(Math.hypot(far1.x - apex.x, far1.y - apex.y)).toBeCloseTo(12, 6);
  });

  it("splits the HFOV evenly on either side of headingDeg", () => {
    const hfov = fovDeg(50, 24.9);
    const [apex, far1, far2] = conePolygon({ x: 0, y: 0, headingDeg: 40, lensMm: 50 }, 24.9);
    const angle1 = Math.atan2(far1.x - apex.x, -(far1.y - apex.y)) * (180 / Math.PI);
    const angle2 = Math.atan2(far2.x - apex.x, -(far2.y - apex.y)) * (180 / Math.PI);
    expect(angle1).toBeCloseTo(40 - hfov / 2, 6);
    expect(angle2).toBeCloseTo(40 + hfov / 2, 6);
  });
});

describe("sideOfLine", () => {
  it("returns opposite signs for points on opposite sides, 0 for collinear points", () => {
    const left = sideOfLine({ x: -1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
    const right = sideOfLine({ x: 1, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 });
    expect(left).not.toBe(right);
    expect(sideOfLine({ x: 0, y: 0 }, { x: 0, y: -1 }, { x: 0, y: 1 })).toBe(0);
  });
});

describe("pointInPolygon", () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];

  it("detects points inside and outside a simple polygon", () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true);
    expect(pointInPolygon({ x: 50, y: 50 }, square)).toBe(false);
  });
});

describe("distanceToSegment", () => {
  it("is 0 on the segment, and the perpendicular distance off it", () => {
    expect(distanceToSegment({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0, 9);
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3, 9);
  });

  it("clamps to the nearest endpoint beyond the segment's ends", () => {
    expect(distanceToSegment({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5, 9);
  });
});

describe("extendLineToRect", () => {
  const rect = { x: 0, y: 0, width: 10, height: 10 };

  it("extends a line through two interior points out to the rect boundary", () => {
    const [p1, p2] = extendLineToRect({ x: 4, y: 4 }, { x: 6, y: 6 }, rect)!;
    expect([p1, p2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 0, y: 0 }),
        expect.objectContaining({ x: 10, y: 10 }),
      ])
    );
  });

  it("handles an axis-aligned line", () => {
    const [p1, p2] = extendLineToRect({ x: 3, y: 5 }, { x: 7, y: 5 }, rect)!;
    expect([p1, p2]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ x: 0, y: 5 }),
        expect.objectContaining({ x: 10, y: 5 }),
      ])
    );
  });

  it("returns null for two identical points", () => {
    expect(extendLineToRect({ x: 1, y: 1 }, { x: 1, y: 1 }, rect)).toBeNull();
  });

  it("returns null for a line that never crosses the rect", () => {
    expect(extendLineToRect({ x: -5, y: 20 }, { x: -3, y: 20 }, rect)).toBeNull();
  });
});

describe("pointInRect", () => {
  it("includes the boundary", () => {
    const rect = { x: 0, y: 0, width: 10, height: 10 };
    expect(pointInRect({ x: 0, y: 0 }, rect)).toBe(true);
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true);
    expect(pointInRect({ x: 10.01, y: 5 }, rect)).toBe(false);
  });
});
