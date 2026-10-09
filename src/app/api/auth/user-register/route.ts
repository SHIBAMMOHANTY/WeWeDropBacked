export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';
import { Role } from '@prisma/client';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      phone, 
      username, 
      password, 
      confirmPassword, 
      role = 'USER', 
      email, 
      avatar,
      profileImage,
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
      // Bank Details
      bankAccountNumber,
      bankIfsc,
      bankName,
      accountHolderName,
      // GST (Optional)
      gstName, 
      gstNumber, 
      gstAddress, 
      gstCertificate 
    } = body;

    if (!phone || !username || !password) {
      return NextResponse.json({ error: 'Missing required fields (Phone, Username, Password)' }, { status: 400, headers: corsHeaders });
    }

    if (confirmPassword && password !== confirmPassword) {
      return NextResponse.json({ error: 'Passwords do not match' }, { status: 400, headers: corsHeaders });
    }

    const cleanPhone = String(phone).trim();
    const normalizedRole = typeof role === 'string' ? role.trim().toUpperCase() : (role ? String(role).toUpperCase() : 'USER');
    const effectiveAvatar = avatar || profileImage || '';

    // If role is DELIVERY_AGENT, enforce DL and Profile Image
    if (normalizedRole === 'DELIVERY_AGENT') {
      if (!dlNumber && !dlPhoto) {
        return NextResponse.json(
          { error: "Driving License (DL Number and Photo) is mandatory for Delivery Agent" },
          { status: 400, headers: corsHeaders }
        );
      }
      if (!effectiveAvatar) {
        return NextResponse.json(
          { error: "Profile Image is mandatory for Delivery Agent" },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    // Check uniqueness
    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ phone: cleanPhone }, { username: String(username).trim() }] },
    });

    if (existingUser) {
      return NextResponse.json({ error: 'Phone or username already exists' }, { status: 409, headers: corsHeaders });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, 10);
    const isActiveFlag = normalizedRole === 'BUSINESS' ? false : true;

    const user = await prisma.user.create({
      data: {
        phone: cleanPhone,
        username: String(username).trim(),
        password: hashed,
        role: normalizedRole as Role,
        email: email || null,
        avatar: effectiveAvatar || '',
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
        gstName: gstName || null,
        gstNumber: gstNumber || null,
        gstAddress: gstAddress || null,
        gstCertificate: gstCertificate || null,
        isActive: isActiveFlag,
      },
      select: {
        id: true,
        phone: true,
        username: true,
        role: true,
        email: true,
        avatar: true,
        membership: true,
        isActive: true,
        createdAt: true,
        address: true,
        city: true,
        state: true,
        pincode: true,
        serviceArea: true,
        aadharNumber: true,
        dlNumber: true,
        dlPhoto: true,
        bankAccountNumber: true,
        bankIfsc: true,
      },
    });

    const token = signToken({ id: user.id, role: user.role });
    return NextResponse.json({ success: true, user, token }, { status: 201, headers: corsHeaders });
  } catch (error: any) {
    console.error('User registration error:', error);
    return NextResponse.json({ error: error.message || 'Failed to register' }, { status: 500, headers: corsHeaders });
  }
}
