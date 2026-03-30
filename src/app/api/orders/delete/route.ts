import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const data = await req.json();
    if (!data.id) {
      return NextResponse.json({ error: "Missing order id" }, { status: 400 });
    }

    const deletedOrder = await prisma.order.update({
      where: { id: data.id, deleted: false },
      data: { deleted: true },
    });

    return NextResponse.json({ success: true, order: deletedOrder }, { status: 200 });
  } catch (error) {
    console.error("ORDER DELETE ERROR:", error);
    return NextResponse.json({ error: "Failed to delete order" }, { status: 500 });
  }
}
