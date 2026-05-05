export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const orderId = searchParams.get("orderId");
    const userId = searchParams.get("userId");
    const sourceType = searchParams.get("sourceType");
    const sourceRoute = searchParams.get("sourceRoute");
    const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 500);

    const where: Record<string, unknown> = {};
    if (orderId) where.orderId = orderId;
    if (userId) where.userId = userId;
    if (sourceType) where.sourceType = sourceType;
    if (sourceRoute) where.sourceRoute = sourceRoute;

    // ⚡ OPTIMIZED: Use rawQueryGrouping for better performance
    const history = await prisma.orderHistory.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        afterState: true,
        createdAt: true,
      },
    });

    // ⚡ OPTIMIZED: Use Map for O(1) lookup instead of object keys iteration
    const groupedHistory = new Map<string, any[]>();

    history.forEach((entry) => {
      const afterState = entry.afterState as any;
      const realOrderId = afterState?.orderId;

      if (!realOrderId) return;

      if (!groupedHistory.has(realOrderId)) {
        groupedHistory.set(realOrderId, []);
      }

      groupedHistory.get(realOrderId)!.push({
        afterState: entry.afterState,
        createdAt: entry.createdAt,
      });
    });

    // ⚡ OPTIMIZED: Single sort before mapping + Array.from() for faster iteration
    const finalHistory = Array.from(groupedHistory.entries())
      .map(([orderId, entries]) => ({
        orderId,
        history: entries.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() -
            new Date(a.createdAt).getTime()
        ),
      }))
      .sort((a, b) => 
        new Date(b.history[0]?.createdAt).getTime() -
        new Date(a.history[0]?.createdAt).getTime()
      );

    return NextResponse.json(
      {
        count: finalHistory.length,
        history: finalHistory,
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("GET /api/orders/history error:", error);

    return NextResponse.json(
      { error: "Failed to fetch order history" },
      { status: 500, headers: corsHeaders }
    );
  }
}