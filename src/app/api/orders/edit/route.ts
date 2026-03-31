import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/orders/edit/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
	try {
		const { id } = params;
		if (!id) {
			return NextResponse.json({ error: "Missing id in URL" }, { status: 400 });
		}
		const updateData = await req.json();
		// Check if order exists and is not deleted
		const order = await prisma.order.findUnique({ where: { id } });
		if (!order || order.isDeleted) {
			return NextResponse.json({ error: "Order not found or deleted" }, { status: 404 });
		}
		// Prevent editing the primary key and isDeleted directly
		delete updateData.id;
		delete updateData.isDeleted;
		const updated = await prisma.order.update({
			where: { id },
			data: updateData,
		});
		return NextResponse.json({ success: true, order: updated });
	} catch (error) {
		console.error("ORDER EDIT ERROR:", error);
		return NextResponse.json({ error: "Failed to edit order" }, { status: 500 });
	}
}
