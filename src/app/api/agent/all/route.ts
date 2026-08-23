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
    const agents = await prisma.user.findMany({
      where: {
        role: "DELIVERY_AGENT",
      },
      orderBy: {
        createdAt: "desc",
      },
      include: {
        deliveryAssignments: {
          select: {
            id: true,
            orderStatus: true,
            productName: true,
            customerName: true,
          },
        },
      },
    });

    const formattedAgents = agents.map(({ password, ...agent }) => ({
      ...agent,
      assignedCount: agent.deliveryAssignments ? agent.deliveryAssignments.length : 0,
    }));

    return NextResponse.json(
      {
        success: true,
        agents: formattedAgents,
        total: formattedAgents.length,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("GET /api/agent/all error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch delivery agents" },
      { status: 500, headers: corsHeaders }
    );
  }
}
