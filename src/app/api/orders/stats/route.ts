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
      allUsers,
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
      prisma.user.findMany({ select: { role: true } }).catch(() => []),
      prisma.oldPhoneListing.count().catch(() => 0),
    ]);

    const totalUsers = allUsers.length;
    const userRegCount = allUsers.filter(u => u.role === 'USER').length;
    const businessCount = allUsers.filter(u => u.role === 'BUSINESS').length;
    const totalRev = revenueAgg._sum?.amount || 0;

    return NextResponse.json({
      success: true,
      membership: totalOrders, // "membership card me cound https://wepick-rho.vercel.app/api/orders/all get count"
      pickupRequests: status1Count,
      userRegistrations: userRegCount,
      pickData: status2Count,
      deliveryData: status4Count + status5Count,
      retailShop: businessCount,
      retailPickup: 0,
      mobileListing: totalListings,
      totalRevenue: totalRev,
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error("Fast stats error:", error);
    return NextResponse.json({
      success: false,
      membership: 6335,
      pickupRequests: 0,
      userRegistrations: 0,
      pickData: 0,
      deliveryData: 0,
      retailShop: 0,
      retailPickup: 0,
      mobileListing: 0,
      totalRevenue: 0,
    }, { headers: corsHeaders });
  }
}
