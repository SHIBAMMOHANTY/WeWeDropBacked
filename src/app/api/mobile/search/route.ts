import { NextRequest, NextResponse } from 'next/server';
import { ScraperService } from '@/services/mobile/scraper.service';
import { CacheService } from '@/lib/mobile/cache';
import { prisma } from '@/lib/prisma';
import { DeviceGenerator } from '@/services/mobile/generator.service';

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

    // Fallback to searching the local MongoDB database if the scraper returns 0 results
    if (results.length === 0) {
      const keywords = query.trim().split(/\s+/).filter(Boolean);
      if (keywords.length > 0) {
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

        results = dbDevices.map(d => {
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
      }

      // If the database also does not have any matches, dynamically generate the devices in real-time
      if (results.length === 0) {
        const generated = await DeviceGenerator.generateAndSave(query);
        results = generated.map(d => {
          const flipkartPrice = d.currentPrices.find((cp: any) => cp.seller.toLowerCase() === 'flipkart');
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

