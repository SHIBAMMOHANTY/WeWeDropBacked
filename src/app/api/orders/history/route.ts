export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type, Authorization",
	"Access-Control-Max-Age": "86400",
};

export async function OPTIONS() {
	return new NextResponse(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
	try {
		const { searchParams } = new URL(req.url);
		const orderId = searchParams.get("orderId");
		const userId = searchParams.get("userId");
		const sourceType = searchParams.get("sourceType");
		const sourceRoute = searchParams.get("sourceRoute");
		const limit = Math.min(Number(searchParams.get("limit") ?? "100"), 500);

		const where: Record<string, unknown> = {};
		if (orderId) where.orderId = orderId;
		if (userId) where.userId = userId;
		if (sourceType) where.sourceType = sourceType;
		if (sourceRoute) where.sourceRoute = sourceRoute;

		const history = await prisma.orderHistory.findMany({
			where,
			orderBy: { createdAt: "desc" },
			take: limit,
		});

		const seenOrderIds = new Set<string>();
		const compactHistory = history.filter((entry) => {
			if (seenOrderIds.has(entry.orderId)) {
				return false;
			}
			seenOrderIds.add(entry.orderId);
			return true;
		}).map((entry) => ({
			orderId: entry.orderId,
			afterState: entry.afterState,
			createdAt: entry.createdAt,
		}));

		return NextResponse.json(
			{
				count: compactHistory.length,
				history: compactHistory,
			},
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error("GET /api/orders/history error:", error);
		return NextResponse.json(
			{ error: "Failed to fetch order history" },
			{ status: 500, headers: corsHeaders }
		);
	}
}
