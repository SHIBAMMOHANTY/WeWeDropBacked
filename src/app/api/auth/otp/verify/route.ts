import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyOTP } from "@/lib/otp";
import { signToken } from "@/lib/auth";
import { getOrCreateNumericId } from "@/lib/userIdMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { phone, otp } = body;

    // 1. Check Payload
    if (!phone || !otp) {
      return NextResponse.json({ error: "Missing phone or otp" }, { status: 400 });
    }

    // 2. Verify OTP
    // Make sure verifyOTP handles errors gracefully
    const isValid = await verifyOTP(phone, otp); 
    if (!isValid) {
      return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
    }

    // 3. Database Operation (Most likely cause of crash)
    let user = await prisma.user.findUnique({ where: { phone } });
    if (!user) {
        user = await prisma.user.create({ data: { phone } });
    }

    // get a stable numeric id (1,2,3,...) for this user UUID
    const numericId = await getOrCreateNumericId(user.id);

    // Try to persist numericId to the user record (best-effort; safe if field doesn't exist)
    try {
      // skip update if already set
      if ((user as any).numericId !== numericId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { numericId },
        });
      }
    } catch (e) {
      // If the column doesn't exist or update fails, log and continue
      console.warn("[db] Could not persist numericId to user record:", (e as Error).message);
    }

    // sign token using numeric id instead of UUID
    const token = signToken({ id: numericId, role: user.role });

    // return success message, token and numeric id, plus phone & role
    return NextResponse.json({
      message: "Login successful",
      token,
      id: numericId,
      phone,
      role: user.role,
    });

  } catch (error: any) {
    // This logs the REAL error to your terminal so you can see it
    console.error("API Error:", error);

    return NextResponse.json(
      { error: error.message || "Internal Server Error" }, 
      { status: 500 }
    );
  }
}