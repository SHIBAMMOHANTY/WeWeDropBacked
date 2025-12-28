import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { verifyOTP } from "@/lib/otp";

export async function POST(req: Request) {
  const { phone, otp } = await req.json();

  // 1️⃣ Verify OTP
  const valid = verifyOTP(phone, otp);
  if (!valid) {
    return NextResponse.json({ error: "Invalid OTP" }, { status: 401 });
  }

  // 2️⃣ Find or create user
  let user = await prisma.user.findUnique({
    where: { phone },
  });

  if (!user) {
    user = await prisma.user.create({
      data: { phone },
    });
  }

  // 3️⃣ SIGN TOKEN WITH UUID (IMPORTANT)
  const token = signToken({
    id: user.id,          // ✅ UUID STRING
    role: user.role,
  });

  // 4️⃣ Response
  return NextResponse.json({
    message: "Login successful",
    token,
    id: user.id,          // ✅ UUID
    phone: user.phone,
    role: user.role,
  });
}
