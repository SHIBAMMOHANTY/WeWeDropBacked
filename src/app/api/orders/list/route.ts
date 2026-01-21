// TODO: implement orders list route
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// GET /api/orders/list?userId=123
export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const userId = searchParams.get("userId");
		if (!userId) {
			return NextResponse.json({ error: "Missing userId" }, { status: 400 });
		}
		const orders = await prisma.order.findMany({
			where: { userId: userId },
			orderBy: { id: "desc" },
		});
		return NextResponse.json(orders);
	} catch (error) {
		return NextResponse.json({ error: "Failed to fetch orders" }, { status: 500 });
	}
}

// PATCH /api/orders/list?id=123
export async function PATCH(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const id = searchParams.get("id");
		if (!id) {
			return NextResponse.json({ error: "Missing id" }, { status: 400 });
		}
		const data = await req.json();
		const updatedOrder = await prisma.order.update({
			where: { id: Number(id) },
			data,
		});
		return NextResponse.json(updatedOrder);
	} catch (error) {
		return NextResponse.json({ error: "Failed to update order" }, { status: 500 });
	}
}
// TODO: implement orders list route
