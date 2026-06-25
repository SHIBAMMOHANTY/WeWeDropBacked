import { NextRequest, NextResponse } from 'next/server';
import { ScraperService } from '@/services/mobile/scraper.service';
import { CacheService } from '@/lib/mobile/cache';

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

    const scrapedResults = await ScraperService.search(query, page);

    // Map to required return shape: id, brand, model, image, releaseDate
    const results = scrapedResults.map(p => ({
      id: p.id,
      brand: p.brand,
      model: p.model,
      image: p.image,
      releaseDate: p.releaseDate,
    }));

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
