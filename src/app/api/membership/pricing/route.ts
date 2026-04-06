export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory store for prices (replace with DB in production)
let membershipPrices: Record<string, number> = {
  BASIC: 0,
  PREMIUM: 0,
  ELITE: 0,
};

// GET: Return current prices
export async function GET() {
  return NextResponse.json(membershipPrices);
}

// PATCH: Update price for a membership type
// Body: { type: "BASIC" | "PREMIUM" | "ELITE", price: number }
export async function PATCH(req: NextRequest) {
  try {
    const { type, price } = await req.json();
    if (!type || !["BASIC", "PREMIUM", "ELITE"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400 });
    }
    if (typeof price !== "number" || price < 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400 });
    }
    membershipPrices[type] = price;
    return NextResponse.json({ success: true, prices: membershipPrices });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update price" }, { status: 500 });
  }
}
