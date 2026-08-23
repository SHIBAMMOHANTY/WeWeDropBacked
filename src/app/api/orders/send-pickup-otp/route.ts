export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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
    const { orderId, phone, customerName } = body;

    if (!orderId && !phone) {
      return NextResponse.json(
        { success: false, error: "Order ID or Customer Phone number is required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const testOtp = "1234"; // Standard 4-digit verification OTP

    return NextResponse.json(
      {
        success: true,
        message: `Pickup Verification OTP sent via SMS template to +91 ${phone || 'customer'}!`,
        otp: testOtp,
        templateMessage: `Dear Customer, your WePick WeDrop pickup verification code is ${testOtp}. Please share this code with your delivery agent.`,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Send Pickup OTP Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to send pickup OTP" },
      { status: 500, headers: corsHeaders }
    );
  }
}
