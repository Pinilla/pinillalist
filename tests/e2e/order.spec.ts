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

  // 2. Stock check: Onion merges both recipes' buying amounts.
  await expect(page.getByRole("heading", { name: "Stock check" })).toBeVisible();
  await expect(page.locator(".card .item-name")).toHaveText("Onion");
  await expect(page.locator(".card")).toContainText("3 onions, for Chili and Tacos");
  await page.getByRole("button", { name: "Need all of it" }).click();
  await expect(page.locator(".card")).toContainText("Yellow onions, 3 lb bag");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.locator(".card .item-name")).toHaveText("Ground beef");
  await expect(page.locator(".card")).toContainText("1 lb, for Chili");
  await page.getByRole("button", { name: "Have it" }).click();

  // Cumin has no buying amount, so the card shows the cooking amount and offers to set one.
  await expect(page.locator(".card .item-name")).toHaveText("Cumin");
  await expect(page.locator(".card")).toContainText("Chili uses 1 tsp");
  await page.getByRole("button", { name: "Set the buying amount" }).click();
  await page.getByLabel(/Buying amount/).fill("1");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.locator(".card")).toContainText("1 cumin, for Chili");
  await page.getByRole("button", { name: "Need some of it" }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".card")).toContainText("No product is linked yet");
  await page.getByRole("button", { name: "Done" }).click();

  await expect(page.locator(".card .item-name")).toHaveText("Tortillas");
  await page.getByRole("button", { name: "Need all of it" }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Done" }).click();

  // Summary after the last card. Change Ground beef from the summary.
  await expect(page.getByText("3 of 4 to buy.")).toBeVisible();
  await page.getByRole("button", { name: /Ground beef/ }).click();
  await expect(page.locator(".card .item-name")).toHaveText("Ground beef");
  await page.getByRole("button", { name: "Need all of it" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("4 of 4 to buy.")).toBeVisible();
  await next(page);

  // 3. Essentials: the deli cheese is sold by the pound.
  await page.getByRole("button", { name: "Deli American cheese", exact: true }).click();
  await page.getByRole("group", { name: "How many Deli American cheese" }).getByRole("button", { name: "More" }).click();
  await next(page);

  // 4. Anything else: a grocery that isn't in the catalog yet.
  await page.getByLabel("Search the catalog").fill("Bananas");
  await page.getByRole("button", { name: /Add "Bananas" as a new grocery/ }).click();
  await expect(page.locator(".list").getByText("Bananas")).toBeVisible();
  await next(page);

  // 5. Fill carts
  const walmart = page.getByRole("link", { name: "Fill my Walmart cart" });
  const amazon = page.getByRole("link", { name: "Fill my Amazon cart" });
  await expect(walmart).toHaveAttribute(
    "href",
    "https://www.walmart.com/sc/cart/addToCart?items=51259212_1,10450114_1,22222222_1.25",
  );
  await expect(amazon).toHaveAttribute("href", "https://www.amazon.com/gp/aws/cart/add.html?ASIN.1=B07XJ8C8F5&Quantity.1=2");
  const byHand = page.locator("section", { hasText: "Add these by hand" });
  await expect(byHand).toContainText("Cumin");
  await expect(byHand).toContainText("Bananas");

  // Removing an item takes it out of the link.
  await page.getByRole("button", { name: "Remove Ground beef" }).click();
  await expect(walmart).toHaveAttribute("href", "https://www.walmart.com/sc/cart/addToCart?items=51259212_1,22222222_1.25");
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
  await expect(page.getByRole("heading", { name: "Stock check" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Stock check" })).toBeVisible();
  await expect(page.locator(".card .item-name")).toHaveText("Flour");
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
