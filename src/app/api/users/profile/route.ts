import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token) as { id: string };

    if (typeof decoded.id !== "string") {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 });
    }

   const user = await prisma.user.findUnique({
      where: { id: decoded.id },
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
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, user });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Invalid token" },
      { status: 401 }
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token) as { id: string };

    if (typeof decoded.id !== "string") {
      return NextResponse.json({ error: "Invalid token payload" }, { status: 401 });
    }

    const body = await req.json();
    const { username, email, password, gstName, gstNumber, gstAddress, gstCertificate } = body;

    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (email !== undefined) updateData.email = email;
    if (password !== undefined) updateData.password = password;
    if (gstName !== undefined) updateData.gstName = gstName;
    if (gstNumber !== undefined) updateData.gstNumber = gstNumber;
    if (gstAddress !== undefined) updateData.gstAddress = gstAddress;
    if (gstCertificate !== undefined) updateData.gstCertificate = gstCertificate;

    const updatedUser = await prisma.user.update({
      where: { id: decoded.id },
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

    return NextResponse.json({ success: true, user: updatedUser });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update user" },
      { status: 500 }
    );
  }
}
