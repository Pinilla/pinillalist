import { describe, expect, it } from "vitest";
import { readNumber } from "./amounts.ts";

describe("readNumber", () => {
  it.each([
    ["2", 2],
    ["1.5 lb", 1.5],
    [".125 tsp", 0.125],
    ["3/4 tsp", 0.75],
    ["1 1/2 cups", 1.5],
    ["½ teaspoon", 0.5],
    ["1 ½ cups", 1.5],
    ["1½ cups", 1.5],
  ])("reads %s", (text, value) => {
    expect(readNumber(text)?.value).toBeCloseTo(value);
  });

  it("returns the rest of the text", () => {
    expect(readNumber("2 large")?.rest).toBe("large");
  });

  it("returns null without a number", () => {
    expect(readNumber("Pinch")).toBeNull();
  });
});
