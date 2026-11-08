import { describe, expect, it } from "vitest";
import { groceryKey, isNearDuplicate } from "./names.ts";

describe("groceryKey", () => {
  it("matches names regardless of case, spacing and plurals", () => {
    expect(groceryKey("Onions")).toBe(groceryKey("onion"));
    expect(groceryKey("Tomatoes")).toBe(groceryKey("tomato"));
    expect(groceryKey("Cherries")).toBe(groceryKey("cherry"));
    expect(groceryKey("  Green   Onions ")).toBe(groceryKey("green onion"));
    expect(groceryKey("Molasses")).not.toBe(groceryKey("molasse"));
  });
});

describe("isNearDuplicate", () => {
  it("flags a name that adds words in front of another", () => {
    expect(isNearDuplicate("onion", "yellow onion")).toBe(true);
    expect(isNearDuplicate("cheddar cheese", "mild cheddar cheese")).toBe(true);
    expect(isNearDuplicate("salt", "sea salt")).toBe(true);
  });

  it("leaves different groceries apart", () => {
    expect(isNearDuplicate("garlic", "garlic powder")).toBe(false);
    expect(isNearDuplicate("onion", "onion")).toBe(false);
    expect(isNearDuplicate("butter", "peanut sauce")).toBe(false);
  });

  it("leaves out combined groceries and names with many extra words", () => {
    expect(isNearDuplicate("pepper", "salt and pepper")).toBe(false);
    expect(isNearDuplicate("olive oil", "vegan butter or olive oil")).toBe(false);
    expect(isNearDuplicate("sugar", "packed light or dark brown sugar")).toBe(false);
    expect(isNearDuplicate("pepper", "cranks of fresh black pepper")).toBe(false);
  });
});
