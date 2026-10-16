import { describe, expect, it } from "vitest";
import { computeEighths, mapComplexityFlagsToCrewRequirements } from "./persist-breakdown";

describe("computeEighths", () => {
  it("returns null for a null range (unresolved heading)", () => {
    expect(computeEighths(null)).toBeNull();
  });

  it("derives ~8 eighths (one full page) from ~55 lines", () => {
    expect(computeEighths({ start: 1, end: 55 })).toBe(8);
  });

  it("derives ~2 eighths from a 14-line scene", () => {
    expect(computeEighths({ start: 1, end: 14 })).toBe(2);
  });

  it("never returns less than 1 eighth for a non-empty scene", () => {
    expect(computeEighths({ start: 1, end: 1 })).toBeGreaterThanOrEqual(1);
  });
});

describe("mapComplexityFlagsToCrewRequirements", () => {
  it("maps each closed-vocabulary flag to its dedicated crew role", () => {
    const cases: [string, string][] = [
      ["stunts", "stunt_coordinator"],
      ["vfx", "vfx_supervisor"],
      ["animals", "animal_wrangler"],
      ["minors", "studio_teacher"],
      ["fire", "sfx_supervisor"],
      ["water", "safety_diver"],
      ["weapons", "armorer"],
      ["vehicles", "transportation_captain"],
    ];
    for (const [flag, roleType] of cases) {
      const reqs = mapComplexityFlagsToCrewRequirements([flag], 5);
      expect(reqs).toHaveLength(1);
      expect(reqs[0].crew_role_type).toBe(roleType);
      expect(reqs[0].headcount).toBe(1);
      expect(reqs[0].reason).toContain(flag);
    }
  });

  it("scales additional_pa headcount with cast size for crowd scenes", () => {
    expect(mapComplexityFlagsToCrewRequirements(["crowd"], 5)[0].headcount).toBe(2);
    expect(mapComplexityFlagsToCrewRequirements(["crowd"], 30)[0].headcount).toBe(3);
  });

  it("produces no requirement for large_cast or night_exterior", () => {
    expect(mapComplexityFlagsToCrewRequirements(["large_cast", "night_exterior"], 10)).toEqual([]);
  });

  it("combines multiple flags into multiple requirements", () => {
    const reqs = mapComplexityFlagsToCrewRequirements(["stunts", "animals"], 5);
    expect(reqs.map((r) => r.crew_role_type).sort()).toEqual(["animal_wrangler", "stunt_coordinator"]);
  });

  it("returns nothing for an empty flag list", () => {
    expect(mapComplexityFlagsToCrewRequirements([], 5)).toEqual([]);
  });
});
