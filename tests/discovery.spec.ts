import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://static-cz.car.gr/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="460"><rect width="640" height="460" fill="#bdc9ad"/></svg>',
    }),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
});

test("internet collection defaults to unconfirmed leads, exposes evidence and keeps samples separate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Listing collection" }),
  ).toHaveValue("live");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(
    "Search snippet · unconfirmed",
  );
  await expect(page.getByRole("article")).toContainText("€240,000");
  await expect(page.locator(".price-pin")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "On map", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("article").locator(".card-footer a"),
  ).toHaveAttribute("href", /plot.gr/);
  await page.getByRole("article").locator(".card-title").click();
  const detail = page.getByRole("dialog", { name: "A closer look" });
  await expect(detail).toContainText("Search result only");
  await expect(detail).toContainText("has no map pin");
  await detail.getByText("Evidence behind the extracted details").click();
  await expect(detail.locator(".extraction-evidence")).toContainText("1200");
  await expect(detail).not.toContainText("Demo sources use");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Matches", exact: false }).click();
  await expect(page.locator(".price-pin")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText(
    "Source page · reported details",
  );
  await page
    .getByRole("combobox", { name: "Listing collection" })
    .selectOption("demo");
  await expect(page.getByRole("article")).toHaveCount(7);
  await expect(page.getByRole("article").first()).toContainText("demo");
  await page
    .getByRole("combobox", { name: "Listing collection" })
    .selectOption("live");
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Listing collection" }),
  ).toHaveValue("live");
});

test("mobile gallery displays original photographs, property facts and an image failure fallback", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Matches", exact: false }).click();
  const card = page.getByRole("article");
  await expect(card).toContainText("Source photo");
  await expect(card.locator("img")).toHaveAttribute(
    "src",
    /99999002_0_z.jpeg$/,
  );
  await card.locator(".card-title").click();
  const detail = page.getByRole("dialog", { name: "A closer look" });
  await expect(detail).toContainText("1950");
  await expect(detail).toContainText("Bedrooms");
  await expect(detail.locator(".gallery-controls")).toContainText("1 / 3");
  await detail.getByRole("button", { name: "Next photo" }).click();
  await expect(detail.locator(".gallery-frame img")).toHaveAttribute(
    "src",
    /99999002_1_z.jpeg$/,
  );
  await expect(detail.locator("figcaption a")).toHaveAttribute(
    "href",
    /plot.gr\/99999002/,
  );
  expect(await detail.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.route("https://static-cz.car.gr/99999002_2_z.jpeg", (route) =>
    route.abort(),
  );
  await detail.getByRole("button", { name: "Next photo" }).click();
  await expect(detail.locator(".photo-placeholder")).toContainText(
    "Photo unavailable",
  );
  await expect(detail.locator("figcaption a")).toBeVisible();
  await detail.getByRole("button", { name: "Previous photo" }).click();
  await expect(detail.locator(".gallery-frame img")).toHaveAttribute(
    "src",
    /99999002_1_z.jpeg$/,
  );
});

test("mobile internet search status explains partial results and controls remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", {
      name: /Search updated · some sources unavailable/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Search updated · some sources unavailable/ })
    .click();
  const status = page.getByRole("dialog", {
    name: "Internet search",
    exact: true,
  });
  await expect(status).toContainText("every 24 hours");
  await expect(status).toContainText("2 listings processed");
  await expect(status).toContainText("Source page unavailable");
  await expect(status).toContainText("no account, key or paid service");
  expect(await status.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Show listing view" }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  await page
    .getByRole("article")
    .getByRole("button", { name: /^Save / })
    .click();
  await page.getByRole("button", { name: "Saved", exact: false }).click();
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/internet-mobile.png",
    fullPage: true,
  });
});
