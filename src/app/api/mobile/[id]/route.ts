import { NextRequest, NextResponse } from 'next/server';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { ScraperService } from '@/services/mobile/scraper.service';
import { CacheService } from '@/lib/mobile/cache';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: "Device identifier is required" }, { status: 400 });
    }

    const cacheKey = `device_details_${id}`;
    const cachedData = CacheService.get<any>(cacheKey);

    if (cachedData) {
      return NextResponse.json({ success: true, device: cachedData });
    }

    // Try finding device in DB by ID (if ObjectId) or Slug
    let device = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      device = await DeviceRepository.findById(id);
    }
    
    if (!device) {
      device = await DeviceRepository.findBySlug(id);
    }

    // If device is not in database, attempt to scrape and register it automatically
    if (!device) {
      // Treat the id slug as search query
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

    // Return properties: Brand, Model, Display, Processor, RAM, Storage, Battery, Camera, OS, Images, Launch Price
    const deviceDetails = {
      brand: device.brand,
      model: device.model,
      display: device.display || 'N/A',
      processor: device.processor || 'N/A',
      ram: device.ram || 'N/A',
      storage: device.storage || 'N/A',
      battery: device.battery || 'N/A',
      camera: device.camera || 'N/A',
      os: device.os || 'N/A',
      images: device.images,
      launchPrice: device.launchPrice || 0,
    };

    CacheService.set(cacheKey, deviceDetails, 3600); // cache for 1 hour

    return NextResponse.json({ success: true, device: deviceDetails });
  } catch (error: any) {
    console.error('Error in mobile details API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
