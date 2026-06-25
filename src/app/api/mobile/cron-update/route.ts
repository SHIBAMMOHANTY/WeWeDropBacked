import { NextRequest, NextResponse } from 'next/server';
import { DeviceRepository } from '@/repositories/mobile/device.repository';
import { PriceService } from '@/services/mobile/price.service';

export async function GET(req: NextRequest) {
  try {
    // Optional basic API key authorization to secure the cron trigger in production
    const authHeader = req.headers.get('Authorization');
    const cronSecret = process.env.CRON_SECRET;
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('⚡ Starting background cron price update...');
    const devices = await DeviceRepository.findAll();
    const results = [];

    for (const device of devices) {
      try {
        console.log(`Updating prices for: ${device.brand} ${device.model} (${device.id})`);
        const prices = await PriceService.collectPrices(device.id);
        results.push({
          deviceId: device.id,
          name: `${device.brand} ${device.model}`,
          averagePrice: prices.averagePrice,
          status: 'success',
        });
      } catch (err: any) {
        console.error(`Failed to update prices for device ${device.id}:`, err);
        results.push({
          deviceId: device.id,
          name: `${device.brand} ${device.model}`,
          status: 'failed',
          error: err.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Completed cron price updates for ${devices.length} devices`,
      results,
    });
  } catch (error: any) {
    console.error('Error during cron price updates API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
