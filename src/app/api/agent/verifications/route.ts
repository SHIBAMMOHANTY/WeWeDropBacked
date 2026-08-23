export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  try {
    // Fast optimized query: Only get orders that are assigned to a Delivery Agent (deliveryAgentId is not null/empty)
    const orders = await prisma.order.findMany({
      where: {
        deleted: false,
        deliveryAgentId: {
          not: null,
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        orderId: true,
        customerName: true,
        contactNumber: true,
        brandName: true,
        productName: true,
        imeiNumber: true,
        pickupAddress: true,
        fullAddress: true,
        membershipType: true,
        amount: true,
        orderStatus: true,
        status: true,
        billImage: true,
        condition: true,
        deliveryAgentId: true,
        proofImages: true,
        inspectionChecklist: true,
        agentRemarks: true,
        verifiedAt: true,
        createdAt: true,
        deliveryAgent: {
          select: {
            id: true,
            username: true,
            phone: true,
            serviceArea: true,
          },
        },
      },
    });

    const executionTimeMs = Date.now() - startTime;

    return NextResponse.json(
      {
        success: true,
        count: orders.length,
        responseTimeMs: executionTimeMs,
        verifications: orders,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Agent Verifications API Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch agent verifications" },
      { status: 500, headers: corsHeaders }
    );
  }
}
