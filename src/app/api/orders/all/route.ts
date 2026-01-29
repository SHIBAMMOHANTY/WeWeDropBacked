import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/all
export async function GET(req: NextRequest) {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { id: "desc" },
    });
    console.log(`Fetched ${orders.length} orders from /all`);
    console.log('First order status:', orders[0]?.orderStatus);

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const ordersWithStatus = orders.map(order => ({
      ...order,
      status: statusMap[order.orderStatus] || 'UNKNOWN'
    }));

    return NextResponse.json(ordersWithStatus);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch all orders" }, { status: 500 });
  }
}
