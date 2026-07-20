/**
 * Cashify Price Scraper — Vercel Compatible
 * ------------------------------------------
 * Uses @sparticuz/chromium-min + puppeteer-core so it runs
 * inside Vercel serverless functions without bundling Chromium.
 *
 * Strategy (in order):
 *   1. Cashify internal REST API (no browser, fastest, works on free tier)
 *   2. puppeteer-core + @sparticuz/chromium (fallback, needs Vercel Pro / 60s timeout)
 */

// ─────────────────────────────────────────────────────────────
// IN-MEMORY CACHE (module-level, persists across warm invocations)
// ─────────────────────────────────────────────────────────────
const priceCache = new Map<string, { price: number; ts: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function cacheKey(brand: string, model: string, storage: string, condition: string) {
  return `${brand}:${model}:${storage}:${condition}`.toLowerCase().replace(/\s+/g, '_');
}
function fromCache(key: string): number | null {
  const e = priceCache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_TTL_MS) { priceCache.delete(key); return null; }
  return e.price;
}
function toCache(key: string, price: number) {
  priceCache.set(key, { price, ts: Date.now() });
}

// ─────────────────────────────────────────────────────────────
// CONDITION MAPPING
// ─────────────────────────────────────────────────────────────
const CONDITION_MAP: Record<string, string> = {
  excellent: 'Like New',
  good: 'Good',
  average: 'Fair',
};

// ─────────────────────────────────────────────────────────────
// STRATEGY 1: Cashify REST API (no browser needed)
// ─────────────────────────────────────────────────────────────
async function fetchViaCashifyAPI(
  brand: string,
  model: string,
  storage: string,
  condition: string
): Promise<number | null> {
  try {
    // Common headers to mimic a real browser
    const headers: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
      'Accept-Language': 'en-IN,en;q=0.9',
      Referer: 'https://www.cashify.in/sell-old-phone',
      Origin: 'https://www.cashify.in',
    };

    // Cashify's internal API base (discovered from their web app network calls)
    const apiBase = 'https://www.cashify.in';

    // Build a search query slug: "Apple iPhone 13 128GB"
    const query = encodeURIComponent(`${brand} ${model} ${storage}`);

    // Try Cashify's internal search/quote endpoint
    const endpoints = [
      `${apiBase}/api/product/get-sell-devices?search=${encodeURIComponent(`${model} ${storage}`)}&brand=${encodeURIComponent(brand)}`,
      `${apiBase}/api/resale-value?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}&storage=${encodeURIComponent(storage)}&condition=${encodeURIComponent(CONDITION_MAP[condition] || condition)}`,
      `${apiBase}/api/sell/quote?q=${query}`,
    ];

    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers,
          signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) continue;

        const text = await res.text();
        const price = extractPriceFromJson(text);
        if (price) {
          console.log(`[CashifyScraper] API hit: ${url} → ₹${price}`);
          return price;
        }
      } catch {
        continue;
      }
    }

    // Try fetching the __NEXT_DATA__ from Cashify's sell page for this device
    const slug = `${brand}-${model}-${storage}`
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const pageUrl = `${apiBase}/sell-${slug}`;
    const pageRes = await fetch(pageUrl, {
      headers: { ...headers, Accept: 'text/html' },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    if (pageRes?.ok) {
      const html = await pageRes.text();
      const price = extractPriceFromHtml(html);
      if (price) {
        console.log(`[CashifyScraper] HTML page hit: ${pageUrl} → ₹${price}`);
        return price;
      }
    }

    return null;
  } catch (err: any) {
    console.error('[CashifyScraper] fetchViaCashifyAPI error:', err.message);
    return null;
  }
}

/** Extract price from JSON response string */
function extractPriceFromJson(text: string): number | null {
  try {
    // Look for price-like fields in JSON
    const patterns = [
      /"(?:maxPrice|sellingPrice|price|quotePrice|resalePrice|estimatedPrice|bestPrice)"\s*:\s*(\d{4,6})/g,
    ];
    for (const pattern of patterns) {
      const matches = [...text.matchAll(pattern)];
      for (const m of matches) {
        const p = parseInt(m[1], 10);
        if (p >= 500 && p <= 200000) return p;
      }
    }
  } catch {}
  return null;
}

/** Extract price from HTML page (__NEXT_DATA__ or DOM) */
function extractPriceFromHtml(html: string): number | null {
  // Try __NEXT_DATA__ JSON blob
  const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    const price = extractPriceFromJson(nextDataMatch[1]);
    if (price) return price;
  }

  // Try ₹ price patterns in HTML
  const priceMatches = [...html.matchAll(/₹\s*([\d,]+)/g)];
  for (const m of priceMatches) {
    const p = parseInt(m[1].replace(/,/g, ''), 10);
    if (p >= 1000 && p <= 200000) return p;
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// STRATEGY 2: puppeteer-core + @sparticuz/chromium (Vercel Pro)
// ─────────────────────────────────────────────────────────────
async function fetchViaPuppeteer(
  brand: string,
  model: string,
  storage: string,
  condition: string
): Promise<number | null> {
  // Dynamically import to avoid issues when these packages aren't installed
  let chromium: any, puppeteerCore: any;
  try {
    chromium = (await import('@sparticuz/chromium-min')).default;
    puppeteerCore = (await import('puppeteer-core')).default;
  } catch {
    console.log('[CashifyScraper] puppeteer-core or chromium-min not available, skipping browser scrape');
    return null;
  }

  let browser = null;
  try {
    const executablePath = await chromium.executablePath(
      // This URL is the remote Chromium binary for serverless environments
      `https://github.com/Sparticuz/chromium/releases/download/v123.0.0/chromium-v123.0.0-pack.tar`
    );

    browser = await puppeteerCore.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36'
    );

    // Build slug and try direct Cashify URL
    const slug = `${brand}-${model}-${storage}`
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    await page.goto(`https://www.cashify.in/sell-${slug}`, {
      waitUntil: 'networkidle2',
      timeout: 25000,
    });

    // Extract __NEXT_DATA__ from page
    const nextData = await page.evaluate(() => {
      const el = document.getElementById('__NEXT_DATA__');
      return el ? el.textContent : null;
    });

    if (nextData) {
      const price = extractPriceFromJson(nextData);
      if (price) {
        console.log(`[CashifyScraper] Puppeteer hit: ₹${price}`);
        return price;
      }
    }

    // Try reading visible price from DOM
    const domPrice = await page.evaluate(() => {
      const selectors = ['[class*="price"]', '[class*="quote"]', 'h1', 'h2', 'strong'];
      for (const sel of selectors) {
        for (const el of document.querySelectorAll(sel)) {
          const m = el.textContent?.match(/₹\s*([\d,]+)/);
          if (m) {
            const p = parseInt(m[1].replace(/,/g, ''), 10);
            if (p >= 1000 && p <= 200000) return p;
          }
        }
      }
      return null;
    });

    return domPrice;
  } catch (err: any) {
    console.error('[CashifyScraper] Puppeteer error:', err.message);
    return null;
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────
export interface CashifyPriceResult {
  price: number | null;
  source: 'cashify_api' | 'cashify_browser' | 'cache' | 'failed';
  cached: boolean;
}

export async function getCashifyPrice(
  brand: string,
  model: string,
  storage: string,
  condition: string
): Promise<CashifyPriceResult> {
  const key = cacheKey(brand, model, storage, condition);

  // Check cache
  const cached = fromCache(key);
  if (cached !== null) {
    console.log(`[CashifyScraper] Cache hit: ${key} → ₹${cached}`);
    return { price: cached, source: 'cache', cached: true };
  }

  // Strategy 1: Direct API / HTML fetch (works on Vercel free tier)
  const apiPrice = await fetchViaCashifyAPI(brand, model, storage, condition);
  if (apiPrice) {
    toCache(key, apiPrice);
    return { price: apiPrice, source: 'cashify_api', cached: false };
  }

  // Strategy 2: Puppeteer browser (works on Vercel Pro with 60s timeout)
  const browserPrice = await fetchViaPuppeteer(brand, model, storage, condition);
  if (browserPrice) {
    toCache(key, browserPrice);
    return { price: browserPrice, source: 'cashify_browser', cached: false };
  }

  return { price: null, source: 'failed', cached: false };
}

export { priceCache }; // export so cache endpoint can read it
