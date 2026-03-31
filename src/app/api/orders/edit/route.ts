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

// PATCH /api/orders/edit/:id
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
	try {
		const { id } = params;
		if (!id) {
			const response = NextResponse.json({ error: "Missing id in URL" }, { status: 400 });
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			return response;
		}
		const updateData = await req.json();
		// Check if order exists and is not deleted
		const order = await prisma.order.findUnique({ where: { id } });
		if (!order || order.deleted) {
			const response = NextResponse.json({ error: "Order not found or deleted" }, { status: 404 });
			response.headers.set('Access-Control-Allow-Origin', '*');
			response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
			response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
			return response;
		}
		// Prevent editing the primary key and deleted directly
		delete updateData.id;
		delete updateData.deleted;
		const updated = await prisma.order.update({
			where: { id },
			data: updateData,
		});
		const response = NextResponse.json({ success: true, order: updated });
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		return response;
	} catch (error) {
		console.error("ORDER EDIT ERROR:", error);
		const response = NextResponse.json({ error: "Failed to edit order" }, { status: 500 });
		response.headers.set('Access-Control-Allow-Origin', '*');
		response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
		response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
		return response;
	}
}
