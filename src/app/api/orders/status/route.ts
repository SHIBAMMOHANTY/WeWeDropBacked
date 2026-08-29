export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAuthSession } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

function mapPaymentStatus(status: number | null | undefined): string {
  if (status === 1) return "VERIFIED";
  if (status === -1) return "REJECTED";
  return "PENDING";
}

function derivePaymentStatus(numericStatus: number): number {
  if (numericStatus === 5 || numericStatus === 4) return 1; // VERIFIED on delivery
  if (numericStatus === -1) return -1;
  return 0;
}

// GET /api/orders/status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const allParam = searchParams.get('all');
    const reqUserId = searchParams.get('userId');

    const session = await getAuthSession(req as any);
    const isAdmin = session?.role === 'SUPER_ADMIN';

    let take: number | undefined = 50; // Default to 50 recent orders
    if (allParam === 'true' && isAdmin) {
      take = undefined; // Fetch all if explicitly requested by admin
    } else if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      if (!isNaN(parsedLimit) && parsedLimit > 0) {
        take = parsedLimit;
      }
    }

    // Build user scope query: regular users only see their own orders
    const queryWhere: any = { deleted: false };
    if (!isAdmin) {
      const activeUserId = session?.id || reqUserId;
      if (activeUserId) {
        queryWhere.userId = activeUserId;
      }
    } else if (reqUserId) {
      queryWhere.userId = reqUserId;
    }

    const orders = await prisma.order.findMany({
      where: queryWhere,
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
    });

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'PICKUP_SUCCESSFUL',
      3: 'REPAIRING',
      4: 'OUT_FOR_DELIVERY',
      5: 'DELIVERED'
    };

    const ordersWithStatus = orders.map(order => ({
      ...order,
      status: statusMap[order.orderStatus] || 'UNKNOWN',
      paymentStatus: order.paymentStatus ?? null,
      paymentStatusLabel: mapPaymentStatus(order.paymentStatus)
    }));

    return NextResponse.json(ordersWithStatus, { headers: corsHeaders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500, headers: corsHeaders });
  }
}

// PATCH /api/orders/status?orderId=ORDER_ID
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const orderId = searchParams.get("orderId");

  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { status, paymentStatus } = body;

    let numericStatus: number | undefined = undefined;
    if (status !== undefined && status !== null) {
      const statusMap: Record<string, number> = {
        "PENDING": 0,
        "PICKUP_REQUESTED": 1,
        "REJECTED": -1,
        "PICKUP_SUCCESSFUL": 2,
        "READY_FOR_PICKUP": 2,
        "REPAIRING": 3,
        "OUT_FOR_DELIVERY": 4,
        "DELIVERED": 5
      };

      if (typeof status === 'string') {
        numericStatus = statusMap[status];
        if (numericStatus === undefined) {
          return NextResponse.json({ error: "Invalid status" }, { status: 400, headers: corsHeaders });
        }
      } else if (typeof status === 'number') {
        numericStatus = status;
      }
    }

    let numericPaymentStatus: number | undefined = undefined;
    if (paymentStatus !== undefined && paymentStatus !== null) {
      numericPaymentStatus = Number(paymentStatus);
    } else if (numericStatus !== undefined) {
      numericPaymentStatus = derivePaymentStatus(numericStatus);
    }

    const beforeOrder = await prisma.order.findUnique({ where: { id: orderId } });
    if (!beforeOrder) {
      return NextResponse.json({ error: "Order not found" }, { status: 404, headers: corsHeaders });
    }

    const updateData: any = {};
    if (numericStatus !== undefined) updateData.orderStatus = numericStatus;
    if (numericPaymentStatus !== undefined) updateData.paymentStatus = numericPaymentStatus;

    const updatedOrder = await prisma.order.update({
      where: { id: orderId },
      data: updateData,
    });

    const statusMapReverse: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'PICKUP_SUCCESSFUL',
      3: 'REPAIRING',
      4: 'OUT_FOR_DELIVERY',
      5: 'DELIVERED'
    };

    const orderWithStatus = {
      ...updatedOrder,
      status: statusMapReverse[updatedOrder.orderStatus] || 'UNKNOWN',
      paymentStatus: updatedOrder.paymentStatus,
      paymentStatusLabel: mapPaymentStatus(updatedOrder.paymentStatus),
    };

    return NextResponse.json(orderWithStatus, { headers: corsHeaders });
  } catch (error) {
    console.error("Error updating order status:", error);
    return NextResponse.json({ error: "Failed to update order status" }, { status: 500, headers: corsHeaders });
  }
}
