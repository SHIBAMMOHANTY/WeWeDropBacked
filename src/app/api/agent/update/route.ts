export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agentId, isActive, address, city, state, pincode, serviceArea, username, email } = body;

    if (!agentId) {
      return NextResponse.json(
        { success: false, error: "agentId is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const updateData: any = {};
    if (typeof isActive === "boolean") updateData.isActive = isActive;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (serviceArea !== undefined) updateData.serviceArea = serviceArea;
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;

    const updatedAgent = await prisma.user.update({
      where: { id: String(agentId) },
      data: updateData,
    });

    const { password: _, ...agentData } = updatedAgent;

    return NextResponse.json(
      {
        success: true,
        message: "Agent updated successfully",
        agent: agentData,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Agent Update Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to update agent" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PATCH(req: NextRequest) {
  return POST(req);
}
