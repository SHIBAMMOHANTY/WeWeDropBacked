export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const agentId = searchParams.get("agentId");
    const phone = searchParams.get("phone");

    let targetAgentId = agentId;

    if (!targetAgentId && phone) {
      const agentUser = await prisma.user.findUnique({
        where: { phone },
      });
      if (agentUser) {
        targetAgentId = agentUser.id;
      }
    }

    if (!targetAgentId) {
      return NextResponse.json(
        { success: false, error: "agentId or phone query parameter is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const orders = await prisma.order.findMany({
      where: {
        deliveryAgentId: targetAgentId,
        deleted: false,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const statusMap: { [key: number]: string } = {
      0: "PENDING",
      1: "PICKUP_REQUESTED",
      "-1": "REJECTED",
      2: "READY_FOR_PICKUP",
      3: "REPAIRING",
      4: "DELIVERED",
    };

    const formattedOrders = orders.map(o => ({
      ...o,
      statusLabel: statusMap[o.orderStatus] || "UNKNOWN",
    }));

    return NextResponse.json(
      {
        success: true,
        orders: formattedOrders,
        total: formattedOrders.length,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("GET /api/orders/agent Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch agent orders" },
      { status: 500, headers: corsHeaders }
    );
  }
}
