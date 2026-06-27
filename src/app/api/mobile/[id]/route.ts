import { NextRequest, NextResponse } from 'next/server';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { CacheService } from '@/lib/mobile/cache';
import { prisma } from '@/lib/prisma';

// Brand-specific image fallbacks
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
  motorola: 'https://images.unsplash.com/photo-1609252925881-22df35b3f5c3?q=80&w=350&h=350&fit=crop',
  nothing:  'https://images.unsplash.com/photo-1672826055490-b9fd06fb81d2?q=80&w=350&h=350&fit=crop',
};

function getBrandImage(brand: string): string {
  const key = brand.toLowerCase();
  return BRAND_IMAGES[key] ?? 'https://images.unsplash.com/photo-1598327105666-5b89351aff97?q=80&w=350&h=350&fit=crop';
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Device identifier is required' }, { status: 400 });
    }

    const cacheKey = `device_details_${id}`;
    const cachedData = CacheService.get<any>(cacheKey);
    if (cachedData) {
      return NextResponse.json({ success: true, device: cachedData });
    }

    // ─── 1. Try Device collection (full specs) by ObjectId or slug ───
    let device: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      device = await DeviceRepository.findById(id);
    }
    if (!device) {
      device = await DeviceRepository.findBySlug(id);
    }

    if (device) {
      const deviceDetails = {
        id:          device.id,
        brand:       device.brand,
        model:       device.model,
        display:     device.display     || 'N/A',
        processor:   device.processor   || 'N/A',
        ram:         device.ram         || 'N/A',
        storage:     device.storage     || 'N/A',
        battery:     device.battery     || 'N/A',
        camera:      device.camera      || 'N/A',
        os:          device.os          || 'N/A',
        images:      device.images?.length ? device.images : [getBrandImage(device.brand)],
        launchPrice: device.launchPrice || 0,
        releaseDate: device.releaseDate || null,
      };
      CacheService.set(cacheKey, deviceDetails, 3600);
      return NextResponse.json({ success: true, device: deviceDetails });
    }

    // ─── 2. Try DeviceMaster (buyback catalog) by ObjectId ───
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const master = await prisma.deviceMaster.findUnique({ where: { id } });

      if (master) {
        const isApple = master.brand.toLowerCase() === 'apple';
        const deviceDetails = {
          id:          master.id,
          brand:       master.brand,
          model:       `${master.model} (${master.storage})`,
          display:     'N/A',
          processor:   isApple ? 'Apple A-series Chip' : 'Octa Core Processor',
          ram:         isApple ? '6 GB RAM' : '8 GB RAM',
          storage:     master.storage,
          battery:     isApple ? '3349 mAh' : '5000 mAh',
          camera:      isApple ? '12MP + 12MP Dual Camera' : '50MP Rear Camera',
          os:          isApple ? 'iOS' : 'Android',
          images:      [getBrandImage(master.brand)],
          launchPrice: master.launchPrice,
          releaseDate: master.launchDate || null,
          // Buyback prices
          buyback: {
            excellent: master.basePriceExcellent,
            good:      master.basePriceGood,
            average:   master.basePriceAverage,
          },
        };
        CacheService.set(cacheKey, deviceDetails, 3600);
        return NextResponse.json({ success: true, device: deviceDetails });
      }
    }

    // ─── 3. Nothing found ───
    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error in mobile details API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
