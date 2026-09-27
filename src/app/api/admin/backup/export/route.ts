import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const timestamp = new Date().toISOString();
    const dateFormatted = timestamp.split('T')[0];

    // Fetch primary collections in parallel
    const [
      quotes,
      orders,
      users,
      businesses,
      oldPhoneListings,
      oldPhoneOrders,
      orderHistories,
      deviceMasters,
      spareParts,
      banners,
    ] = await Promise.all([
      prisma.quote.findMany().catch(() => []),
      prisma.order.findMany().catch(() => []),
      prisma.user.findMany({
        select: {
          id: true,
          phone: true,
          username: true,
          email: true,
          role: true,
          membership: true,
          isActive: true,
          createdAt: true,
          gstName: true,
          gstNumber: true,
          gstAddress: true,
          address: true,
          city: true,
          state: true,
        },
      }).catch(() => []),
      prisma.business.findMany().catch(() => []),
      prisma.oldPhoneListing.findMany().catch(() => []),
      prisma.oldPhoneOrder.findMany().catch(() => []),
      prisma.orderHistory.findMany().catch(() => []),
      prisma.deviceMaster.findMany().catch(() => []),
      prisma.sparePart.findMany().catch(() => []),
      prisma.banner.findMany().catch(() => []),
    ]);

    const backupData = {
      system: 'WePick WeDrop Database Archive',
      version: '1.0.0',
      exportedAt: timestamp,
      type: 'FULL_SNAPSHOT',
      summary: {
        totalQuotes: quotes.length,
        totalOrders: orders.length,
        totalUsers: users.length,
        totalBusinesses: businesses.length,
        totalOldPhoneListings: oldPhoneListings.length,
        totalOldPhoneOrders: oldPhoneOrders.length,
        totalOrderHistories: orderHistories.length,
        totalDeviceMasters: deviceMasters.length,
        totalSpareParts: spareParts.length,
        totalBanners: banners.length,
      },
      collections: {
        quotes,
        orders,
        users,
        businesses,
        oldPhoneListings,
        oldPhoneOrders,
        orderHistories,
        deviceMasters,
        spareParts,
        banners,
      },
    };

    const jsonString = JSON.stringify(backupData, null, 2);
    const filename = `wepickwedrop_backup_${dateFormatted}.json`;

    return new Response(jsonString, {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
    });
  } catch (error: any) {
    console.error('[API /api/admin/backup/export] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to generate database export' },
      { status: 500 }
    );
  }
}
