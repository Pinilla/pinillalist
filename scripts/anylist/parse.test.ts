import { describe, expect, it } from "vitest";
import { countedAmount, parseIngredient } from "./parse.ts";

describe("parseIngredient", () => {
  it.each([
    // [name, quantity, note] -> [grocery, cooking amount, preparation]
    [["Ground Beef", undefined, ""], ["Ground Beef", "", ""]],
    [["butter ", "3 Tbsp", "((unsalted and divided))"], ["Butter", "3 Tbsp", "unsalted and divided"]],
    [["garlic", "4 cloves", " ((minced))"], ["Garlic", "4 cloves", "minced"]],
    [["Cajun seasoning ", "", "( to taste)"], ["Cajun seasoning", "", "to taste"]],
    [["Salt and pepper", "", " ( (to taste, optional))"], ["Salt and pepper", "", "to taste, optional"]],
    [["scallions (sliced)", "2", ""], ["Scallions", "2", "sliced"]],
    [["mozzarella cheese, shredded and divided", "2 cups", ""], ["Mozzarella cheese", "2 cups", "shredded and divided"]],
    [["onion", "1", "crushed"], ["Onion", "1", "crushed"]],
    [["green onions (sliced, or chives)", "", ""], ["Green onions", "", "sliced, or chives"]],
    [["unsalted butter (1 stick; 110g)", "", ""], ["Unsalted butter", "", "1 stick; 110g"]],
    [["∙ 25g chopped calabrian chiles (or chili flakes)", "", ""], ["Calabrian chiles", "25g", "chopped, or chili flakes"]],
    [["∙ 30g 6 cloves  minced garlic (15g for spinach)", "", ""], ["Garlic", "30g 6 cloves", "minced, 15g for spinach"]],
    [["minced garlic", "1 tbsp", ""], ["Garlic", "1 tbsp", "minced"]],
    [["parmesan", "(3/4c)", ""], ["Parmesan", "3/4c", ""]],
    [["7g salt", "(1t)", ""], ["Salt", "7g (1t)", ""]],
    [["Large Yellow Onion", "1", ""], ["Yellow Onion", "1 large", ""]],
    [["large egg", "", ""], ["Egg", "large", ""]],
    [["Broth )", "1 cup", ""], ["Broth", "1 cup", ""]],
    [["and 1/2 cups (188g) all-purpose flour (spooned & leveled)", "2", ""], ["All-purpose flour", "2 and 1/2 cups", "188g, spooned & leveled"]],
    [["of chili seasoning", "2 packet", ""], ["Chili seasoning", "2 packet", ""]],
    [["Raw Chicken Breast", "", ""], ["Chicken Breast", "", "raw"]],
  ] as const)("parses %j", ([name, quantity, note], [grocery, cooking, prep]) => {
    expect(parseIngredient({ name, quantity, note })).toEqual({
      groceryName: grocery,
      cookingAmount: cooking,
      preparation: prep,
    });
  });
});

describe("countedAmount", () => {
  it.each([
    ["2", { amount: 2, unit: "" }],
    ["1/2", { amount: 0.5, unit: "" }],
    ["1 large", { amount: 1, unit: "" }],
    ["2 medium", { amount: 2, unit: "" }],
    ["1 lb", { amount: 1, unit: "lb" }],
    ["1 lb.", { amount: 1, unit: "lb" }],
    ["2 pounds", { amount: 2, unit: "lb" }],
    ["2lb", { amount: 2, unit: "lb" }],
    ["1 can", { amount: 1, unit: "can" }],
    ["2 pack", { amount: 2, unit: "pack" }],
    ["1 (8 ounce) package", { amount: 1, unit: "pack" }],
    ["1 box (8 oz.)", { amount: 1, unit: "box" }],
    ["2 packet", { amount: 2, unit: "packet" }],
    ["1.5 bag", { amount: 1.5, unit: "bag" }],
    ["4 pounds (1.8kg)", { amount: 4, unit: "lb" }],
  ])("counts %s", (text, expected) => {
    expect(countedAmount(text)).toEqual(expected);
  });

  it.each(["", "1 cup", "½ teaspoon", "2 cloves", "8 oz", "10 g", "Pinch", "4-6", "2 - 3", "1 15 oz cans", "1 cup (113 g)"])(
    "flags %s for the household to fill in",
    (text) => {
      expect(countedAmount(text)).toBeNull();
    },
  );
});

