// src/app/api/auth/login/route.ts
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  const business = await prisma.business.findUnique({ where: { email } });

  if (!business || !business.approved)
    return NextResponse.json({ error: "Not approved" }, { status: 403 });

  const match = await bcrypt.compare(password, business.password);
  if (!match)
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });

  return NextResponse.json({
    token: signToken({ id: business.id, role: "BUSINESS" }),
  });
}
