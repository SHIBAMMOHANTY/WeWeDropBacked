export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
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
    const { phone, password } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: "Phone number and password are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();
    const cleanPassword = String(password).trim();

    // Find agent user
    const agent = await prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    if (!agent || agent.role !== "DELIVERY_AGENT") {
      return NextResponse.json(
        { success: false, error: "Invalid delivery agent credentials" },
        { status: 401, headers: corsHeaders }
      );
    }

    if (!agent.isActive) {
      return NextResponse.json(
        { success: false, error: "Agent account is deactivated. Contact Admin." },
        { status: 403, headers: corsHeaders }
      );
    }

    // Verify password
    let isMatch = false;
    if (agent.password) {
      // Check bcrypt match or direct comparison if legacy plaintext
      if (agent.password.startsWith("$2a$") || agent.password.startsWith("$2b$")) {
        isMatch = await bcrypt.compare(cleanPassword, agent.password);
      } else {
        isMatch = agent.password === cleanPassword;
      }
    }

    if (!isMatch) {
      return NextResponse.json(
        { success: false, error: "Invalid delivery agent credentials" },
        { status: 401, headers: corsHeaders }
      );
    }

    // Sign JWT Token
    const token = signToken({
      id: agent.id,
      phone: agent.phone,
      role: agent.role,
      username: agent.username,
    });

    const { password: _, ...agentData } = agent;

    return NextResponse.json(
      {
        success: true,
        message: "Agent logged in successfully",
        token,
        agent: agentData,
      },
      { headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Agent Login Error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to log in agent" },
      { status: 500, headers: corsHeaders }
    );
  }
}
