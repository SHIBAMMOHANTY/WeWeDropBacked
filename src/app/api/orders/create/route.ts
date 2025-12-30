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
      !data.membershipType ||
      !data.brandName ||
      !data.productName ||
      !data.imeiNumber ||
      !data.amount ||
      !data.paymentId // Require paymentId
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Enum validation (safe + simple)
    if (!["BASIC", "PREMIUM"].includes(data.membershipType)) {
      return NextResponse.json(
        { error: "Invalid membership type" },
        { status: 400 }
      );
    }

    const order = await prisma.order.create({
      data: {
        userId: data.userId,
        businessId: data.businessId ?? null,
        membershipType: data.membershipType,
        brandName: data.brandName,
        productName: data.productName,
        imeiNumber: data.imeiNumber,
        billImage: data.billImage ?? "",
        serviceDate: new Date(),
        customerName: data.customerName ?? "",
        contactNumber: data.contactNumber ?? "",
        state: data.state ?? null,
        pincode: data.pincode ?? null,
        fullAddress: data.fullAddress ?? null,
        amount: data.amount,
        paymentId: data.paymentId, // Add paymentId to order
        orderStatus: 0, // 0 = PENDING, 1 = READY_FOR_PICKUP, 2 = REPAIRING, 3 = DELIVERED, -1 = REJECTED
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
