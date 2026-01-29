// src/app/api/orders/create/route.ts

export const runtime = "nodejs";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const data = await req.json();

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

    // Validate Cloudinary URL
    if (typeof data.billFile !== "string" || !data.billFile.startsWith("http")) {
      return NextResponse.json(
        { error: "Invalid billFile URL" },
        { status: 400 }
      );
    }

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
        brandName: data.brand.trim(),
        productName: data.product,
        imeiNumber: data.imei,
        billImage: data.billFile,
        serviceDate: new Date(data.billDate),
        customerName: data.name.trim(),
        contactNumber: data.phone,
        state: data.state,
        pincode: data.pincode,
        fullAddress: data.address || null,
        amount: 0,
        paymentId: null,
        orderStatus: 0, // PENDING
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
