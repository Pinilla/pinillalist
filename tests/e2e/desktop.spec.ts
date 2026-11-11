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

test("Back and Next are centered on every step, above the recipes on Pick recipes and under the content after", async ({ page }) => {
  await login(page);
  const foot = page.locator(".sticky-foot");
  const body = page.locator(".step-body");
  const main = page.locator("main.order");
  const place = async () => {
    const buttons = foot.getByRole("button");
    const first = (await buttons.first().boundingBox())!;
    const last = (await buttons.last().boundingBox())!;
    const [b, m] = [(await body.boundingBox())!, (await main.boundingBox())!];
    expect(Math.abs((first.x + last.x + last.width) / 2 - (m.x + m.width / 2))).toBeLessThan(2);
    return { top: first.y, bottom: first.y + first.height, bodyTop: b.y, bodyBottom: b.y + b.height };
  };

  // Pick recipes: no Back button, and Next sits above the grid and stays on screen while scrolling.
  await expect(page.getByRole("button", { name: "Back" })).toHaveCount(0);
  const pick = await place();
  expect(pick.bottom).toBeLessThanOrEqual(pick.bodyTop);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.getByRole("button", { name: "Next: Stock check" })).toBeInViewport();

  for (const step of ["Stock check", "Anything else"]) {
    await page.getByRole("tab", { name: step }).click();
    await expect(page.getByRole("heading", { name: step })).toBeVisible();
    const p = await place();
    expect(p.top).toBeGreaterThanOrEqual(p.bodyBottom);
  }
  await expect(page.getByRole("button", { name: "Back" })).toBeVisible();
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
