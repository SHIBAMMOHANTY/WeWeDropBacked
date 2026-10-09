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
      role = 'DELIVERY_AGENT',
      avatar,
      profileImage,
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
      // Bank Details (Optional)
      bankAccountNumber,
      bankIfsc,
      bankName,
      accountHolderName,
      isActive = true, // default active when admin registers
    } = body;

    if (!phone || !password) {
      return NextResponse.json(
        { success: false, error: "Phone number and password are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const cleanPhone = String(phone).trim();
    const cleanPassword = String(password).trim();
    const agentName = username || name || `Staff-${cleanPhone.slice(-4)}`;
    const effectiveAvatar = avatar || profileImage || '';

    const normalizedRole = ['REFURBISH_TEAM', 'SELLING_TEAM', 'DELIVERY_AGENT', 'BUSINESS', 'USER', 'ADMIN'].includes(String(role).toUpperCase())
      ? (String(role).toUpperCase() as any)
      : 'DELIVERY_AGENT';

    // Check mandatory fields for DELIVERY_AGENT
    if (normalizedRole === 'DELIVERY_AGENT') {
      if (!dlNumber && !dlPhoto) {
        return NextResponse.json(
          { success: false, error: "Driving License (DL Number and Photo) is mandatory for Delivery Agent" },
          { status: 400, headers: corsHeaders }
        );
      }
      if (!effectiveAvatar) {
        return NextResponse.json(
          { success: false, error: "Profile Image is mandatory for Delivery Agent" },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const defaultIsActive = typeof isActive === "boolean" ? isActive : true;

    // Check if user with this phone already exists
    const existingUser = await prisma.user.findUnique({
      where: { phone: cleanPhone },
    });

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);

    if (existingUser) {
      if (existingUser.role === "SUPER_ADMIN") {
        return NextResponse.json(
          { success: false, error: "This phone number is registered with a Super Admin account and cannot be modified." },
          { status: 400, headers: corsHeaders }
        );
      }

      // Update existing user with staff role & credentials
      const updatedAgent = await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          role: normalizedRole,
          password: hashedPassword,
          username: agentName,
          email: email || existingUser.email,
          avatar: effectiveAvatar || existingUser.avatar,
          isActive: defaultIsActive,
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
          bankAccountNumber: bankAccountNumber || (existingUser as any).bankAccountNumber,
          bankIfsc: bankIfsc || (existingUser as any).bankIfsc,
          bankName: bankName || (existingUser as any).bankName,
          accountHolderName: accountHolderName || (existingUser as any).accountHolderName,
        },
      });

      const { password: _, ...agentData } = updatedAgent;

      return NextResponse.json(
        {
          success: true,
          message: `Account updated and assigned role ${normalizedRole}`,
          agent: agentData,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // Create new user in DB
    const agent = await prisma.user.create({
      data: {
        phone: cleanPhone,
        password: hashedPassword,
        username: agentName,
        email: email || null,
        role: normalizedRole,
        avatar: effectiveAvatar || '',
        isActive: defaultIsActive,
        address: address || null,
        city: city || null,
        state: state || null,
        pincode: pincode || null,
        serviceArea: serviceArea || null,
        aadharNumber: aadharNumber || null,
        aadharFront: aadharFront || null,
        aadharBack: aadharBack || null,
        dlNumber: dlNumber || null,
        dlPhoto: dlPhoto || null,
        otherDoc: otherDoc || null,
        bankAccountNumber: bankAccountNumber || null,
        bankIfsc: bankIfsc || null,
        bankName: bankName || null,
        accountHolderName: accountHolderName || null,
      },
    });

    const { password: _, ...agentData } = agent;

    return NextResponse.json(
      {
        success: true,
        message: `Registered successfully as ${normalizedRole}`,
        agent: agentData,
      },
      { status: 201, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error("Staff Registration error:", error);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to register staff" },
      { status: 500, headers: corsHeaders }
    );
  }
}
