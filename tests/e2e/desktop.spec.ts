import { expect, test, type Page } from "@playwright/test";

// The desktop layout: a sidebar, a catalog table with a side panel, and lists side by side.
// These tests only read, so the phone tests that follow see the same seeded data.
test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

const PASSWORD = "e2e household password";

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Pick recipes" })).toBeVisible();
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBe(0);
}

test("the navigation is a sidebar on the left", async ({ page }) => {
  await login(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  const box = (await nav.boundingBox())!;
  expect(box.x + box.width).toBeLessThan(260);
  expect(box.height).toBeGreaterThan(150);
  // The page content starts to the right of the sidebar.
  const heading = (await page.getByRole("heading", { name: "Pick recipes" }).boundingBox())!;
  expect(heading.x).toBeGreaterThan(box.x + box.width);
  await expectNoSidewaysScroll(page);
});

test("picked recipes are listed beside the grid and every collection chip is visible", async ({ page }) => {
  await login(page);
  await page.getByRole("button", { name: "Chili", exact: true }).click();
  const picked = page.getByRole("complementary", { name: "Picked recipes" });
  await expect(picked).toContainText("Chili");
  await expect(page.getByRole("button", { name: "Desserts" })).toBeInViewport();
  await picked.getByRole("button", { name: "Unpick Chili" }).click();
  await expect(picked).toContainText("Nothing picked yet.");
  await expectNoSidewaysScroll(page);
});

test("the catalog is a sortable table and a grocery opens beside it", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Catalog" }).click();
  const names = page.locator(".table tbody tr td:first-child");
  await expect(names.first()).toBeVisible();
  const ascending = await names.allTextContents();
  expect(ascending).toEqual([...ascending].sort((a, b) => a.localeCompare(b)));

  await page.getByRole("button", { name: /^Grocery/ }).click();
  await expect(page.getByRole("columnheader", { name: /^Grocery/ })).toHaveAttribute("aria-sort", "descending");
  expect(await names.allTextContents()).toEqual([...ascending].reverse());

  await page.getByRole("link", { name: "Flour", exact: true }).click();
  await expect(page).toHaveURL(/\/catalog\/\d+$/);
  const panel = page.getByRole("complementary", { name: "Grocery details" });
  await expect(panel.getByRole("heading", { name: "Flour" })).toBeVisible();
  // The table is still on screen next to the panel.
  await expect(names.first()).toBeVisible();
  await panel.getByRole("link", { name: "Close" }).click();
  await expect(panel).toBeHidden();
  await expectNoSidewaysScroll(page);
});

test("lists show the index and the open list side by side", async ({ page }) => {
  await login(page);
  await page.getByRole("link", { name: "Lists" }).click();
  await expect(page.getByRole("heading", { name: "Lists", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Weekly Essentials" })).toBeVisible();
  await expect(page.getByText("Toilet paper")).toBeVisible();
  await expectNoSidewaysScroll(page);
});
