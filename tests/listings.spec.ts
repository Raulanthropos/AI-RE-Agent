import { expect, test } from '@playwright/test';

test('worker → SQLite → REST → browser shows scores, duplicate sources, and exclusions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(7);
  const first = page.getByRole('article').first();
  await expect(first.getByRole('heading', { name: 'A fresh start in Sepolia' })).toBeVisible();
  await expect(first.getByLabel('Score 80.1 out of 100')).toBeVisible();
  await first.locator('summary').click();
  await expect(first.locator('.reason')).toHaveCount(5);
  await expect(first.getByText('Budget headroom', { exact: true })).toBeVisible();
  await expect(first.getByText(/Full points at €100,000/)).toBeVisible();

  await page.getByRole('textbox', { name: 'Search properties' }).fill('κυψελη');
  await expect(page.getByRole('article')).toHaveCount(1);
  const duplicate = page.getByRole('article');
  await expect(duplicate.locator('.price')).toContainText('€132,000');
  await expect(duplicate.getByRole('link')).toHaveCount(2);
  await expect(duplicate.getByRole('link').first()).toHaveAttribute('href', 'https://attica-homes.example/property/101');
  await expect(duplicate.getByText('2 sources · duplicates merged')).toBeVisible();

  await page.getByRole('textbox', { name: 'Search properties' }).clear();
  await page.getByRole('button', { name: 'Excluded 5', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(5);
  await expect(page.getByText('Asking price €320,000 exceeds €250,000.', { exact: true })).toBeVisible();
  await expect(page.getByText('Listing is not for sale.', { exact: true })).toBeVisible();
  await expect(page.locator('.score-details')).toHaveCount(0);
  await page.getByRole('button', { name: 'All properties 12', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('article')).toHaveCount(12);
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  await page.getByRole('button', { name: 'Matches 7', exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.screenshot({ path: 'test-results/desktop-top.png' });
});

test('mobile search, sorting, and empty search state work without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('article')).toHaveCount(7);
  await page.getByRole('combobox', { name: 'Sort listings' }).selectOption('price');
  await expect(page.getByRole('article').first().locator('.price')).toContainText('€98,000');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Search properties' }).fill('no matching property');
  await expect(page.getByRole('heading', { name: 'No properties in this view.' })).toBeVisible();
});

test('API failure is explained and retry loads real data', async ({ page }) => {
  await page.route('**/api/listings?status=all', route => route.fulfill({ status: 503, body: 'Unavailable' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Check that the local server is running');
  await page.unroute('**/api/listings?status=all');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByRole('article')).toHaveCount(7);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
