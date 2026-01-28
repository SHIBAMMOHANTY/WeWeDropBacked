import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";
import { prisma } from "@/lib/prisma";

function setCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  return response;
}

export async function OPTIONS() {
  const response = NextResponse.json({}, { status: 200 });
  return setCorsHeaders(response);
}

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { paymentLinkId } = await req.json();

    if (!paymentLinkId) {
      return setCorsHeaders(
        NextResponse.json(
          { success: false, status: "ERROR", message: "paymentLinkId required" },
          { status: 400 }
        )
      );
    }

    // 1️⃣ Fetch payment link
    const paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);

    // 2️⃣ If NOT paid yet
    if (paymentLink.status !== "paid") {
      return setCorsHeaders(
        NextResponse.json({
          success: true,
          status: "PENDING",
        })
      );
    }

    // 3️⃣ Fetch payments under this link
    const payments = await (razorpay.payments.all as any)({
      payment_link: paymentLinkId,
    });

    // 4️⃣ Find CAPTURED payment
    const successfulPayment = payments.items.find(
      (p: any) => p.status === "captured"
    );

    if (!successfulPayment) {
      return setCorsHeaders(
        NextResponse.json({
          success: true,
          status: "PENDING",
          message: "Payment not captured yet",
        })
      );
    }

    // Update orders and create payment records
    if (!paymentLink.reference_id) {
      return setCorsHeaders(
        NextResponse.json({
          success: false,
          status: "ERROR",
          message: "Invalid reference_id",
        }, { status: 400 })
      );
    }
    const orderIds = JSON.parse(paymentLink.reference_id);
    for (const orderId of orderIds) {
      const order = await prisma.order.findUnique({ where: { id: orderId } });
      if (order) {
        await prisma.order.update({
          where: { id: orderId },
          data: { paymentId: successfulPayment.id }
        });
        await prisma.payment.create({
          data: {
            userId: order.userId,
            orderId: orderId,
            amount: order.amount,
            status: "PAID",
            razorpayId: successfulPayment.id
          }
        });
      }
    }

    // ✅ FINAL SUCCESS RESPONSE
    return setCorsHeaders(
      NextResponse.json({
        success: true,
        status: "PAID",
        paymentId: successfulPayment.id, // pay_XXXX
      })
    );
  } catch (error: any) {
    console.error("Verify payment error:", error);

    return setCorsHeaders(
      NextResponse.json(
        {
          success: false,
          status: "ERROR",
          message:
            error?.error?.description ||
            error?.message ||
            "Verification failed",
        },
        { status: 500 }
      )
    );
  }
}
