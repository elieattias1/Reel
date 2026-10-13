import { describe, expect, it } from "vitest";
import { assignCharacterPalette } from "./characters";

describe("assignCharacterPalette", () => {
  it("assigns slots by position and derives the initial from the name", () => {
    const [maya, theo] = assignCharacterPalette([{ id: "maya", name: "Maya" }, { id: "theo", name: "Theo" }]);
    expect(maya.initial).toBe("M");
    expect(maya.color.light).toBe("var(--color-character-1)");
    expect(theo.initial).toBe("T");
    expect(theo.color.light).toBe("var(--color-character-2)");
  });

  it("cycles back to slot 1 past 8 characters", () => {
    const names = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Character ${i}` }));
    const assigned = assignCharacterPalette(names);
    expect(assigned[0].color.light).toBe("var(--color-character-1)");
    expect(assigned[8].color.light).toBe("var(--color-character-1)");
  });

  it("falls back to '?' for an empty name", () => {
    expect(assignCharacterPalette([{ id: "x", name: "" }])[0].initial).toBe("?");
  });
});
