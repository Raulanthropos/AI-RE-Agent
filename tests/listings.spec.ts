import { test, expect } from "@playwright/test";

// The public OSM tile service prohibits headless bulk/bot tile use.
// Every browser test blocks remote tiles and exercises the bundled overview.
test.beforeEach(async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("connected map, score explanations, and source links work from the real API", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(7);
  await expect(page.locator(".price-pin")).toHaveCount(7);
  await expect(page.locator(".leaflet-control-attribution")).toBeInViewport();
  expect(
    await page
      .locator(".app-main")
      .evaluate((el) => el.getBoundingClientRect().height <= innerHeight),
  ).toBe(true);
  const first = page.getByRole("article").first();
  const id = await first.getAttribute("data-listing-id");
  await first.getByRole("button", { name: "On map", exact: true }).click();
  await expect(page.locator('[data-marker-id="' + id + '"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".map-preview")).toBeVisible();
  await page.locator(".map-preview").click();
  const detail = page.getByRole("dialog", { name: "A closer look" });
  await expect(detail).toContainText("Wildfire exposure");
  await expect(detail).toContainText("Not assessed");
  await expect(detail.locator(".source-list a")).toHaveCount(2);
  await expect(detail.locator(".score-reason")).toHaveCount(6);
  await detail
    .locator(".score-reason")
    .filter({ hasText: "Around 100 m² built" })
    .locator("summary")
    .click();
  await expect(detail).toContainText("there is no minimum building size");
  await page.keyboard.press("Escape");
  await expect(detail).not.toBeVisible();
  const other = page.getByRole("article").nth(2);
  const otherId = await other.getAttribute("data-listing-id");
  await page
    .locator('[data-marker-id="' + otherId + '"]')
    .click({ force: true });
  await expect(other).toHaveClass(/is-selected/);
  await expect(page.locator(".map-preview")).toContainText(
    await other.locator(".card-title").innerText(),
  );
  await page.getByRole("button", { name: "Needs checking" }).click();
  await expect(page.getByRole("article")).toHaveCount(2);
  await page.getByRole("button", { name: "Outside brief" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await page.getByRole("button", { name: "Matches" }).click();
  await page.getByRole("button", { name: "All Greece" }).click();
  await page.screenshot({
    path: "test-results/estia-desktop.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("search, sort, extras and saved places persist and stay connected to the map", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(7);
  await page.getByRole("textbox", { name: "Search places" }).fill("ΚΑΡΔΑΜΥΛΗ");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("button", {
      name: "Save A stone home among the olives",
      exact: true,
    })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Unsave A stone home among the olives",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Saved", exact: false })
    .first()
    .click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Explore", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Sort listings" })
    .selectOption("price");
  await expect(page.getByRole("article").first()).toContainText("€95,000");
  await expect(page.getByRole("article").first()).toContainText("No building");
  await page.getByRole("button", { name: "Filter by extras" }).click();
  await page.getByRole("checkbox", { name: "Barn / stable" }).check();
  await page
    .getByRole("button", { name: "Show 3 places", exact: true })
    .click();
  await expect(page.getByRole("article")).toHaveCount(3);
  await expect(page.locator(".price-pin")).toHaveCount(3);
  await page.getByRole("button", { name: "Refresh listings" }).click();
  await expect(page.getByRole("article")).toHaveCount(3);
});

test("mobile layout, map view, list view and dialogs fit a narrow touch screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(7);
  await expect(
    page.getByRole("navigation", { name: "Mobile navigation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Property map", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".leaflet-control-attribution")).toBeInViewport();
  expect(
    await page.locator(".leaflet-control-attribution").evaluate((el) => {
      const r = el.getBoundingClientRect();
      const panel = document
        .querySelector(".results-panel")
        .getBoundingClientRect();
      return r.bottom <= panel.top;
    }),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/estia-mobile-split.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Show listing view" }).click();
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: /^View / })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: "test-results/estia-mobile-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "On map", exact: true })
    .click();
  await expect(page.locator(".map-preview")).toBeVisible();
  await page.getByRole("button", { name: "Show listing view" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Your brief", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("100 m² built is ideal");
  await page.getByRole("button", { name: "Close dialog" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/estia-mobile-list.png",
    fullPage: true,
  });
});

test("API failure is recoverable and an empty shortlist has a useful state", async ({
  page,
}) => {
  await page.route("**/api/listings?status=all", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText(
    "Check that the local server is running",
  );
  await page.unroute("**/api/listings?status=all");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
  await page
    .getByRole("textbox", { name: "Search places" })
    .fill("No matching village");
  await expect(
    page.getByRole("heading", { name: "Nothing here just yet." }),
  ).toBeVisible();
  await expect(page.locator(".price-pin")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search and extras" }).click();
  await expect(page.getByRole("article")).toHaveCount(7);
});

test("small phones and tablets keep controls and details within the viewport", async ({
  page,
}) => {
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.getByRole("article")).toHaveCount(7);
    await page.getByRole("button", { name: "Show listing view" }).click();
    const panel = page.locator(".results-panel");
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    await page.getByRole("button", { name: "Filter by extras" }).click();
    const dialog = page.getByRole("dialog");
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    await page.getByRole("button", { name: "Close dialog" }).click();
    await page.getByRole("button", { name: "Show map view" }).click();
    await expect(page.locator(".leaflet-control-attribution")).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
