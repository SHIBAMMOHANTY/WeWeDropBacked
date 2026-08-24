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
    const { 
      phone, 
      password, 
      username, 
      name, 
      email,
      // Location & Address
      address,
      city,
      state,
      pincode,
      serviceArea,
      // Verification Documents
      aadharNumber,
      aadharFront,
      aadharBack,
      dlNumber,
      dlPhoto,
      otherDoc,
      isActive, // optional override by admin
    } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: "Phone number and password are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();
    const cleanPassword = String(password).trim();
    const agentName = username || name || `Agent-${cleanPhone.slice(-4)}`;

    // Default isActive to false (Disabled / Pending Approval) unless specified by admin
    const defaultIsActive = typeof isActive === "boolean" ? isActive : false;

    // Check if user with this phone already exists
    const existingUser = await prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    if (existingUser) {
      if (existingUser.role === "DELIVERY_AGENT") {
        return NextResponse.json(
          { success: false, error: "A delivery agent account with this phone number already exists" },
          { status: 400, headers: corsHeaders }
        );
      }
      if (existingUser.role === "SUPER_ADMIN" || existingUser.role === "BUSINESS") {
        return NextResponse.json(
          { success: false, error: "This phone number is registered with an Admin or Business account and cannot be converted." },
          { status: 400, headers: corsHeaders }
        );
      }

      // If user exists as regular customer/user, convert/enable role to DELIVERY_AGENT with agent credentials
      const updatedAgent = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: "DELIVERY_AGENT",
          password: hashedPassword,
          username: agentName,
          email: email || existingUser.email,
          isActive: defaultIsActive, // Default Disabled until admin activates
          address: address || existingUser.address,
          city: city || existingUser.city,
          state: state || existingUser.state,
          pincode: pincode || existingUser.pincode,
          serviceArea: serviceArea || existingUser.serviceArea,
          aadharNumber: aadharNumber || existingUser.aadharNumber,
          aadharFront: aadharFront || existingUser.aadharFront,
          aadharBack: aadharBack || existingUser.aadharBack,
          dlNumber: dlNumber || existingUser.dlNumber,
          dlPhoto: dlPhoto || existingUser.dlPhoto,
          otherDoc: otherDoc || existingUser.otherDoc,
        },
      });

      const { password: _, ...agentData } = updatedAgent;

      return NextResponse.json(
        {
          success: true,
          message: "Account registered as Delivery Agent (Pending Admin Activation)",
          agent: agentData,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Create new Agent user if phone does not exist in DB (Default Disabled: false)
    const agent = await prisma.user.create({
      data: {
        phone: cleanPhone,
        password: hashedPassword,
        username: agentName,
        email: email || null,
        role: "DELIVERY_AGENT",
        isActive: defaultIsActive, // Default Disabled until admin activates
        // Location & Address
        address: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        serviceArea: serviceArea || null,
        // Verification Docs
        aadharNumber: aadharNumber || null,
        aadharFront: aadharFront || null,
        aadharBack: aadharBack || null,
        dlNumber: dlNumber || null,
        dlPhoto: dlPhoto || null,
        otherDoc: otherDoc || null,
      },
    });

    const { password: _, ...agentData } = agent;

    return NextResponse.json(
      {
        success: true,
        message: "Delivery Agent registered successfully (Pending Admin Activation)",
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
