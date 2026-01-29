// src/app/api/orders/create/route.ts

export const runtime = "nodejs";

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

    // Validate billFile - can be a string URL or an object with uri
    if (!data.billFile) {
      return NextResponse.json(
        { error: "billFile is required" },
        { status: 400 }
      );
    }

    let billImageUrl: string;
    if (typeof data.billFile === 'string') {
      billImageUrl = data.billFile;
    } else if (
      typeof data.billFile === 'object' &&
      data.billFile.uri &&
      typeof data.billFile.uri === 'string'
    ) {
      billImageUrl = data.billFile.uri;
    } else {
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
        billImage: billImageUrl,
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

    const statusMap = {
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
