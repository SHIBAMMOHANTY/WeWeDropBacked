
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
				const { phone, role, membership, avatar } = body;
		if (!phone) {
			return NextResponse.json({ error: "Phone is required" }, { status: 400, headers: corsHeaders });
		}

		const user = await prisma.user.create({
			data: {
				phone,
				   role: role || "USER",
				   membership: membership || null,
						avatar: typeof avatar === 'string' ? avatar : "",
			},
		});
		return NextResponse.json({ user }, { headers: corsHeaders });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500, headers: corsHeaders });
	}
}
