import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET() {
  try {
    const devices = await prisma.deviceMaster.findMany({
      where: { isActive: true },
      select: {
        brand: true,
        model: true,
        storage: true,
        basePriceExcellent: true,
        basePriceGood: true,
        basePriceAverage: true,
      },
      orderBy: [
        { brand: 'asc' },
        { model: 'asc' },
      ],
    });

    return jsonResponse({
      success: true,
      devices,
    });
  } catch (err: any) {
    console.error('Fetch Devices Error:', err);
    return jsonResponse(
      { error: err.message || 'Failed to fetch active device list' },
      500
    );
  }
}
