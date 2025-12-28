import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { username, phone, password } = await req.json();

    if ((!username && !phone) || !password) {
      return NextResponse.json({ error: "Username or phone and password required" }, { status: 400 });
    }

    const orConditions = [];
    if (username) orConditions.push({ username });
    if (phone) orConditions.push({ phone });
    const user = await prisma.user.findFirst({
      where: orConditions.length > 0 ? { OR: orConditions } : {},
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }


    if (!user.password || typeof user.password !== 'string') {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const token = signToken({ id: user.id, role: user.role });
    const { password: _, ...userSafe } = user;
    return NextResponse.json({ user: userSafe, token }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}