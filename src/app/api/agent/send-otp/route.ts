export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone } = body;

    if (!phone) {
      return NextResponse.json(
        { success: false, error: "Phone number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();

    // Check if delivery agent exists
    const agent = await prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!agent || agent.role !== "DELIVERY_AGENT") {
      return NextResponse.json(
        { success: false, error: "No delivery agent account found with this phone number" },
        { status: 404, headers: corsHeaders }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { success: false, error: "Agent account is deactivated. Contact Admin." },
        { status: 403, headers: corsHeaders }
      );
    }

    // Default test OTP
    const testOtp = "1234";

    return NextResponse.json(
      {
        success: true,
        message: `OTP sent successfully to ${cleanPhone}. Use OTP ${testOtp} to log in.`,
        otp: testOtp,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Agent Send OTP Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to send OTP" },
      { status: 500, headers: corsHeaders }
    );
  }
}
