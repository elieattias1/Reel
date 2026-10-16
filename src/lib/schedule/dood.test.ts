import { describe, expect, it } from "vitest";
import { computeDoodCells, computeDoodRows, type DoodDayInfo } from "./dood";

const FIVE_DAYS: DoodDayInfo[] = [
  { id: "d1", day_number: 1 },
  { id: "d2", day_number: 2 },
  { id: "d3", day_number: 3 },
  { id: "d4", day_number: 4 },
  { id: "d5", day_number: 5 },
];
const DAY_IDS = FIVE_DAYS.map((d) => d.id);

describe("computeDoodCells", () => {
  it("classifies a cast member working day 1 and day 4: SW, H, H, WF, blank", () => {
    const cells = computeDoodCells(DAY_IDS, new Set(["d1", "d4"]), new Set());
    expect(cells).toEqual({ d1: "SW", d2: "H", d3: "H", d4: "WF" });
    expect(cells.d5).toBeUndefined();
  });

  it("classifies a single-day engagement as SW, not WF", () => {
    const cells = computeDoodCells(DAY_IDS, new Set(["d2"]), new Set());
    expect(cells).toEqual({ d2: "SW" });
  });

  it("classifies consecutive work days as W in the middle", () => {
    const cells = computeDoodCells(DAY_IDS, new Set(["d1", "d2", "d3"]), new Set());
    expect(cells).toEqual({ d1: "SW", d2: "W", d3: "WF" });
  });

  it("marks a hold day as travel when flagged", () => {
    const cells = computeDoodCells(DAY_IDS, new Set(["d1", "d4"]), new Set(["d2"]));
    expect(cells).toEqual({ d1: "SW", d2: "T", d3: "H", d4: "WF" });
  });

  it("returns an empty map for a cast member with no worked days", () => {
    expect(computeDoodCells(DAY_IDS, new Set(), new Set())).toEqual({});
  });
});

describe("computeDoodRows", () => {
  it("builds one row per cast member with person_name carried through", () => {
    const rows = computeDoodRows(
      FIVE_DAYS,
      [
        { cast_role_id: "c1", person_name: "Alex Rivera" },
        { cast_role_id: "c2", person_name: null },
      ],
      new Map([
        ["c1", new Set(["d1", "d4"])],
        ["c2", new Set(["d2"])],
      ]),
      new Map()
    );

    expect(rows).toEqual([
      { cast_role_id: "c1", person_name: "Alex Rivera", cells: { d1: "SW", d2: "H", d3: "H", d4: "WF" } },
      { cast_role_id: "c2", person_name: null, cells: { d2: "SW" } },
    ]);
  });
});
