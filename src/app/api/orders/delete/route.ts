import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// DELETE /api/orders/delete/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
	try {
		const { id } = params;
		if (!id) {
			return NextResponse.json({ error: "Missing id in URL" }, { status: 400 });
		}
		const updated = await prisma.order.update({
			where: { id },
			data: { isDeleted: true },
		});
		return NextResponse.json({ success: true, order: updated });
	} catch (error) {
		console.error("ORDER SOFT DELETE ERROR:", error);
		return NextResponse.json({ error: "Failed to soft delete order" }, { status: 500 });
	}
}
