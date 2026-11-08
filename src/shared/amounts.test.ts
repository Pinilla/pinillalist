import { describe, expect, it } from "vitest";
import { formatBuyingAmount, readNumber } from "./amounts.ts";

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

describe("formatBuyingAmount", () => {
  it("counts a grocery without a unit by its name", () => {
    expect(formatBuyingAmount(3, "", "Onion")).toBe("3 onions");
    expect(formatBuyingAmount(1, "", "Onion")).toBe("1 onion");
    expect(formatBuyingAmount(2, "", "Tomato")).toBe("2 tomatoes");
  });

  it("uses the unit and leaves abbreviations alone", () => {
    expect(formatBuyingAmount(2, "lb", "Ground beef")).toBe("2 lb");
    expect(formatBuyingAmount(2, "can", "Black beans")).toBe("2 cans");
    expect(formatBuyingAmount(1.5, "lb", "Chicken")).toBe("1.5 lb");
  });
});
