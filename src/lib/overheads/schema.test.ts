import { describe, expect, it } from "vitest";
import sampleScene from "../../../design/overheads/sample-scene.json";
import { OverheadFixtureSchema } from "./schema";

describe("OverheadFixtureSchema", () => {
  it("validates design/overheads/sample-scene.json exactly as shipped", () => {
    const result = OverheadFixtureSchema.safeParse(sampleScene);
    if (!result.success) {
      throw new Error(JSON.stringify(result.error.issues, null, 2));
    }
    expect(result.data.shots).toHaveLength(6);
    expect(result.data.shots.map((s) => s.label)).toEqual(["12A", "12B", "12C", "12D", "12E", "12F"]);
  });

  it("round-trips the dolly move and actor path on shot 12E/12C without loss", () => {
    const result = OverheadFixtureSchema.parse(sampleScene);
    const dolly = result.shots.find((s) => s.label === "12E");
    expect(dolly?.setup.movementPath).toMatchObject({ kind: "dolly_track", distanceFt: 10 });

    const mayaPath = result.shots.find((s) => s.label === "12C")?.actors.find((a) => a.characterId === "maya");
    expect(mayaPath?.path).toHaveLength(3);
  });
});
