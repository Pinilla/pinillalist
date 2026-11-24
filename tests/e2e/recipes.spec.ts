import { expect, test, type Page } from "@playwright/test";

const PASSWORD = "e2e household password";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Pick recipes" })).toBeVisible();
}

async function savedRecipe(page: Page, id: string) {
  const recipe = await (await page.request.get(`/api/recipes/${id}`)).json();
  const ingredients = recipe.ingredients.map(
    ({ id: _id, groceryId: _groceryId, ...rest }: Record<string, unknown>) => rest,
  );
  return { ...recipe, ingredients };
}

test("a recipe made in the editor shows on its page and saves again unchanged", async ({
  page,
}) => {
  await login(page);
  await page.goto("/recipes/new");

  await page.getByLabel("Name", { exact: true }).fill("Green chile stew");
  await page.getByRole("button", { name: "Easy Dinner" }).click();
  await page.getByLabel("Prep minutes").fill("20");
  await page.getByLabel("Cook minutes").fill("45");
  await page.getByLabel("Servings").fill("4");
  await page.getByLabel("Rating").selectOption("3");

  const rows = page.locator(".ing-row");
  await rows.nth(0).getByLabel("Grocery").fill("Onion");
  await rows.nth(0).getByLabel("Cooking amount").fill("1");
  await rows.nth(0).getByLabel("Preparation").fill("diced");
  await page.getByRole("button", { name: "Add heading" }).click();
  await rows.nth(1).getByLabel("Section heading").fill("For the stew");
  await rows.nth(1).getByRole("button", { name: "Move up" }).click();
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await rows.nth(2).getByLabel("Grocery").fill("Green salsa");
  await rows.nth(2).getByLabel("Optional").check();
  await rows.nth(2).getByLabel("Made from recipe").selectOption({ label: "Salsa verde" });
  await page.getByLabel("Steps").fill("Chop the onion.\n\nSimmer an hour.");

  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Green chile stew" })).toBeVisible();
  await expect(page.getByText("Serves 4 · Prep 20 min · Cook 45 min · ★★★")).toBeVisible();
  await expect(page.locator(".li").first()).toHaveText("For the stew");
  await expect(page.locator(".li").nth(1)).toHaveText("1 Onion, diced");
  await expect(page.locator(".li").nth(2)).toContainText("Made from Salsa verde");
  await expect(page.locator(".li").nth(2)).toContainText("optional");
  await expect(page.getByRole("listitem").filter({ hasText: "Simmer an hour." })).toBeVisible();

  const id = page.url().split("/").pop()!;
  const before = await savedRecipe(page, id);
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Green chile stew");
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Green chile stew" })).toBeVisible();
  expect(await savedRecipe(page, id)).toEqual(before);
});
