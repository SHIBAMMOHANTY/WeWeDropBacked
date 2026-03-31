import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401, headers: corsHeaders });
    }

    const data = await req.json();
    if (!data.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400, headers: corsHeaders });
    }


    // Enum mappings
    const membershipTypeMap: Record<string | number, string> = {
      'BASIC': 'BASIC', 'basic': 'BASIC', 0: 'BASIC',
      'PREMIUM': 'PREMIUM', 'premium': 'PREMIUM', 1: 'PREMIUM',
      'ELITE': 'ELITE', 'elite': 'ELITE', 2: 'ELITE',
    };
    const orderStatusMap: Record<string | number, string> = {
      0: 'PENDING', 'PENDING': 'PENDING',
      1: 'PICKUP_REQUESTED', 'PICKUP_REQUESTED': 'PICKUP_REQUESTED',
      '-1': 'REJECTED', -1: 'REJECTED', 'REJECTED': 'REJECTED',
      2: 'READY_FOR_PICKUP', 'READY_FOR_PICKUP': 'READY_FOR_PICKUP',
      3: 'REPAIRING', 'REPAIRING': 'REPAIRING',
      4: 'DELIVERED', 'DELIVERED': 'DELIVERED',
    };

    const allowedFields = [
      "membershipType", "brandName", "productName", "imeiNumber", "billImage",
      "customerName", "contactNumber", "state", "pincode", "fullAddress",
      "amount", "preferredDate", "orderStatus"
    ];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        if (key === 'membershipType') {
          const mapped = membershipTypeMap[data[key]];
          if (mapped) updateData[key] = mapped;
        } else if (key === 'orderStatus') {
          const mapped = orderStatusMap[data[key]];
          if (mapped) updateData[key] = mapped;
        } else {
          updateData[key] = data[key];
        }
      }
    }
    if (updateData.preferredDate) {
      updateData.preferredDate = new Date(updateData.preferredDate);
    }

    const updated = await prisma.order.update({
      where: { id: data.id, deleted: false },
      data: updateData,
    });

    return NextResponse.json(updated, { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("ORDER EDIT ERROR:", error);
    return NextResponse.json({ error: "Failed to edit order" }, { status: 500, headers: corsHeaders });
  }
}
