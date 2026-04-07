export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

// In-memory store for prices (replace with DB in production)
let membershipPrices: Record<string, Record<string, number>> = {
  USER: {
    BASIC: 0,
    PREMIUM: 0,
    ELITE: 0,
  },
  BUSINESS: {
    PREMIUM: 0,
    ELITE: 0,
  },
};

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { headers: corsHeaders });
}

// GET: Return current prices
export async function GET() {
  return NextResponse.json(membershipPrices, { headers: corsHeaders });
}

// PATCH: Update price for a membership type
// Body: { category: "USER" | "BUSINESS", type: "BASIC" | "PREMIUM" | "ELITE", price: number }
export async function PATCH(req: NextRequest) {
  try {
    const { category, type, price } = await req.json();
    if (!category || !["USER", "BUSINESS"].includes(category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400, headers: corsHeaders });
    }
    if (!type || !["BASIC", "PREMIUM", "ELITE"].includes(type)) {
      return NextResponse.json({ error: "Invalid type" }, { status: 400, headers: corsHeaders });
    }
    // Business only supports PREMIUM and ELITE
    if (category === "BUSINESS" && type === "BASIC") {
      return NextResponse.json({ error: "BUSINESS category does not support BASIC tier" }, { status: 400, headers: corsHeaders });
    }
    if (typeof price !== "number" || price < 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400, headers: corsHeaders });
    }
    membershipPrices[category][type] = price;
    return NextResponse.json({ success: true, prices: membershipPrices }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update price" }, { status: 500, headers: corsHeaders });
  }
}
