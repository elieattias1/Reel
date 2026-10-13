import { describe, expect, it } from "vitest";
import { nextSetupLetter } from "./labels";

describe("nextSetupLetter", () => {
  it("starts at A", () => {
    expect(nextSetupLetter([])).toBe("A");
  });

  it("increments from the highest existing letter, regardless of order", () => {
    expect(nextSetupLetter(["A", "B", "C"])).toBe("D");
    expect(nextSetupLetter(["C", "A", "B"])).toBe("D");
  });

  it("rolls over past Z into AA, AB, ...", () => {
    expect(nextSetupLetter(["Z"])).toBe("AA");
    expect(nextSetupLetter(["AA", "AB"])).toBe("AC");
    expect(nextSetupLetter(["AZ"])).toBe("BA");
  });
});
