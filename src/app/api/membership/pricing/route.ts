export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

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

// GET: Return current prices from database
export async function GET() {
  try {
    const prices = await prisma.membershipPricing.findMany();
    
    // Format response as { USER: {...}, BUSINESS: {...} }
    const formattedPrices: Record<string, Record<string, number>> = {
      USER: {},
      BUSINESS: {},
    };
    
    prices.forEach((price) => {
      formattedPrices[price.category][price.type] = price.price;
    });
    
    return NextResponse.json(formattedPrices, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch prices" }, { status: 500, headers: corsHeaders });
  }
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
    
    // Upsert pricing (create if not exists, update if exists)
    await prisma.membershipPricing.upsert({
      where: {
        category_type: {
          category,
          type,
        },
      },
      update: { price },
      create: { category, type, price },
    });
    
    // Fetch all prices and return
    const prices = await prisma.membershipPricing.findMany();
    const formattedPrices: Record<string, Record<string, number>> = {
      USER: {},
      BUSINESS: {},
    };
    
    prices.forEach((p) => {
      formattedPrices[p.category][p.type] = p.price;
    });
    
    return NextResponse.json({ success: true, prices: formattedPrices }, { headers: corsHeaders });
  } catch (error) {
    return NextResponse.json({ error: "Failed to update price" }, { status: 500, headers: corsHeaders });
  }
}
