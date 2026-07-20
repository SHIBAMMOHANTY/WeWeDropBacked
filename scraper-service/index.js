/**
 * Cashify Price Scraper Microservice
 * ------------------------------------
 * Express server jo Puppeteer use karke Cashify se real resale price fetch karta hai.
 * Railway pe deploy hota hai, Vercel backend isse HTTP call se price maangta hai.
 *
 * Endpoints:
 *   GET /health
 *   GET /scrape?brand=Apple&model=iPhone+13&storage=128GB&condition=good
 */

const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealthPlugin());

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY || '';

// ─────────────────────────────────────────────────────────────
// IN-MEMORY CACHE (24 hour TTL)
// ─────────────────────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(brand, model, storage, condition) {
  return `${brand}:${model}:${storage}:${condition}`.toLowerCase().trim();
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.price;
}

function setCache(key, price) {
  cache.set(key, { price, timestamp: Date.now() });
}

// ─────────────────────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────────────────────

// API Key auth middleware
function authMiddleware(req, res, next) {
  // Skip auth if no API_KEY is configured (local dev)
  if (!API_KEY) return next();

  const providedKey = req.headers['x-api-key'];
  if (providedKey !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: Invalid API key' });
  }
  next();
}

// ─────────────────────────────────────────────────────────────
// CASHIFY SCRAPER LOGIC
// ─────────────────────────────────────────────────────────────

/**
 * Cashify brand name mapping.
 * Cashify mein kuch brands ke naam alag hote hain — ye mapping correct name ensure karta hai.
 */
const BRAND_MAP = {
  'apple': 'Apple',
  'samsung': 'Samsung',
  'oneplus': 'OnePlus',
  'one plus': 'OnePlus',
  'google': 'Google',
  'xiaomi': 'Xiaomi',
  'redmi': 'Redmi',
  'poco': 'POCO',
  'oppo': 'OPPO',
  'vivo': 'Vivo',
  'realme': 'Realme',
  'motorola': 'Motorola',
  'nokia': 'Nokia',
  'nothing': 'Nothing',
  'iqoo': 'iQOO',
  'asus': 'ASUS',
  'sony': 'Sony',
};

function normalizeBrand(brand) {
  return BRAND_MAP[brand.toLowerCase().trim()] || brand;
}

/**
 * Condition mapping: tumhara system → Cashify ka label
 */
const CONDITION_MAP = {
  'excellent': 'Like New',
  'good': 'Good',
  'average': 'Fair',
};

/**
 * Main scraping function.
 * Cashify ka sell flow navigate karke price extract karta hai.
 */
async function scrapeCashifyPrice(brand, model, storage, condition) {
  const cashifyBrand = normalizeBrand(brand);
  const cashifyCondition = CONDITION_MAP[condition.toLowerCase()] || 'Good';

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
        '--disable-extensions',
      ],
    });

    const page = await browser.newPage();

    // Human-like user agent set karo
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );

    // Viewport set karo
    await page.setViewport({ width: 1280, height: 720 });

    // Cashify sell page open karo
    console.log(`[Scraper] Navigating to Cashify for: ${cashifyBrand} ${model} ${storage} (${cashifyCondition})`);
    await page.goto('https://www.cashify.in/sell-old-phone', {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    // ── Step 1: Brand select ──────────────────────────────────
    const brandPrice = await trySelectBrandAndGetPrice(page, cashifyBrand, model, storage, cashifyCondition);
    if (brandPrice) return brandPrice;

    // Fallback: try direct model search URL
    const searchPrice = await trySearchUrl(page, cashifyBrand, model, storage, cashifyCondition);
    return searchPrice;

  } catch (err) {
    console.error('[Scraper] Error during scraping:', err.message);
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

/**
 * Try to navigate Cashify's sell flow by selecting brand → model → storage → condition
 */
async function trySelectBrandAndGetPrice(page, brand, model, storage, condition) {
  try {
    // Wait for brand selector to appear
    await page.waitForSelector('[class*="brand"], [data-brand], .brand-item, input[placeholder*="brand" i]', {
      timeout: 10000,
    }).catch(() => null);

    // Try clicking brand
    const brandClicked = await page.evaluate((brandName) => {
      // Look for brand buttons/links
      const allElements = document.querySelectorAll('button, a, div[role="button"], li');
      for (const el of allElements) {
        if (el.textContent.trim().toLowerCase() === brandName.toLowerCase()) {
          el.click();
          return true;
        }
      }
      return false;
    }, brand);

    if (!brandClicked) {
      console.log(`[Scraper] Could not click brand "${brand}" on sell page`);
      return null;
    }

    // Wait for model list to load
    await page.waitForTimeout(2000);

    // Try clicking model
    const modelClicked = await page.evaluate((modelName) => {
      const allElements = document.querySelectorAll('button, a, div[role="button"], li, [class*="model"]');
      // Try exact match first
      for (const el of allElements) {
        if (el.textContent.trim().toLowerCase() === modelName.toLowerCase()) {
          el.click();
          return true;
        }
      }
      // Try partial match
      for (const el of allElements) {
        if (el.textContent.trim().toLowerCase().includes(modelName.toLowerCase())) {
          el.click();
          return true;
        }
      }
      return false;
    }, model);

    if (!modelClicked) {
      console.log(`[Scraper] Could not click model "${model}"`);
      return null;
    }

    await page.waitForTimeout(2000);

    // Try clicking storage
    const storageClicked = await page.evaluate((storageVal) => {
      const allElements = document.querySelectorAll('button, a, div[role="button"], li');
      const normalizedStorage = storageVal.replace(/\s+/g, '').toLowerCase(); // "128GB" → "128gb"
      for (const el of allElements) {
        const text = el.textContent.trim().replace(/\s+/g, '').toLowerCase();
        if (text === normalizedStorage || text.includes(normalizedStorage)) {
          el.click();
          return true;
        }
      }
      return false;
    }, storage);

    if (!storageClicked) {
      console.log(`[Scraper] Could not click storage "${storage}"`);
      return null;
    }

    await page.waitForTimeout(2000);

    // Extract price — at this point many cashify flows show a price
    const priceAfterStorage = await extractPriceFromPage(page);
    if (priceAfterStorage) {
      console.log(`[Scraper] Got price after storage selection: ₹${priceAfterStorage}`);
      return priceAfterStorage;
    }

    // Try selecting condition
    const conditionClicked = await page.evaluate((cond) => {
      const allElements = document.querySelectorAll('button, a, div[role="button"], li, [class*="condition"]');
      for (const el of allElements) {
        if (el.textContent.trim().toLowerCase().includes(cond.toLowerCase())) {
          el.click();
          return true;
        }
      }
      return false;
    }, condition);

    if (conditionClicked) {
      await page.waitForTimeout(2000);
      const finalPrice = await extractPriceFromPage(page);
      if (finalPrice) {
        console.log(`[Scraper] Got final price: ₹${finalPrice}`);
        return finalPrice;
      }
    }

    return null;
  } catch (err) {
    console.error('[Scraper] trySelectBrandAndGetPrice error:', err.message);
    return null;
  }
}

/**
 * Fallback: try Cashify's direct sell URL pattern.
 * e.g. https://www.cashify.in/sell-apple-iphone-13-128gb
 */
async function trySearchUrl(page, brand, model, storage, condition) {
  try {
    // Build slug: "Apple iPhone 13 128GB" → "apple-iphone-13-128gb"
    const slug = `${brand} ${model} ${storage}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '-');

    const url = `https://www.cashify.in/sell-${slug}`;
    console.log(`[Scraper] Trying direct URL: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await page.waitForTimeout(3000);

    const price = await extractPriceFromPage(page);
    if (price) {
      console.log(`[Scraper] Got price from direct URL: ₹${price}`);
      return price;
    }

    // Try Cashify's API-style price endpoint
    const apiPrice = await tryCashifyApiPrice(page, brand, model, storage);
    return apiPrice;

  } catch (err) {
    console.error('[Scraper] trySearchUrl error:', err.message);
    return null;
  }
}

/**
 * Try to intercept Cashify's internal price API calls via page evaluation
 */
async function tryCashifyApiPrice(page, brand, model, storage) {
  try {
    // Cashify sometimes exposes price in window.__NEXT_DATA__ or similar
    const nextData = await page.evaluate(() => {
      try {
        const el = document.getElementById('__NEXT_DATA__');
        if (el) return JSON.parse(el.textContent);
        return null;
      } catch { return null; }
    });

    if (nextData) {
      const dataStr = JSON.stringify(nextData);
      // Look for price patterns like "maxPrice":32000 or "price":32000
      const priceMatch = dataStr.match(/"(?:maxPrice|sellingPrice|price|quotePrice)"\s*:\s*(\d{4,6})/);
      if (priceMatch) {
        const price = parseInt(priceMatch[1], 10);
        if (price > 500 && price < 200000) {
          console.log(`[Scraper] Got price from NEXT_DATA: ₹${price}`);
          return price;
        }
      }
    }

    return null;
  } catch (err) {
    console.error('[Scraper] tryCashifyApiPrice error:', err.message);
    return null;
  }
}

/**
 * Extract price from current page DOM.
 * Tries multiple selector strategies.
 */
async function extractPriceFromPage(page) {
  return await page.evaluate(() => {
    // Common price selectors on Cashify
    const selectors = [
      '[class*="price"]',
      '[class*="quote"]',
      '[class*="amount"]',
      '[class*="value"]',
      'h1', 'h2', 'h3',
      '[data-testid*="price"]',
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent.trim();
        // Look for Indian Rupee price pattern: ₹32,000 or Rs. 32000 or just 32000
        const match = text.match(/(?:₹|Rs\.?\s*)(\d[\d,]+)/);
        if (match) {
          const price = parseInt(match[1].replace(/,/g, ''), 10);
          // Sanity check: must be between ₹500 and ₹2,00,000
          if (price >= 500 && price <= 200000) {
            return price;
          }
        }
      }
    }
    return null;
  });
}

// ─────────────────────────────────────────────────────────────
// ROUTES
// ─────────────────────────────────────────────────────────────

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'cashify-scraper',
    cacheSize: cache.size,
    uptime: Math.floor(process.uptime()),
  });
});

// Cache stats
app.get('/cache', authMiddleware, (req, res) => {
  const entries = [];
  for (const [key, val] of cache.entries()) {
    entries.push({
      key,
      price: val.price,
      age: Math.floor((Date.now() - val.timestamp) / 1000 / 60) + ' min ago',
    });
  }
  res.json({ count: cache.size, entries });
});

// Clear cache
app.delete('/cache', authMiddleware, (req, res) => {
  cache.clear();
  res.json({ success: true, message: 'Cache cleared' });
});

// Main scrape endpoint
app.get('/scrape', authMiddleware, async (req, res) => {
  const { brand, model, storage, condition } = req.query;

  // Validate required params
  if (!brand || !model || !storage) {
    return res.status(400).json({
      error: 'Missing required query params: brand, model, storage',
    });
  }

  const normalizedCondition = (condition || 'good').toLowerCase();
  const cacheKey = getCacheKey(brand, model, storage, normalizedCondition);

  // Check cache first
  const cachedPrice = getFromCache(cacheKey);
  if (cachedPrice !== null) {
    console.log(`[Scraper] Cache HIT: ${cacheKey} → ₹${cachedPrice}`);
    return res.json({
      price: cachedPrice,
      source: 'cashify',
      cached: true,
      brand, model, storage, condition: normalizedCondition,
    });
  }

  console.log(`[Scraper] Cache MISS: ${cacheKey} — scraping Cashify...`);

  try {
    const price = await scrapeCashifyPrice(brand, model, storage, normalizedCondition);

    if (price && price > 0) {
      setCache(cacheKey, price);
      console.log(`[Scraper] Success: ₹${price} — saved to cache`);
      return res.json({
        price,
        source: 'cashify',
        cached: false,
        brand, model, storage, condition: normalizedCondition,
      });
    }

    // Scraping failed — return null price so Vercel falls back to estimate
    console.log(`[Scraper] Could not extract price for: ${cacheKey}`);
    return res.json({
      price: null,
      source: 'cashify_failed',
      cached: false,
      brand, model, storage, condition: normalizedCondition,
    });

  } catch (err) {
    console.error('[Scraper] Unhandled error:', err);
    return res.status(500).json({ error: 'Scraper internal error', price: null });
  }
});

// ─────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Cashify Scraper Service running on port ${PORT}`);
  console.log(`   API_KEY protection: ${API_KEY ? 'ENABLED' : 'DISABLED (set API_KEY env var)'}`);
  console.log(`   Endpoints:`);
  console.log(`     GET /health`);
  console.log(`     GET /scrape?brand=Apple&model=iPhone+13&storage=128GB&condition=good`);
  console.log(`     GET /cache`);
  console.log(`     DELETE /cache`);
});
