import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401, headers: corsHeaders });
    }

    const data = await req.json();
    if (!data.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400, headers: corsHeaders });
    }

    // Only allow updating certain fields
    const allowedFields = [
      "membershipType", "brandName", "productName", "imeiNumber", "billImage",
      "customerName", "contactNumber", "state", "pincode", "fullAddress",
      "amount", "preferredDate", "orderStatus"
    ];
    const updateData: any = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
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
