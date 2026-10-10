import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
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

test("internet collection defaults to matches, separates unconfirmed leads and exposes evidence", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Listing collection" }),
  ).toHaveValue("live");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Matches", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("article")).toContainText(
    "Source page · reported details",
  );
  await page
    .getByRole("button", { name: "Needs checking", exact: false })
    .click();
  await expect(page.locator(".unconfirmed-note")).toContainText(
    "Every lead reports at least 800 m² of land",
  );
  await expect(page.locator(".results-toolbar")).toContainText(
    "1 unconfirmed leads",
  );
  await expect(page.getByRole("article")).toContainText(
    "Search snippet · unconfirmed",
  );
  await expect(page.getByRole("article")).toContainText("€240,000");
  await expect(page.getByRole("article").locator(".score-badge")).toHaveText(
    "Unconfirmed",
  );
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
  await expect(
    detail.getByRole("heading", { name: "Provisional score", exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("button", { name: "Matches", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Listing collection" }),
  ).toHaveValue("live");
});

for (const landSqm of [null, 799]) {
  test(`a 392 m² building with ${landSqm ?? "unknown"} m² land never appears in browse views or saved places`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() =>
      localStorage.setItem("estia:saved:v1", JSON.stringify(["unknown-land"])),
    );
    await page.route(
      "**/api/listings?status=all&collection=live",
      async (route) => {
        const response = await route.fetch();
        const data = await response.json();
        const lead = data.listings.find(
          (listing: { status: string }) => listing.status === "needs-checking",
        );
        data.listings = [
          {
            ...lead,
            id: "unknown-land",
            title: "House 392 m² for sale",
            english: undefined,
            areaSqm: 392,
            landSqm,
            priceEur: 39000,
            eligible: false,
            status: "excluded",
            score: null,
            reasons: [],
            filterReasons: [
              "The plot size is unspecified; at least 800 m² of land must be stated.",
            ],
            missingDetails: [],
          },
        ];
        data.summary = {
          ...data.summary,
          properties: 1,
          eligible: 0,
          needsChecking: 0,
          excluded: 1,
        };
        await route.fulfill({ response, json: data });
      },
    );
    await page.goto("/");
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "No matches confirmed yet." }),
    ).toBeVisible();
    await expect(page.locator(".empty-state")).toContainText(
      "a stated plot of at least 800 m²",
    );
    await expect(
      page.getByRole("button", { name: /Review .* unconfirmed leads/ }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Needs checking", exact: false })
      .click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator(".price-pin")).toHaveCount(0);
    await page
      .getByRole("button", { name: "Outside brief", exact: false })
      .click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator(".price-pin")).toHaveCount(0);
    await page.getByRole("button", { name: "Saved", exact: false }).click();
    await expect(page.getByRole("article")).toHaveCount(0);
    await expect(page.locator(".price-pin")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "A place for your favourites." }),
    ).toBeVisible();
  });
}

test("a listing with exactly 800 m² of reported land can appear in matches", async ({
  page,
}) => {
  await page.route(
    "**/api/listings?status=all&collection=live",
    async (route) => {
      const response = await route.fetch();
      const data = await response.json();
      const listing = data.listings.find(
        (p: { status: string }) => p.status === "eligible",
      );
      data.listings = [{ ...listing, landSqm: 800 }];
      data.summary = {
        ...data.summary,
        properties: 1,
        eligible: 1,
        needsChecking: 0,
        excluded: 0,
      };
      await route.fulfill({ response, json: data });
    },
  );
  await page.goto("/");
  await expect(page.getByRole("article")).toHaveCount(1);
  await expect(page.getByRole("article")).toContainText("800 m² land");
  await expect(page.locator(".brief-chips")).toContainText("800+ m² land");
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
