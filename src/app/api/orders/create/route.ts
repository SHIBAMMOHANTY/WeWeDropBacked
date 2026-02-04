// src/app/api/orders/create/route.ts

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


type MembershipType = "BASIC" | "PREMIUM";
// Order status: 0 = PENDING, 1 = PICKUP_REQUESTED, -1 = REJECTED, 2 = READY_FOR_PICKUP, 3 = REPAIRING, 4 = DELIVERED
type OrderStatus = 0 | 1 | -1 | 2 | 3 | 4;


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

    // Check for duplicate IMEI
    const existingOrder = await prisma.order.findFirst({
      where: { imeiNumber: data.imeiNumber }
    });
    if (existingOrder) {
      return NextResponse.json(
        { error: "An order with this IMEI already exists" },
        { status: 409 }
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

    const statusMap: { [key: number]: string } = {
      0: 'PENDING',
      1: 'PICKUP_REQUESTED',
      '-1': 'REJECTED',
      2: 'READY_FOR_PICKUP',
      3: 'REPAIRING',
      4: 'DELIVERED'
    };

    const orderWithStatus = {
      ...order,
      status: statusMap[order.orderStatus] || 'UNKNOWN'
    };

    return NextResponse.json(orderWithStatus, { status: 201 });
  } catch (error) {
    console.error("ORDER CREATE ERROR:", error);
    return NextResponse.json(
      { error: "Failed to create order" },
      { status: 500 }
    );
  }
}
