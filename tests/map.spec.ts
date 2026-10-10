import { test, expect } from "@playwright/test";
import { createExpression } from "@maplibre/maplibre-gl-style-spec";
import { englishMapStyle } from "../web/src/map-style";
import { mockWildfire } from "./wildfire-fixture";

test("map names prefer English and transliterate Greek-only source labels", () => {
  const style = englishMapStyle({
    version: 8,
    sources: {},
    layers: [
      {
        id: "places",
        type: "symbol",
        layout: { "text-field": ["get", "name"] },
      },
    ],
  });
  const layer = style.layers[0]!;
  if (layer.type !== "symbol") throw new Error("Expected a symbol layer");
  const expression = createExpression(
    layer.layout!["text-field"],
    "layers[0].layout.text-field",
  );
  if (expression.result === "error")
    throw new Error(JSON.stringify(expression.value));
  const label = (properties: Record<string, string>) =>
    expression.value.evaluate({ zoom: 12 }, { type: "Point", properties });
  expect(label({ name: "Άγιος Μύρωνας" })).toBe("Agios Myronas");
  expect(label({ name: "Πρινιάς", "name:en": "Prinias" })).toBe("Prinias");
  expect(label({ name: "Πρινιάς", name_en: "", "name:latin": "Πρινιάς" })).toBe(
    "Prinias",
  );
  expect(label({ name: "Μούλια" })).toBe("Moulia");
});

test.beforeEach(async ({ page }) => {
  await mockWildfire(page);
  await page.addInitScript(() =>
    localStorage.setItem("estia:collection", "demo"),
  );
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.abort(),
  );
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.abort(),
  );
});

test("the bundled vector worker renders a map without remote tile dependencies", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  // This small, synthetic GeoJSON still passes through MapLibre's real worker.
  // A nonexistent worker URL leaves the map loading and fails this assertion.
  await page.route("https://tiles.openfreemap.org/styles/positron", (route) =>
    route.fulfill({
      json: {
        version: 8,
        sources: {
          test: {
            type: "geojson",
            data: {
              type: "Feature",
              properties: {},
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [20, 35],
                    [27, 35],
                    [27, 41],
                    [20, 41],
                    [20, 35],
                  ],
                ],
              },
            },
          },
        },
        layers: [
          {
            id: "water",
            type: "background",
            paint: { "background-color": "#dce9e8" },
          },
          {
            id: "fixture-land",
            type: "fill",
            source: "test",
            paint: { "fill-color": "#becdaf" },
          },
        ],
      },
    }),
  );
  await page.goto("/");
  await expect(page.locator(".leaflet-host")).toHaveAttribute(
    "data-map-state",
    "ready",
    { timeout: 20_000 },
  );
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
  await expect(page.locator(".map-fallback")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("an unavailable map service keeps the local Greece overview visible when a property is selected", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".leaflet-host")).toHaveAttribute(
    "data-map-state",
    "fallback",
  );
  await page.getByRole("button", { name: "Show listing view" }).click();
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "On map", exact: true })
    .click();
  await expect(page.locator(".map-fallback")).toContainText(
    "street tiles unavailable",
  );
  await expect(page.locator(".overview-label.country")).toBeInViewport();
  await expect(
    page.locator(".leaflet-overview-pane path").first(),
  ).toBeAttached();
  await expect(page.locator(".map-preview")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
