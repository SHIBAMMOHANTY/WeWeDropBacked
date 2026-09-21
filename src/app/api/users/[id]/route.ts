export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'no-referrer'
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        username: true,
        email: true,
        avatar: true,
        role: true,
        membership: true,
        isActive: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        serviceArea: true,
        gstName: true,
        gstNumber: true,
        gstAddress: true,
        aadharNumber: true,
        aadharFront: true,
        aadharBack: true,
        dlNumber: true,
        dlPhoto: true,
        otherDoc: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" }, { 
        status: 404,
        headers: corsHeaders
      });
    }

    return NextResponse.json({ success: true, user }, {
      headers: corsHeaders
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch user" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const body = await req.json();

    const {
      username,
      name,
      email,
      phone,
      password,
      role,
      userType,
      gstName,
      gstNumber,
      gstAddress,
      gstCertificate,
      isActive,
      avatar,
      address,
      city,
      state,
      pincode,
      serviceArea,
      aadharNumber,
      dlNumber,
    } = body;

    const updateData: any = {};
    if (username !== undefined || name !== undefined) updateData.username = username || name;
    if (email !== undefined) updateData.email = email;
    if (phone !== undefined) updateData.phone = String(phone).trim();
    if (password !== undefined && password) {
      const hashedPassword = await bcrypt.hash(String(password).trim(), 10);
      updateData.password = hashedPassword;
    }

    const rawRole = (role || userType || '').toUpperCase();
    if (rawRole) {
      if (['SUPER_ADMIN', 'USER', 'BUSINESS', 'DELIVERY_AGENT', 'REFURBISH_TEAM', 'SELLING_TEAM'].includes(rawRole)) {
        updateData.role = rawRole;
      }
    }

    if (gstName !== undefined) updateData.gstName = gstName;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;
    if (gstAddress !== undefined) updateData.gstAddress = gstAddress;
    if (gstCertificate !== undefined) updateData.gstCertificate = gstCertificate;
    if (address !== undefined) updateData.address = address;
    if (city !== undefined) updateData.city = city;
    if (state !== undefined) updateData.state = state;
    if (pincode !== undefined) updateData.pincode = pincode;
    if (serviceArea !== undefined) updateData.serviceArea = serviceArea;
    if (aadharNumber !== undefined) updateData.aadharNumber = aadharNumber;
    if (dlNumber !== undefined) updateData.dlNumber = dlNumber;

    if (avatar !== undefined) {
      updateData.avatar = typeof avatar === 'string' ? avatar : "";
    }

    if (isActive !== undefined) {
      if (typeof isActive === 'boolean') updateData.isActive = isActive;
      else if (typeof isActive === 'string') updateData.isActive = isActive.toLowerCase() === 'true';
      else if (typeof isActive === 'number') updateData.isActive = Boolean(isActive);
    }

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    const { password: _, ...cleanData } = updatedUser;

    return NextResponse.json({ success: true, message: "User updated successfully", user: cleanData }, {
      headers: corsHeaders
    });
  } catch (err: any) {
    console.error("PATCH /api/users/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to update user" },
      { status: 500, headers: corsHeaders }
    );
  }
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  return PATCH(req, ctx);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = params;

    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, error: "User not found" }, { status: 404, headers: corsHeaders });
    }

    await prisma.user.delete({ where: { id } });

    return NextResponse.json({
      success: true,
      message: "User deleted successfully",
      deletedId: id,
    }, { headers: corsHeaders });
  } catch (err: any) {
    console.error("DELETE /api/users/[id] error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to delete user" },
      { status: 500, headers: corsHeaders }
    );
  }
}
