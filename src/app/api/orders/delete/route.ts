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
		const updated = await prisma.order.update({
			where: { id },
			data: { deleted: true },
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
