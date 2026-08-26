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

    const quotes = await prisma.quote.findMany({
      where: {
        agentId: targetAgentId,
      },
      select: {
        id: true,
        quoteNumber: true,
        customerName: true,
        contactNumber: true,
        brand: true,
        model: true,
        storage: true,
        condition: true,
        estimatedPrice: true,
        finalPrice: true,
        customerAddress: true,
        customerPincode: true,
        status: true,
        pickupDate: true,
        images: true,
        createdAt: true,
        description: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(
      {
        success: true,
        quotes,
        total: quotes.length,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("GET /api/quote/agent Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch agent quotes" },
      { status: 500, headers: corsHeaders }
    );
  }
}
