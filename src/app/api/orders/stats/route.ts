import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 's-maxage=2, stale-while-revalidate=10',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const [
      totalOrders,
      status1Count,
      status2Count,
      status4Count,
      status5Count,
      revenueAgg,
      totalUsers,
      totalBusinesses,
      totalListings
    ] = await Promise.all([
      prisma.order.count({ where: { deleted: false } }).catch(() => 0),
      prisma.order.count({ where: { deleted: false, orderStatus: 1 } }).catch(() => 0),
      prisma.order.count({ where: { deleted: false, orderStatus: 2 } }).catch(() => 0),
      prisma.order.count({ where: { deleted: false, orderStatus: 4 } }).catch(() => 0),
      prisma.order.count({ where: { deleted: false, orderStatus: 5 } }).catch(() => 0),
      prisma.order.aggregate({
        where: { deleted: false },
        _sum: { amount: true }
      }).catch(() => ({ _sum: { amount: 0 } })),
      prisma.user.count({ where: { role: { not: "DELIVERY_AGENT" } } }).catch(() => 0),
      prisma.business.count().catch(() => 0),
      prisma.oldPhoneListing.count().catch(() => 0),
    ]);

    const totalRev = revenueAgg._sum?.amount || 0;

    return NextResponse.json({
      success: true,
      memberUsers: totalUsers,
      pickupRequests: totalOrders,
      userRegistrations: totalUsers,
      pickData: status2Count,
      deliveryData: status4Count + status5Count,
      retailShop: totalBusinesses,
      retailPickup: 0,
      mobileListing: totalListings,
      orderRequests: status1Count,
      totalRevenue: totalRev,
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("Fast stats error:", error);
    return NextResponse.json({
      success: false,
      memberUsers: 0,
      pickupRequests: 0,
      userRegistrations: 0,
      pickData: 0,
      deliveryData: 0,
      retailShop: 0,
      retailPickup: 0,
      mobileListing: 0,
      orderRequests: 0,
      totalRevenue: 0,
    }, { headers: corsHeaders });
  }
}
