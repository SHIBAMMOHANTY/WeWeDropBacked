import { NextRequest, NextResponse } from 'next/server';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { prisma } from '@/lib/prisma';

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json({ error: 'Device identifier is required' }, { status: 400 });
    }

    // ─── 1. Resolve device from Device collection (full specs) ───
    let device: any = null;
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      device = await DeviceRepository.findById(id);
    }
    if (!device) {
      device = await DeviceRepository.findBySlug(id);
    }

    if (device) {
      // Fetch and return existing stored prices (no live scraping)
      const currentPrices = await DeviceRepository.getCurrentPricesByDeviceId(device.id);
      const baseLaunchPrice = device.launchPrice || 50000;

      let prices: any[] = [];

      if (currentPrices.length > 0) {
        // Use stored prices
        prices = currentPrices.map(cp => ({
          seller:      cp.seller,
          price:       cp.price,
          mrp:         cp.mrp ?? baseLaunchPrice,
          availability: cp.availability || 'In Stock',
          productUrl:  cp.productUrl || '',
          lastUpdated: cp.lastUpdated,
        }));
      } else {
        // Derive estimated prices from launch price
        const estimatedPrice = Math.round(baseLaunchPrice * 0.85);
        const sellers = ['Flipkart', 'Amazon', 'Croma'];
        const multipliers = [1.00, 0.985, 1.015];
        prices = sellers.map((seller, i) => ({
          seller,
          price:       Math.round(estimatedPrice * multipliers[i]),
          mrp:         baseLaunchPrice,
          availability: 'In Stock',
          productUrl:  '#',
          lastUpdated: new Date(),
        }));
      }

      const numericalPrices = prices.map(p => p.price);
      const lowestPrice    = Math.min(...numericalPrices);
      const highestPrice   = Math.max(...numericalPrices);
      const averagePrice   = Math.round(numericalPrices.reduce((s, v) => s + v, 0) / numericalPrices.length);

      return NextResponse.json({
        success: true,
        data: { lowestPrice, highestPrice, averagePrice, prices },
      });
    }

    // ─── 2. Fallback to DeviceMaster (buyback catalog) by ObjectId ───
    if (id.match(/^[0-9a-fA-F]{24}$/)) {
      const master = await prisma.deviceMaster.findUnique({ where: { id } });

      if (master) {
        const baseLaunchPrice = master.launchPrice;
        const estimatedPrice  = master.basePriceExcellent || Math.round(baseLaunchPrice * 0.65);
        const sellers = ['Flipkart', 'Amazon', 'Croma'];
        const multipliers = [1.00, 0.985, 1.015];
        const prices = sellers.map((seller, i) => ({
          seller,
          price:        Math.round(estimatedPrice * multipliers[i]),
          mrp:          baseLaunchPrice,
          availability: 'In Stock',
          productUrl:   '#',
          lastUpdated:  new Date(),
        }));

        const numericalPrices = prices.map(p => p.price);
        const lowestPrice    = Math.min(...numericalPrices);
        const highestPrice   = Math.max(...numericalPrices);
        const averagePrice   = Math.round(numericalPrices.reduce((s, v) => s + v, 0) / numericalPrices.length);

        return NextResponse.json({
          success: true,
          data: { lowestPrice, highestPrice, averagePrice, prices },
        });
      }
    }

    return NextResponse.json({ error: 'Device not found' }, { status: 404 });
  } catch (error: any) {
    console.error('Error in mobile prices API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
