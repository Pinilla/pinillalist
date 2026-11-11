import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e household password";

async function login(page: Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Pick recipes" })).toBeVisible();
}

async function next(page: Page) {
  await page.getByRole("button", { name: /^Next:/ }).click();
}

test("a wrong password stays on the login page", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("not it");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert")).toHaveText("That's not the household password.");
});

test("a full weekly order builds the right Walmart and Amazon cart links", async ({ page }) => {
  await login(page);

  // 1. Pick recipes
  await page.getByRole("button", { name: "Chili" }).click();
  await page.getByRole("button", { name: "Tacos" }).click();
  await expect(page.getByText("2 chosen.")).toBeVisible();
  await next(page);

  // 2. Stock check: one walk through the house, with the Essentials mixed in.
  await expect(page.getByRole("heading", { name: "Stock check" })).toBeVisible();
  const card = page.locator(".card");
  const where = card.locator(".where");
  const quantity = card.getByRole("group", { name: "Quantity to buy" });
  const status = quantity.getByRole("status");

  // Master bathroom: an Essential starts at 0, so Next means there's enough.
  await expect(where).toHaveText("Master bathroom");
  await expect(card.locator(".item-name")).toHaveText("Toilet paper");
  await expect(card).toContainText("Extra roll in the closet");
  await expect(status).toHaveText("0");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Pantry: each recipe's ingredient line, starting at 1.
  await expect(where).toHaveText("Pantry");
  await expect(card.locator(".item-name")).toHaveText("Onion");
  await expect(card).toContainText("Yellow onions, 3 lb bag");
  await expect(card.locator(".uses li")).toHaveText(["2 diced, for Chili", "1, for Tacos"]);
  await expect(status).toHaveText("1");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(card.locator(".item-name")).toHaveText("Cumin");
  await expect(card).toContainText("No product linked");
  await expect(card.locator(".uses li")).toHaveText(["1 tsp, for Chili"]);
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await expect(card.locator(".item-name")).toHaveText("Tortillas");
  await quantity.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Fridge: taking a quantity down to 0 means there's enough at home, and the next card comes up.
  await expect(where).toHaveText("Fridge");
  await expect(card.locator(".item-name")).toHaveText("Ground beef");
  await quantity.getByRole("button", { name: "Less" }).click();

  // The deli cheese is an Essential sold by the pound.
  await expect(card.locator(".item-name")).toHaveText("Deli American cheese");
  await expect(status).toHaveText("0");
  for (let i = 0; i < 4; i++) await quantity.getByRole("button", { name: "More" }).click();
  await expect(status).toHaveText("1");
  await page.getByRole("button", { name: "Next", exact: true }).click();

  // Summary after the last card, grouped by location. Change Ground beef from the summary.
  await expect(page.getByText("4 of 6 to buy.")).toBeVisible();
  await expect(page.locator(".step-body h2")).toHaveText(["Master bathroom", "Pantry", "Fridge"]);
  await expect(page.getByRole("button", { name: /Ground beef/ })).toContainText("Have it");
  await expect(page.getByRole("button", { name: /Tortillas/ })).toContainText("Buy 2");
  await page.getByRole("button", { name: /Ground beef/ }).click();
  await expect(card.locator(".item-name")).toHaveText("Ground beef");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("5 of 6 to buy.")).toBeVisible();
  await next(page);

  // 3. Anything else: a grocery that isn't in the catalog yet.
  await page.getByLabel("Search the catalog").fill("Bananas");
  await page.getByRole("button", { name: /Add "Bananas" as a new grocery/ }).click();
  await expect(page.locator(".list").getByText("Bananas")).toBeVisible();
  await next(page);

  // 4. Fill carts
  const walmart = page.getByRole("link", { name: "Fill my Walmart cart" });
  const amazon = page.getByRole("link", { name: "Fill my Amazon cart" });
  await expect(walmart).toHaveAttribute(
    "href",
    "https://www.walmart.com/sc/cart/addToCart?items=51259212_1,10450114_1,22222222_1",
  );
  await expect(amazon).toHaveAttribute("href", "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07XJ8C8F5&Quantity.1=2");
  const byHand = page.locator("section", { hasText: "Add these by hand" });
  await expect(byHand).toContainText("Cumin");
  await expect(byHand).toContainText("Bananas");

  // Removing an item takes it out of the link.
  await page.getByRole("button", { name: "Remove Ground beef" }).click();
  await expect(walmart).toHaveAttribute("href", "https://www.walmart.com/sc/cart/addToCart?items=51259212_1,22222222_1");
  await page.getByRole("button", { name: "Put back" }).click();
  await expect(walmart).toHaveAttribute("href", /10450114_1/);

  // Starting over clears this phone's order.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Start a new order" }).click();
  await expect(page.getByRole("heading", { name: "Pick recipes" })).toBeVisible();
  await expect(page.getByText("Tap the recipes you'll cook this week.")).toBeVisible();
});

test("closing the app resumes the order where it left off", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Cookies" }).click();
  await next(page);
  // The walk starts with the Essentials and ends with Flour, which has no location.
  await expect(page.locator(".card .item-name")).toHaveText("Toilet paper");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card .item-name")).toHaveText("Deli American cheese");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card .where")).toHaveText("Other");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Stock check" })).toBeVisible();
  await expect(page.locator(".card .item-name")).toHaveText("Flour");
});

test("picking a recipe asks about its optional ingredients and the recipes it's made from", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Pozole" }).click();
  const sheet = page.getByRole("dialog", { name: "Pozole" });
  await expect(sheet.getByRole("group", { name: /Salsa verde/ }).getByRole("button", { name: "Make it" })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("checkbox")).toHaveCount(2);
  await sheet.getByLabel("Radishes, sliced").check();
  await sheet.getByRole("button", { name: "Add to this week" }).click();
  await expect(page.getByText("1 chosen.")).toBeVisible();
  await next(page);

  // Made: the salsa's ingredients come in, labeled with both recipes. Only the picked topping comes in.
  const names = async () => {
    const seen: string[] = [];
    while (await page.locator(".card").count()) {
      seen.push((await page.locator(".card .item-name").textContent())!);
      await page.getByRole("button", { name: "Have it" }).click();
    }
    return seen;
  };
  await expect(page.locator(".card .item-name")).toHaveText("Toilet paper");
  await page.getByRole("button", { name: "Have it" }).click();
  await page.getByRole("button", { name: "Have it" }).click();
  await expect(page.locator(".card .item-name")).toHaveText("Hominy");
  await page.getByRole("button", { name: "Have it" }).click();
  await expect(page.locator(".card .item-name")).toHaveText("Tomatillos");
  await expect(page.locator(".card .uses li")).toHaveText(["1 lb, for Salsa verde (in Pozole)"]);
  expect(await names()).toEqual(["Tomatillos", "Lime", "Radishes"]);

  // Buy it instead: the salsa grocery replaces the salsa's ingredients.
  await page.getByRole("tab", { name: "Pick recipes" }).click();
  await page.getByRole("button", { name: "Pozole" }).click();
  await expect(sheet.getByLabel("Radishes, sliced")).toBeChecked();
  await sheet.getByRole("button", { name: "Buy it" }).click();
  await expect(sheet).toContainText("Adds Green salsa to the stock check.");
  await sheet.getByRole("button", { name: "Save" }).click();
  await next(page);
  await expect(page.locator(".card .item-name")).toHaveText("Green salsa");
  await expect(page.locator(".card .uses li")).toHaveText(["1 cup, for Pozole"]);
  await page.getByRole("button", { name: "Have it" }).click();
  await expect(page.getByRole("button", { name: /Green salsa/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Tomatillos/ })).toHaveCount(0);

  // Unpicking from the sheet drops the recipe and its choices.
  await page.getByRole("tab", { name: "Pick recipes" }).click();
  await page.getByRole("button", { name: "Pozole" }).click();
  await sheet.getByRole("button", { name: "Unpick" }).click();
  await expect(page.getByText("Tap the recipes you'll cook this week.")).toBeVisible();
});

test("collection chips combine, so two chips show recipes from either", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Recipes" }).click();
  const chips = page.getByRole("group", { name: "Collections" });
  const tiles = page.locator(".grid .tile .t");
  await expect(tiles).toHaveText(["Chili", "Cookies", "Pozole", "Salsa verde", "Tacos"]);

  await chips.getByRole("button", { name: "Easy Dinner" }).click();
  await expect(tiles).toHaveText(["Chili", "Tacos"]);
  await chips.getByRole("button", { name: "Desserts" }).click();
  await expect(tiles).toHaveText(["Chili", "Cookies", "Tacos"]);
  await expect(chips.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");

  // Turning one chip back off leaves the other on.
  await chips.getByRole("button", { name: "Easy Dinner" }).click();
  await expect(tiles).toHaveText(["Cookies"]);
  await expect(chips.getByRole("button", { name: "Desserts" })).toHaveAttribute("aria-pressed", "true");

  await chips.getByRole("button", { name: "All" }).click();
  await expect(tiles).toHaveCount(5);
  await expect(chips.getByRole("button", { name: "Desserts" })).toHaveAttribute("aria-pressed", "false");

  // Pick recipes in the weekly order works the same way.
  await page.getByRole("link", { name: "Order" }).click();
  await chips.getByRole("button", { name: "Easy Dinner" }).click();
  await chips.getByRole("button", { name: "Desserts" }).click();
  await expect(page.locator(".grid .tile .t")).toHaveText(["Chili", "Cookies", "Tacos"]);
});

test("every step can be skipped", async ({ page }) => {
  await login(page);
  await page.getByRole("tab", { name: "Anything else" }).click();
  await expect(page.getByRole("heading", { name: "Anything else" })).toBeVisible();
  await page.getByLabel("Search the catalog").fill("Toilet");
  await page.getByRole("button", { name: /Toilet paper/ }).click();
  await next(page);
  await expect(page.getByRole("link", { name: "Fill my Amazon cart" })).toHaveAttribute(
    "href",
    "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B000000001&Quantity.1=1",
  );
});

test("pasting a product link in the catalog links the grocery", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Catalog" }).click();
  await page.getByLabel("Search groceries").fill("Flour");
  await page.getByRole("link", { name: /Flour/ }).click();
  await page.getByLabel(/product link/).fill("https://www.walmart.com/ip/Great-Value-All-Purpose-Flour-5-lb/10535103?sid=abc");
  await expect(page.getByText("Walmart product 10535103")).toBeVisible();
  await page.getByLabel("Product name").fill("Great Value flour");
  await page.getByLabel("Size").fill("5 lb");
  await page.getByRole("button", { name: "Link product" }).click();
  await expect(page.getByText("Great Value flour, 5 lb")).toBeVisible();
});
