import { chromium, type Browser, type BrowserContext } from "playwright";
import { allowedUrl } from "./network.js";
import { identifyListing } from "./sites/registry.js";

/** Ordinary installed browser, isolated from the user's accounts. No stealth or CAPTCHA solver. */
export function publicBrowser() {
  let browser: Browser | undefined;
  let context: BrowserContext | undefined;
  return {
    async read(raw: string): Promise<string> {
      const url = allowedUrl(raw);
      if (!browser) {
        browser = await chromium.launch({
          channel: process.env.SEARCH_BROWSER_CHANNEL || (process.platform === "win32" ? "msedge" : "chromium"),
          headless: process.env.SEARCH_BROWSER_HEADLESS === "true",
          args: process.platform === "win32" ? ["--start-minimized"] : [],
        });
        context = await browser.newContext({ locale: "en-GB", acceptDownloads: false });
      }
      const page = await context!.newPage();
      let lastStatus = 0;
      const target = identifyListing(raw);
      await page.route("**/*", async route => {
        const request = route.request();
        if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
          try {
            const next = allowedUrl(request.url());
            if (next.hostname.replace(/^www\./, "") !== url.hostname.replace(/^www\./, "")) throw Error();
            const nextTarget = identifyListing(next.href);
            if (target && (nextTarget?.sourceId !== target.sourceId || nextTarget?.externalId !== target.externalId)) throw Error();
          } catch { await route.abort(); return; }
        }
        if (["image", "media", "font"].includes(request.resourceType())) { await route.abort(); return; }
        await route.continue();
      });
      page.on("response", response => {
        if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) lastStatus = response.status();
      });
      try {
        await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30000 });
        // Allow the website's normal JavaScript load to finish; never interact with challenges.
        if (/just a moment|checking your browser/i.test(await page.title())) {
          await page.waitForFunction(() => !/just a moment|checking your browser/i.test(document.title), undefined, { timeout: 20000 }).catch(() => {});
        }
        if (lastStatus >= 400) throw new Error("HTTP " + lastStatus + " from " + url.hostname);
        const html = await page.content();
        if (Buffer.byteLength(html) > 2_000_000) throw new Error("Website response exceeded the 2 MB limit.");
        if (/just a moment|access denied|verify you are human/i.test(await page.title())) throw new Error("Website requires a human check.");
        return html;
      } finally { await page.close(); }
    },
    async close() { await browser?.close(); browser = undefined; context = undefined; },
  };
}
