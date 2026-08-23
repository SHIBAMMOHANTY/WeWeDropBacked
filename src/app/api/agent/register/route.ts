export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { phone, password, username, name, email } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: "Phone number and password are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();
    const cleanPassword = String(password).trim();
    const agentName = username || name || `Agent-${cleanPhone.slice(-4)}`;

    // Check if phone already exists
    const existingUser = await prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (existingUser) {
      return NextResponse.json(
        { success: false, error: "An account with this phone number already exists" },
        { status: 400, headers: corsHeaders }
      );
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    // Create Agent user
    const agent = await prisma.user.create({
      data: {
        phone: cleanPhone,
        password: hashedPassword,
        username: agentName,
        email: email || null,
        role: "DELIVERY_AGENT",
        isActive: true,
      },
    });

    const { password: _, ...agentData } = agent;

    return NextResponse.json(
      {
        success: true,
        message: "Delivery Agent registered successfully",
        agent: agentData,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Agent Register Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to register delivery agent" },
      { status: 500, headers: corsHeaders }
    );
  }
}
