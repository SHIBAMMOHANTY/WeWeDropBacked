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
  let orderId = searchParams.get("orderId");

  try {
    const body = await req.json();
    if (!orderId && (body.orderId || body.id)) {
      orderId = body.orderId || body.id;
    }

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId" }, { status: 400, headers: corsHeaders });
    }

    const {
      status,
      paymentStatus,
      serviceType,
      serviceCenterName,
      remark,
      issueType,
      updatedByAgentId,
      updatedByAgentName,
      deliveryAgentId
    } = body;

    let numericStatus: number | undefined = undefined;
    const statusMap: Record<string, number> = {
      "PENDING": 0,
      "PICKUP_REQUESTED": 1,
      "REJECTED": -1,
      "PICKUP_SUCCESSFUL": 2,
      "READY_FOR_PICKUP": 2,
      "IN_SERVICE_CENTER": 2,
      "IN_HOUSE": 2,
      "IN_HOUSE_SERVICE": 2,
      "REPAIRING": 3,
      "OUT_FOR_DELIVERY": 4,
      "DELIVERED": 5
    };

    if (status !== undefined && status !== null) {
      if (typeof status === 'string') {
        numericStatus = statusMap[status];
        if (numericStatus === undefined) {
          numericStatus = 2; // fallback to active processing
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

    // Prepare updated refurbishData
    const prevRefurbish = (beforeOrder.refurbishData as any) || {};
    const prevHistory = Array.isArray(prevRefurbish.statusHistory) ? prevRefurbish.statusHistory : [];

    const finalServiceType = serviceType || prevRefurbish.serviceType || "IN_HOUSE";
    const finalAgentId = updatedByAgentId || deliveryAgentId || prevRefurbish.updatedByAgentId || beforeOrder.deliveryAgentId;
    const finalAgentName = updatedByAgentName || prevRefurbish.updatedByAgentName || "Agent";

    const statusLabel = typeof status === "string" ? status : (
      numericStatus === 1 ? "PICKUP_REQUESTED" :
      numericStatus === 2 ? (finalServiceType === "IN_SERVICE_CENTER" ? "IN_SERVICE_CENTER" : "IN_HOUSE_SERVICE") :
      numericStatus === 3 ? "REPAIRING" :
      numericStatus === 4 ? "OUT_FOR_DELIVERY" :
      numericStatus === 5 ? "DELIVERED" :
      numericStatus === -1 ? "REJECTED" : "STATUS_UPDATED"
    );

    const historyEntry = {
      status: statusLabel,
      serviceType: finalServiceType,
      updatedBy: finalAgentName,
      agentId: finalAgentId,
      timestamp: new Date().toISOString(),
      remark: remark || `Status changed to ${statusLabel}`,
    };

    const newRefurbishData = {
      ...prevRefurbish,
      serviceType: finalServiceType,
      serviceCenterName: serviceCenterName !== undefined ? serviceCenterName : (prevRefurbish.serviceCenterName || ""),
      updatedByAgentId: finalAgentId,
      updatedByAgentName: finalAgentName,
      updatedAt: new Date().toISOString(),
      statusHistory: [historyEntry, ...prevHistory],
    };

    const updateData: any = {
      refurbishData: newRefurbishData,
    };

    if (numericStatus !== undefined) updateData.orderStatus = numericStatus;
    if (numericPaymentStatus !== undefined) updateData.paymentStatus = numericPaymentStatus;
    if (remark) updateData.remark = remark;
    if (issueType) updateData.issueType = issueType;
    if (finalAgentId && !beforeOrder.deliveryAgentId) {
      updateData.deliveryAgentId = finalAgentId;
    }

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
      serviceType: finalServiceType,
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
