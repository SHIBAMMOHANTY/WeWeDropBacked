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
    const existingOrder = await prisma.order.findFirst({ where: { imeiNumber: data.imeiNumber } });
    if (existingOrder) {
      // If something already exists for this IMEI, update its status automatically
      const newStatus: OrderStatus = data.membershipType === "BASIC" ? 1 as OrderStatus : existingOrder.orderStatus as OrderStatus;
      const updated = await prisma.order.update({
        where: { id: existingOrder.id },
        data: { orderStatus: newStatus },
      });

      const statusMap: { [key: number]: string } = {
        0: 'PENDING',
        1: 'PICKUP_REQUESTED',
        '-1': 'REJECTED',
        2: 'READY_FOR_PICKUP',
        3: 'REPAIRING',
        4: 'DELIVERED'
      };

      const response = { ...updated, status: statusMap[updated.orderStatus] || 'UNKNOWN' };
      return NextResponse.json(response, { status: 200 });
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
        // If membership is BASIC, set status to 1 (PICKUP_REQUESTED), else keep PENDING (0)
        orderStatus: data.membershipType === "BASIC" ? 1 : 0,
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
