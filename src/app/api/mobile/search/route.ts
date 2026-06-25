import { NextRequest, NextResponse } from 'next/server';
import { ScraperService } from '@/services/mobile/scraper.service';
import { CacheService } from '@/lib/mobile/cache';
import { prisma } from '@/lib/prisma';

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

    const cacheKey = `search_${query.trim().toLowerCase()}_page_${page}`;
    const cachedData = CacheService.get<any[]>(cacheKey);

    if (cachedData) {
      return NextResponse.json({ success: true, results: cachedData });
    }

    let scrapedResults: any[] = [];
    try {
      scrapedResults = await ScraperService.search(query, page);
    } catch (error) {
      console.error('Error during Flipkart search scraping:', error);
    }

    // Map to required return shape: id, brand, model, image, releaseDate, price, mrp
    let results = scrapedResults.map(p => ({
      id: p.id,
      brand: p.brand,
      model: p.model,
      image: p.image,
      releaseDate: p.releaseDate,
      price: p.price,
      mrp: p.mrp,
    }));

    // Fallback to searching local MongoDB collections (Device & DeviceMaster) if the scraper returns 0 results
    if (results.length === 0) {
      const keywords = query.trim().split(/\s+/).filter(Boolean);
      if (keywords.length > 0) {
        // 1. Search scraped devices
        const dbDevices = await prisma.device.findMany({
          where: {
            AND: keywords.map(kw => ({
              OR: [
                { brand: { contains: kw, mode: 'insensitive' } },
                { model: { contains: kw, mode: 'insensitive' } },
                { slug: { contains: kw, mode: 'insensitive' } },
              ],
            })),
          },
          include: {
            currentPrices: true,
          },
          take: 20,
        });

        // 2. Search catalog master devices
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

        const deviceResults = dbDevices.map(d => {
          const flipkartPrice = d.currentPrices.find(cp => cp.seller.toLowerCase() === 'flipkart');
          const fallbackPrice = d.currentPrices[0];
          return {
            id: d.id,
            brand: d.brand,
            model: d.model,
            image: d.images?.[0] || '',
            releaseDate: d.releaseDate || undefined,
            price: flipkartPrice?.price ?? fallbackPrice?.price ?? (d.launchPrice ? Math.round(d.launchPrice * 0.85) : undefined),
            mrp: flipkartPrice?.mrp ?? fallbackPrice?.mrp ?? d.launchPrice ?? undefined,
          };
        });

        const masterResults = dbDeviceMasters.map(dm => {
          const isApple = dm.brand.toLowerCase() === 'apple' || dm.brand.toLowerCase() === 'iphone';
          const defaultImage = isApple
            ? 'https://images.unsplash.com/photo-1510557880182-3d4d3cba35a5?q=80&w=350&h=350&fit=crop'
            : 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';
          
          return {
            id: dm.id,
            brand: dm.brand,
            model: `${dm.model} (${dm.storage})`,
            image: defaultImage,
            releaseDate: dm.launchDate || undefined,
            price: dm.basePriceExcellent,
            mrp: dm.launchPrice,
          };
        });

        // Merge and deduplicate
        const merged = [...deviceResults];
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

        results = merged;
      }
    }

    CacheService.set(cacheKey, results, 1800); // cache search for 30 minutes

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    console.error('Error in mobile search API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}

