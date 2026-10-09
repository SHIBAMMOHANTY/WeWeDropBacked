export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyOTP } from "@/lib/otp";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  const body = await req.json();
  const { phone, otp, checkOnly } = body;

  if (!phone || !otp) {
    return NextResponse.json({ error: "Phone number and OTP are required" }, { status: 400, headers: corsHeaders });
  }

  // 1️⃣ Verify OTP (must await — it's async!)
  const valid = await verifyOTP(phone, otp);
  if (!valid) {
    return NextResponse.json({ error: "Invalid OTP or expired" }, { status: 401, headers: corsHeaders });
  }

  // If checkOnly is true (used for Registration verification before account is created)
  if (checkOnly) {
    return NextResponse.json(
      { success: true, verified: true, message: "Mobile number verified successfully via OTP" },
      { headers: corsHeaders }
    );
  }

  // Generate search variants for robust matching
  const digits = phone.replace(/\D/g, '');
  const searchPhones: string[] = [phone, phone.trim()];
  if (digits) {
    searchPhones.push(digits);
    if (digits.length === 10) {
      searchPhones.push(`+91${digits}`);
      searchPhones.push(`91${digits}`);
    } else if (digits.length === 12 && digits.startsWith('91')) {
      const tenDigits = digits.slice(2);
      searchPhones.push(tenDigits);
      searchPhones.push(`+91${tenDigits}`);
    }
  }
  const uniqueSearchPhones = Array.from(new Set(searchPhones.filter(Boolean)));

  // Helper to query and sort users by completeness to avoid duplicate empty accounts
  const getBestUser = async (whereClause: any) => {
    const list = await prisma.user.findMany({ where: whereClause });
    if (list.length === 0) return null;
    return list.sort((a, b) => {
      const aHasName = !!a.username;
      const bHasName = !!b.username;
      if (aHasName !== bHasName) return aHasName ? -1 : 1;
      const aHasEmail = !!a.email;
      const bHasEmail = !!b.email;
      if (aHasEmail !== bHasEmail) return aHasEmail ? -1 : 1;
      return a.phone.length - b.phone.length;
    })[0];
  };

  // Helper to query and sort businesses by completeness
  const getBestBusiness = async (whereClause: any) => {
    const list = await prisma.business.findMany({ where: whereClause });
    if (list.length === 0) return null;
    return list.sort((a, b) => {
      const aHasName = !!a.dealerName;
      const bHasName = !!b.dealerName;
      if (aHasName !== bHasName) return aHasName ? -1 : 1;
      return a.contactNumber.length - b.contactNumber.length;
    })[0];
  };

  // 2️⃣ Find existing user or business account
  let userFound = await getBestUser({ phone: { in: uniqueSearchPhones } });

  let businessFound = null;
  if (!userFound) {
    businessFound = await getBestBusiness({ contactNumber: { in: uniqueSearchPhones } });
  }

  // Fallback if not found in either table
  if (!userFound && !businessFound) {
    userFound = await prisma.user.create({
      data: { phone },
    });
  }

  // 3️⃣ SIGN TOKEN WITH UUID & Response
  if (userFound) {
    const token = signToken({
      id: userFound.id,          // ✅ UUID STRING
      role: userFound.role,
    });

    return NextResponse.json({
      message: "Login successful",
      token,
      id: userFound.id,
      phone: userFound.phone,
      role: userFound.role,
      name: userFound.username || null,
      username: userFound.username || null,
      avatar: userFound.avatar || '',
      email: userFound.email || null,
      membership: userFound.membership || 'BASIC',
      type: 'USER',
    }, { headers: corsHeaders });
  }

  if (businessFound) {
    const token = signToken({
      id: businessFound.id,
      role: 'BUSINESS',
    });

    return NextResponse.json({
      message: "Business login successful",
      token,
      id: businessFound.id,
      phone: businessFound.contactNumber,
      role: 'BUSINESS',
      name: businessFound.dealerName || null,
      username: businessFound.dealerName || null,
      avatar: '',
      email: businessFound.email || null,
      membership: null,
      type: 'BUSINESS',
    }, { headers: corsHeaders });
  }

  return NextResponse.json({ error: "Failed to authenticate account" }, { status: 500, headers: corsHeaders });
}
