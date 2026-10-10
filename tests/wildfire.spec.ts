import { test, expect, type Page } from "@playwright/test";
import { mockWildfire, wildfireFixture } from "./wildfire-fixture";

test.beforeEach(async ({ page }) => {
  await mockWildfire(page);
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://static-cz.car.gr/**", (route) => route.abort());
});

async function openListing(page: Page) {
  await page.goto("/");
  await page.getByRole("article").first().locator(".card-title").click();
  return page.getByRole("dialog", { name: "A closer look" });
}

test("area wildfire context is sourced, scoped and usable on a small phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  const detail = await openListing(page);
  const wildfire = detail.getByRole("region", { name: "Wildfire exposure" });
  await expect(wildfire).toContainText("Area context: predominantly high risk");
  await expect(wildfire).toContainText(
    "village area, exact property position unknown",
  );
  await expect(wildfire).toContainText("2022 model · 12.5 km grid");
  await expect(wildfire).toContainText(
    "not the individual plot or today’s fire danger",
  );
  await expect(
    wildfire.getByRole("link", { name: /Copernicus EFFIS/ }),
  ).toHaveAttribute("href", wildfireFixture.sourceUrl);
  await expect(
    wildfire.getByRole("link", { name: /daily fire-danger maps/ }),
  ).toHaveAttribute("href", wildfireFixture.dailyForecastUrl);
  await expect(wildfire.locator(".wildfire-method")).not.toHaveAttribute(
    "open",
    "",
  );
  await wildfire.getByText("What the area classification means").click();
  await expect(wildfire).toContainText(
    "not the chance that this property will burn",
  );
  await expect(
    wildfire.locator(".evidence-list > div").first().locator("dt"),
  ).toHaveText("High risk class");
  await expect(
    wildfire.locator(".evidence-list > div").first().locator("dd"),
  ).toHaveText("100%");
  expect(await detail.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});

for (const status of ["unavailable", "no-location"] as const) {
  test(`wildfire ${status} stays unknown rather than appearing low risk`, async ({
    page,
  }) => {
    await mockWildfire(page, {
      status,
      riskClass: null,
      classShares: null,
      location: status === "no-location" ? null : wildfireFixture.location,
      message:
        status === "no-location"
          ? "The listing has no reliable position for an area lookup."
          : "The public dataset could not be retrieved; risk remains unknown.",
    });
    const detail = await openListing(page);
    const wildfire = detail.getByRole("region", { name: "Wildfire exposure" });
    await expect(wildfire).toContainText(
      status === "no-location"
        ? "A reliable location is needed"
        : "Area assessment unavailable",
    );
    await expect(wildfire).not.toContainText("predominantly low risk");
    await expect(wildfire.locator(".wildfire-method")).toHaveCount(0);
    await expect(detail.locator(".score-section")).toBeVisible();
  });
}

test("a cached wildfire assessment clearly reports its failed refresh", async ({
  page,
}) => {
  await mockWildfire(page, { stale: true });
  const detail = await openListing(page);
  const wildfire = detail.getByRole("region", { name: "Wildfire exposure" });
  await expect(wildfire).toContainText("Area context: predominantly high risk");
  await expect(wildfire.getByRole("status")).toContainText(
    "Showing a saved assessment; the latest refresh was unavailable",
  );
  await expect(wildfire).toContainText("Retrieved 10/10/2026");
});

test("an assessment request failure can be retried without losing the listing", async ({
  page,
}) => {
  await page.route("**/api/listings/*/wildfire", (route) =>
    route.fulfill({ status: 503, body: "{}" }),
  );
  const detail = await openListing(page);
  const wildfire = detail.getByRole("region", { name: "Wildfire exposure" });
  await expect(wildfire).toContainText("Risk remains unknown");
  await mockWildfire(page);
  await wildfire.getByRole("button", { name: "Try again" }).click();
  await expect(wildfire).toContainText("Area context: predominantly high risk");
  await expect(detail.locator(".detail-price")).toBeVisible();
});

test("strong fit with sparse information keeps evidence coverage and missing essentials visible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(
    "**/api/listings?status=all&collection=live",
    async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const listing = data.listings.find(
        (p: { status: string }) => p.status === "needs-checking",
      );
      listing.score = 87.5;
      listing.scoreCoverage = 30;
      listing.reasons = [
        {
          criterion: "infrastructure",
          label: "Infrastructure",
          points: 10,
          assessedPoints: 10,
          maxPoints: 25,
          reason: "Electricity is reported; other utilities are unknown.",
        },
        {
          criterion: "permits",
          label: "Building permits",
          points: 0,
          assessedPoints: 0,
          maxPoints: 20,
          reason: "Permit information is unknown and is not assessed.",
        },
        {
          criterion: "space",
          label: "Around 100 m² built",
          points: 6.25,
          assessedPoints: 10,
          maxPoints: 10,
          reason: "160 m² built; 100 m² is optimal.",
        },
        {
          criterion: "budget",
          label: "Within purchase budget",
          points: 10,
          assessedPoints: 10,
          maxPoints: 10,
          reason: "The asking price is within €300,000.",
        },
      ];
      data.listings = [listing];
      data.summary = {
        ...data.summary,
        eligible: 0,
        needsChecking: 1,
        excluded: 0,
      };
      await route.fulfill({ response, json: data });
    },
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Needs checking", exact: false })
    .click();
  await expect(page.getByRole("article").locator(".score-badge")).toHaveText(
    "Unconfirmed",
  );
  await page.getByRole("article").locator(".card-title").click();
  const detail = page.getByRole("dialog", { name: "A closer look" });
  await expect(detail.locator(".detail-fit")).toContainText("87.5/100");
  await expect(detail.locator(".detail-fit")).toContainText("30% assessed");
  await expect(detail.locator(".score-coverage")).toContainText(
    "30% of weighted priorities have reported facts",
  );
  const permits = detail
    .locator(".score-reason")
    .filter({ hasText: "Building permits" });
  await expect(permits.locator("summary")).toContainText("Not assessed");
  await expect(permits.locator("summary")).not.toContainText("0.00");
  await expect(detail).toContainText(
    "A high fit score does not confirm missing essentials",
  );
  expect(await detail.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
});
