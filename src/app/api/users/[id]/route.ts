export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import bcrypt from 'bcryptjs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Referrer-Policy': 'no-referrer'
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: corsHeaders
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token) as { id: string; role?: string };

    if (typeof decoded.id !== "string") {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 });
    }

    const { id } = params;

    // Allow access if requesting own profile or is SUPER_ADMIN
    if (id !== decoded.id && decoded.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: "Forbidden" }, { 
        status: 403,
        headers: corsHeaders
      });
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        username: true,
        email: true,
        role: true,
        membership: true,
        isActive: true,
        createdAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { 
        status: 404,
        headers: corsHeaders
      });
    }

    return NextResponse.json({ success: true, user }, {
      headers: corsHeaders
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Invalid token" },
      { 
        status: 401,
        headers: corsHeaders
      }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { 
        status: 401,
        headers: corsHeaders
      });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token) as { id: string; role?: string };

    if (typeof decoded.id !== "string") {
      return NextResponse.json({ error: "Invalid token payload" }, { 
        status: 401,
        headers: corsHeaders
      });
    }

    const { id } = params;

    // Allow update if own profile or is SUPER_ADMIN
    if (id !== decoded.id && decoded.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: "Forbidden" }, { 
        status: 403,
        headers: corsHeaders
      });
    }

    const body = await req.json();
    const { username, email, password, gstName, gstNumber, gstAddress, gstCertificate } = body;

    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined) {
      const hashedPassword = await bcrypt.hash(password, 10);
      updateData.password = hashedPassword;
    }
    if (gstName !== undefined) updateData.gstName = gstName;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;
    if (gstAddress !== undefined) updateData.gstAddress = gstAddress;
    if (gstCertificate !== undefined) updateData.gstCertificate = gstCertificate;

    const updatedUser = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        phone: true,
        username: true,
        email: true,
        role: true,
        membership: true,
        isActive: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, user: updatedUser }, {
      headers: corsHeaders
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { 
        status: 500,
        headers: corsHeaders
      }
    );
  }
}