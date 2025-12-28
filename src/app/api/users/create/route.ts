
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
	try {
		const body = await req.json();
		const { phone, role, membership } = body;
		if (!phone) {
			return NextResponse.json({ error: "Phone is required" }, { status: 400 });
		}

		const user = await prisma.user.create({
			data: {
				phone,
				role: role || "USER",
				membership: membership || null,
			},
		});
		return NextResponse.json({ user });
	} catch (error: any) {
		return NextResponse.json({ error: error.message || "Failed to create user" }, { status: 500 });
	}
}
