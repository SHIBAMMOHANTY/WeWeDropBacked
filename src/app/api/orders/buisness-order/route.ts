// src/app/api/orders/create/route.ts

export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


type MembershipType = "BASIC" | "PREMIUM";
// Order status: 0 = PENDING, 1 = APPROVED, 2 = REJECTED
type OrderStatus = 0 | 1 | 2;


export async function POST(req: Request) {
  try {
    const data = await req.json();

    // Basic validation
    if (
      !data.userId ||
      !data.businessId ||
      !data.brand ||
      !data.product ||
      !data.imei ||
      !data.name ||
      !data.phone ||
      !data.pincode ||
      !data.plan ||
      !data.state ||
      !data.billDate ||
      !data.billFile
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Validate billFile object
    if (
      typeof data.billFile !== 'object' ||
      !data.billFile.uri ||
      !data.billFile.name ||
      !data.billFile.mimeType ||
      typeof data.billFile.size !== 'number' ||
      typeof data.billFile.lastModified !== 'number'
    ) {
      return NextResponse.json(
        { error: "Invalid billFile structure" },
        { status: 400 }
      );
    }

    // Enum validation (safe + simple)
    if (data.plan !== "membership") {
      return NextResponse.json(
        { error: "Invalid plan" },
        { status: 400 }
      );
    }

    const order = await prisma.order.create({
      data: {
        userId: data.userId,
        businessId: data.businessId,
        membershipType: "BASIC",
        brandName: data.brand,
        productName: data.product,
        imeiNumber: data.imei,
        billImage: data.billFile.uri,
        serviceDate: new Date(data.billDate),
        customerName: data.name,
        contactNumber: data.phone,
        state: data.state,
        pincode: data.pincode,
        fullAddress: data.address,
        amount: 0,
        paymentId: null,
        orderStatus: 0,
      },
    });

    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    console.error("ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
