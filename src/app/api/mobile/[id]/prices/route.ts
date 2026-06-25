import { NextRequest, NextResponse } from 'next/server';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { PriceService } from '@/services/mobile/price.service';
import { ScraperService } from '@/services/mobile/scraper.service';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: "Device identifier is required" }, { status: 400 });
    }

    // Resolve device by ID (if ObjectId) or Slug
    let device = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      device = await DeviceRepository.findById(id);
    }
    
    if (!device) {
      device = await DeviceRepository.findBySlug(id);
    }

    // Auto-create if it doesn't exist
    if (!device) {
      const query = id.replace(/-/g, ' ');
      const searchResults = await ScraperService.search(query, 1);
      
      if (searchResults.length > 0) {
        const match = searchResults[0];
        let detailSpecs = match.url 
          ? await ScraperService.fetchDetails(match.url)
          : null;

        if (!detailSpecs) {
          detailSpecs = ScraperService.parseSpecsFromKeySpecs(match.model, match.keySpecs || [], match.image, match.price || 0, match.mrp || 0);
        }

        device = await DeviceRepository.create({
          slug: id,
          brand: detailSpecs.brand,
          model: detailSpecs.model,
          display: detailSpecs.display,
          processor: detailSpecs.processor,
          ram: detailSpecs.ram,
          storage: detailSpecs.storage || '128GB',
          battery: detailSpecs.battery,
          camera: detailSpecs.camera,
          os: detailSpecs.os,
          images: detailSpecs.images && detailSpecs.images.length > 0 ? detailSpecs.images : [match.image],
          launchPrice: detailSpecs.launchPrice || match.price || 50000,
          releaseDate: detailSpecs.releaseDate || match.releaseDate,
        });
      }
    }

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Fetch and record prices
    const pricesResult = await PriceService.collectPrices(device.id);

    return NextResponse.json({ success: true, data: pricesResult });
  } catch (error: any) {
    console.error('Error in mobile prices API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
