import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/all
export async function GET(req: NextRequest) {
  try {
    const orders = await prisma.order.findMany({
      orderBy: { id: "desc" },
    });
    return NextResponse.json(orders);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch all orders" }, { status: 500 });
  }
}
