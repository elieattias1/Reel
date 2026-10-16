import { describe, expect, it } from "vitest";
import { runConflictChecks, type ConflictContext } from "./conflicts";

function baseContext(overrides: Partial<ConflictContext> = {}): ConflictContext {
  return {
    projectId: "p1",
    scheduleVersionId: "v1",
    days: [],
    scenesById: new Map(),
    castByScene: new Map(),
    castRolesById: new Map(),
    crewRolesById: new Map(),
    crewRequirementsByScene: new Map(),
    availabilityByCastRoleId: new Map(),
    locationsById: new Map(),
    ...overrides,
  };
}

describe("runConflictChecks", () => {
  it("flags a confirmed cast member scheduled on a date they're marked unavailable", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 1, complexity_flags: [], primary_location_id: null }]]),
      castByScene: new Map([["s1", ["c1"]]]),
      castRolesById: new Map([["c1", { id: "c1", person_name: "Jamie Lee", status: "confirmed" }]]),
      availabilityByCastRoleId: new Map([["c1", [{ start: "2026-03-09", end: "2026-03-12" }]]]),
    });

    const conflicts = runConflictChecks(ctx);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("double_booking");
    expect(conflicts[0].cast_role_id).toBe("c1");
  });

  it("flags a stunt-flagged scene with no confirmed stunt coordinator, and nothing else", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 7, complexity_flags: ["stunts"], primary_location_id: null }]]),
      crewRequirementsByScene: new Map([["s1", [{ crew_role_type: "stunt_coordinator", headcount: 1 }]]]),
      crewRolesById: new Map(), // no confirmed crew at all
    });

    const conflicts = runConflictChecks(ctx);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("missing_required_crew");
    expect(conflicts[0].scene_id).toBe("s1");
  });

  it("does not flag missing crew once a confirmed stunt coordinator exists", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 7, complexity_flags: ["stunts"], primary_location_id: null }]]),
      crewRequirementsByScene: new Map([["s1", [{ crew_role_type: "stunt_coordinator", headcount: 1 }]]]),
      crewRolesById: new Map([["cr1", { id: "cr1", role_type: "stunt_coordinator", status: "confirmed" }]]),
    });

    expect(runConflictChecks(ctx)).toEqual([]);
  });

  it("flags a turnaround under the 10h minimum between consecutive shoot days", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: "08:00:00", general_crew_wrap_time: "23:00:00", sceneIds: ["s1"] },
        { id: "day2", day_number: 2, shoot_date: "2026-03-11", general_crew_call_time: "06:00:00", general_crew_wrap_time: "18:00:00", sceneIds: ["s2"] },
      ],
      scenesById: new Map([
        ["s1", { id: "s1", scene_number: 1, complexity_flags: [], primary_location_id: null }],
        ["s2", { id: "s2", scene_number: 2, complexity_flags: [], primary_location_id: null }],
      ]),
      castByScene: new Map([
        ["s1", ["c1"]],
        ["s2", ["c1"]],
      ]),
      castRolesById: new Map([["c1", { id: "c1", person_name: "Jamie Lee", status: "confirmed" }]]),
    });

    const conflicts = runConflictChecks(ctx);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("turnaround_violation");
  });

  it("flags a day outside its location's available date range", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 1, complexity_flags: [], primary_location_id: "loc1" }]]),
      locationsById: new Map([["loc1", { available_date_ranges: [{ start: "2026-04-01", end: "2026-04-10" }] }]]),
    });

    const conflicts = runConflictChecks(ctx);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("location_unavailable");
  });

  it("flags a day exceeding the minor work-hour limit when a minors scene is scheduled", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: "06:00:00", general_crew_wrap_time: "20:00:00", sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 1, complexity_flags: ["minors"], primary_location_id: null }]]),
    });

    const conflicts = runConflictChecks(ctx);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe("minor_hours_exceeded");
  });

  it("returns nothing for a clean schedule", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: "07:00:00", general_crew_wrap_time: "19:00:00", sceneIds: ["s1"] },
      ],
      scenesById: new Map([["s1", { id: "s1", scene_number: 1, complexity_flags: [], primary_location_id: null }]]),
      castByScene: new Map([["s1", ["c1"]]]),
      castRolesById: new Map([["c1", { id: "c1", person_name: "Jamie Lee", status: "confirmed" }]]),
    });

    expect(runConflictChecks(ctx)).toEqual([]);
  });

  it("filters results to a single day when dayId is given", () => {
    const ctx = baseContext({
      days: [
        { id: "day1", day_number: 1, shoot_date: "2026-03-10", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s1"] },
        { id: "day2", day_number: 2, shoot_date: "2026-03-11", general_crew_call_time: null, general_crew_wrap_time: null, sceneIds: ["s2"] },
      ],
      scenesById: new Map([
        ["s1", { id: "s1", scene_number: 1, complexity_flags: [], primary_location_id: "loc1" }],
        ["s2", { id: "s2", scene_number: 2, complexity_flags: [], primary_location_id: "loc1" }],
      ]),
      locationsById: new Map([["loc1", { available_date_ranges: [{ start: "2026-04-01", end: "2026-04-10" }] }]]),
    });

    const all = runConflictChecks(ctx);
    expect(all).toHaveLength(2);
    const filtered = runConflictChecks(ctx, { dayId: "day1" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].schedule_day_id).toBe("day1");
  });
});
