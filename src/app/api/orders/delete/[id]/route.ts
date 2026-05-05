// OPTIONS handler for CORS preflight
export async function OPTIONS() {
	const response = new Response(null, { status: 204 });
	response.headers.set('Access-Control-Allow-Origin', '*');
	response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
	response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	return response;
}
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

function toJsonSafe(value: any) {
	if (value === undefined) return null;
	return JSON.parse(JSON.stringify(value));
}

// DELETE /api/orders/delete/:id
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
	try {
		const { id } = params;
		if (!id) {
			const response = NextResponse.json({ error: "Missing id in URL" }, { status: 400 });
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			return response;
		}

		const existingOrder = await prisma.order.findUnique({ where: { id } });
		if (!existingOrder) {
			const response = NextResponse.json({ error: "Order not found" }, { status: 404 });
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			return response;
		}

		const updated = await prisma.order.update({
			where: { id },
			data: { deleted: true },
		});

		await prisma.orderHistory.create({
			data: {
				orderId: existingOrder.orderId ?? existingOrder.id,
				userId: existingOrder.userId ?? null,
				actionType: "DELETE",
				sourceType: "DELETE",
				sourceRoute: "/api/orders/delete/[id]",
				requestPayload: null,
				appliedPayload: toJsonSafe({ deleted: true }),
				beforeState: toJsonSafe(existingOrder),
				afterState: toJsonSafe(updated),
				batchId: null,
			},
		});

		const response = NextResponse.json({ success: true, order: updated });
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		return response;
	} catch (error) {
		console.error("ORDER SOFT DELETE ERROR:", error);
		const response = NextResponse.json({ error: "Failed to soft delete order" }, { status: 500 });
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		return response;
	}
}
