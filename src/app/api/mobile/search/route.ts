import { NextRequest, NextResponse } from 'next/server';
import { CacheService } from '@/lib/mobile/cache';
import { prisma } from '@/lib/prisma';

// Brand-specific image map for known brands
const BRAND_IMAGES: Record<string, string> = {
  apple:    'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop',
  iphone:   'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop',
  samsung:  'https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?q=80&w=350&h=350&fit=crop',
  oneplus:  'https://images.unsplash.com/photo-1585060544812-6b45742d762f?q=80&w=350&h=350&fit=crop',
  xiaomi:   'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop',
  redmi:    'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop',
  realme:   'https://images.unsplash.com/photo-1605236453806-6ff36851218e?q=80&w=350&h=350&fit=crop',
  oppo:     'https://images.unsplash.com/photo-1582743779565-c1d9f8bf4bd4?q=80&w=350&h=350&fit=crop',
  vivo:     'https://images.unsplash.com/photo-1601784551446-20c9e07cdbdb?q=80&w=350&h=350&fit=crop',
  google:   'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?q=80&w=350&h=350&fit=crop',
  pixel:    'https://images.unsplash.com/photo-1607252650355-f7fd0460ccdb?q=80&w=350&h=350&fit=crop',
  motorola: 'https://images.unsplash.com/photo-1609252925881-22df35b3f5c3?q=80&w=350&h=350&fit=crop',
  nothing:  'https://images.unsplash.com/photo-1672826055490-b9fd06fb81d2?q=80&w=350&h=350&fit=crop',
};

function getBrandImage(brand: string): string {
  const key = brand.toLowerCase();
  for (const [b, img] of Object.entries(BRAND_IMAGES)) {
    if (key.includes(b)) return img;
  }
  return 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';
}

function normalizeQuery(q: string): string {
  return q.toLowerCase()
    .replace(/\bi\s+phone\b/g, 'iphone')
    .replace(/\bone\s+plus\b/g, 'oneplus')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractBrandFromQuery(q: string): string {
  const brands = ['apple', 'iphone', 'samsung', 'galaxy', 'oneplus', 'xiaomi', 'redmi', 'poco', 'vivo', 'oppo', 'realme', 'google', 'pixel', 'motorola', 'moto', 'nothing', 'honor', 'infinix', 'tecno', 'asus', 'iqoo'];
  const words = q.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (brands.includes(word)) {
      if (word === 'iphone') return 'Apple';
      if (word === 'galaxy') return 'Samsung';
      if (word === 'pixel') return 'Google';
      if (word === 'moto') return 'Motorola';
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
  }
  // Fallback for completely new/unknown brands (like "Ai Nova 5G")
  if (words.length > 0 && words[0]) {
    return words[0].charAt(0).toUpperCase() + words[0].slice(1);
  }
  return 'Unknown';
}

function capitalizeWords(str: string): string {
  return str.split(/\s+/).map(w => {
    if (w.toLowerCase() === '5g') return '5G';
    if (w.toLowerCase() === '4g') return '4G';
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get('q');
    const pageStr = searchParams.get('page') || '1';
    const page = parseInt(pageStr, 10) || 1;

    if (!query || query.trim() === '') {
      return NextResponse.json(
        { error: "Query parameter 'q' is required" },
        { status: 400 }
      );
    }

    const normalizedQuery = normalizeQuery(query);
    const cacheKey = `search_${normalizedQuery}_page_${page}`;
    const cachedData = CacheService.get<any[]>(cacheKey);

    if (cachedData) {
      return NextResponse.json({ success: true, results: cachedData });
    }

    // ─── 1. Search DB first (Device collection — scraped & stored devices) ───
    const keywords = normalizedQuery.split(/\s+/).filter(Boolean);

    const dbDevices = await prisma.device.findMany({
      where: {
        AND: keywords.map(kw => ({
          OR: [
            { brand: { contains: kw, mode: 'insensitive' } },
            { model: { contains: kw, mode: 'insensitive' } },
            { slug:  { contains: kw, mode: 'insensitive' } },
          ],
        })),
      },
      include: { currentPrices: true },
      take: 20,
    });

    // ─── 2. Search DeviceMaster (buyback catalog) ───
    const dbDeviceMasters = await prisma.deviceMaster.findMany({
      where: {
        AND: keywords.map(kw => ({
          OR: [
            { brand: { contains: kw, mode: 'insensitive' } },
            { model: { contains: kw, mode: 'insensitive' } },
          ],
        })),
        isActive: true,
      },
      take: 20,
    });

    // ─── Map Device results ───
    const deviceResults = dbDevices.map(d => {
      const flipkartPrice = d.currentPrices.find(cp => cp.seller.toLowerCase() === 'flipkart');
      const fallbackPrice = d.currentPrices[0];
      return {
        id:          d.id,
        brand:       d.brand,
        model:       d.model,
        image:       d.images?.[0] || getBrandImage(d.brand),
        releaseDate: d.releaseDate || undefined,
        price:       flipkartPrice?.price ?? fallbackPrice?.price ?? (d.launchPrice ? Math.round(d.launchPrice * 0.85) : undefined),
        mrp:         flipkartPrice?.mrp  ?? fallbackPrice?.mrp  ?? d.launchPrice ?? undefined,
      };
    });

    // ─── Map DeviceMaster results ───
    const masterResults = dbDeviceMasters.map(dm => ({
      id:          dm.id,
      brand:       dm.brand,
      model:       `${dm.model} (${dm.storage})`,
      image:       getBrandImage(dm.brand),
      releaseDate: dm.launchDate || undefined,
      price:       dm.basePriceExcellent,
      mrp:         dm.launchPrice,
    }));

    // ─── 3. Merge & deduplicate (Device entries take priority) ───
    const merged: typeof deviceResults = [...deviceResults];
    for (const mr of masterResults) {
      const alreadyExists = merged.some(dr => {
        const drBrand = dr.brand.toLowerCase();
        const drModel = dr.model.toLowerCase();
        const mrBrand = mr.brand.toLowerCase();
        const mrModel = mr.model.toLowerCase();
        return drBrand === mrBrand && (drModel.includes(mrModel) || mrModel.includes(drModel));
      });
      if (!alreadyExists) {
        merged.push(mr);
      }
    }

    let results = merged;

    // ─── 4. If still empty, try a live Flipkart scrape with a short timeout ───
    if (results.length === 0) {
      try {
        const { ScraperService } = await import('@/services/mobile/scraper.service');
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000); // 8 s max

        const scrapedResults = await Promise.race([
          ScraperService.search(normalizedQuery, page),
          new Promise<any[]>((_, reject) =>
            controller.signal.addEventListener('abort', () => reject(new Error('timeout')))
          ),
        ]).catch(() => [] as any[]);

        clearTimeout(timeout);

        if (scrapedResults && scrapedResults.length > 0) {
          const mappedResults: any[] = [];
          for (const p of scrapedResults) {
            const cleanStorage = p.model.match(/\b\d+\s*(?:gb|tb)\b/i)?.[0] || '128GB';
            const slug = `${p.brand}-${p.model}-${cleanStorage}`
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/(^-|-$)+/g, '');

            let deviceId = p.id;
            try {
              let device = await prisma.device.findUnique({ where: { slug } });
              if (!device) {
                const isApple = p.brand.toLowerCase() === 'apple' || p.model.toLowerCase().includes('iphone');
                device = await prisma.device.create({
                  data: {
                    slug,
                    brand: p.brand,
                    model: p.model,
                    storage: cleanStorage,
                    launchPrice: p.mrp || p.price || (isApple ? 80000 : 30000),
                    releaseDate: p.releaseDate || '2023-01-01',
                    display: isApple ? '6.1 inch OLED Display' : '6.5 inch FHD+ Display',
                    processor: isApple ? 'A16 Bionic Chip' : 'Octa Core Processor',
                    ram: isApple ? '6 GB RAM' : '8 GB RAM',
                    battery: isApple ? '3349 mAh' : '5000 mAh',
                    camera: isApple ? '48MP + 12MP Rear Camera' : '50MP Rear Camera',
                    os: isApple ? 'iOS 17' : 'Android 14',
                    images: p.image ? [p.image] : [],
                  }
                });
              }
              deviceId = device.id;

              // Upsert Flipkart price
              await prisma.currentPrice.upsert({
                where: {
                  deviceId_seller: {
                    deviceId: device.id,
                    seller: 'Flipkart',
                  }
                },
                update: {
                  price: p.price,
                  mrp: p.mrp,
                  availability: p.availability || 'In Stock',
                  productUrl: p.url,
                  lastUpdated: new Date(),
                },
                create: {
                  deviceId: device.id,
                  seller: 'Flipkart',
                  price: p.price,
                  mrp: p.mrp,
                  availability: p.availability || 'In Stock',
                  productUrl: p.url,
                  lastUpdated: new Date(),
                }
              });

              // Add to price history
              await prisma.priceHistory.create({
                data: {
                  deviceId: device.id,
                  seller: 'Flipkart',
                  price: p.price,
                  mrp: p.mrp,
                }
              });
            } catch (err) {
              console.error('Failed to register/upsert scraped device in DB:', err);
            }

            mappedResults.push({
              id:          deviceId,
              brand:       p.brand,
              model:       p.model,
              image:       p.image || getBrandImage(p.brand),
              releaseDate: p.releaseDate,
              price:       p.price,
              mrp:         p.mrp,
            });
          }
          results = mappedResults;
        }
      } catch {
        // Scraper failed entirely
      }
    }

    if (results.length > 0) {
      CacheService.set(cacheKey, results, 1800);
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Error in mobile search API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
