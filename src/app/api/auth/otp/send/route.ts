export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma"; // Make sure this path is correct!
import { sendOTP } from "@/lib/otp";
import { getOrCreateNumericId } from "@/lib/userIdMap";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { phone } = body;

    // basic validation / normalization
    if (!phone || typeof phone !== "string") {
      return NextResponse.json({ error: "Phone is required" }, { status: 400 });
    }
    phone = phone.trim();

    console.log("Attempting to save user to DB...");

    // upsert user
    const user = await prisma.user.upsert({
      where: { phone },
      create: { phone },
      update: {},
    });

    console.log("User saved:", { id: user.id, phone: user.phone });

    // allocate stable numeric id and persist to DB (best-effort)
    try {
      const numericId = await getOrCreateNumericId(user.id);
      if ((user as any).numericId !== numericId) {
        await prisma.user.update({
          where: { id: user.id },
          data: { numericId },
        });
      }
      console.log("Numeric ID assigned:", numericId);
    } catch (e) {
      console.warn("[db] Could not assign numericId:", (e as Error).message);
    }

    // send OTP and handle failures
    let devMode = false;
    let generatedOtp: string | undefined;
    try {
      const result = await sendOTP(phone);
      devMode = result.devMode;
      generatedOtp = result.otp;
    } catch (e) {
      console.error("[otp] sendOTP failed:", (e as Error).message);
      return NextResponse.json({ error: "Failed to send OTP" }, { status: 500 });
    }

    // In dev mode (no MSG91 configured), return the OTP directly in the response
    if (devMode) {
      return NextResponse.json({
        success: true,
        message: "OTP generated (dev mode — no WhatsApp sent)",
        phone,
        otp: generatedOtp, // ⚠️ remove this in production
        dev: true,
      });
    }

    return NextResponse.json({ success: true, message: "OTP sent", phone });

  } catch (error: any) {
    console.error("--------------------------------");
    console.error("SEND OTP ERROR:", error);
    console.error("--------------------------------");
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 }
    );
  }
}