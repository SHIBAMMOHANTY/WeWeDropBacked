import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { paymentLinkId } = await req.json();

    if (!paymentLinkId) {
      return NextResponse.json(
        {
          success: false,
          status: "UNPAID",
          message: "paymentLinkId is required",
        },
        { status: 400 }
      );
    }

    let paymentLink;
    try {
      paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);
    } catch (error) {
      // Invalid or not found payment link
      return NextResponse.json(
        {
          success: false,
          status: "UNPAID",
          message: "Invalid or missing payment link",
        },
        { status: 200 }
      );
    }

    // Razorpay statuses: created | issued | paid | cancelled | expired
    if (paymentLink.status === "paid") {
      // ✅ PAYMENT CONFIRMED
      return NextResponse.json({
        success: true,
        status: "PAID",
      });
    }
    return NextResponse.json(
      {
        success: false,
        status: "UNPAID",
        message: "Payment not completed",
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Verify payment error:", error);
    return NextResponse.json(
      {
        success: false,
        status: "ERROR",
        message:
          error?.error?.description ||
          error?.message ||
          "Verification failed",
      },
      { status: 500 }
    );
  }
}
