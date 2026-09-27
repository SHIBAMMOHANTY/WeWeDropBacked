import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function OPTIONS() {
  const response = new Response(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      const response = NextResponse.json({ error: "Array of order IDs is required" }, { status: 400 });
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    const objectIds = ids.filter((id) => typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id));
    const orderIds = ids.filter((id) => typeof id === 'string' && !/^[0-9a-fA-F]{24}$/.test(id));

    const orConditions: any[] = [];
    if (objectIds.length > 0) {
      orConditions.push({ id: { in: objectIds } });
    }
    if (orderIds.length > 0) {
      orConditions.push({ orderId: { in: orderIds } });
    }

    if (orConditions.length === 0) {
      const response = NextResponse.json({
        success: true,
        message: 'No matching orders found to delete',
        count: 0,
      });
      response.headers.set('Access-Control-Allow-Origin', '*');
      return response;
    }

    const updated = await prisma.order.updateMany({
      where: {
        OR: orConditions,
      },
      data: { deleted: true },
    });

    const response = NextResponse.json({
      success: true,
      message: `Successfully deleted ${updated.count} orders`,
      count: updated.count,
    });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  } catch (err: any) {
    console.error("Bulk Delete Orders Error:", err);
    const response = NextResponse.json({ error: err.message || "Failed to bulk delete orders" }, { status: 500 });
    response.headers.set('Access-Control-Allow-Origin', '*');
    return response;
  }
}
