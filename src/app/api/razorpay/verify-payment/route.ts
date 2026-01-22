import { NextRequest, NextResponse } from "next/server";
// CORS middleware for Next.js API route
function setCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return response;
}

export async function OPTIONS() {
  // Handle CORS preflight
  const response = NextResponse.json({}, { status: 200 });
  return setCorsHeaders(response);
}
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: NextRequest) {
  try {
    const { paymentLinkId } = await req.json();

    if (!paymentLinkId) {
      const res = NextResponse.json(
        {
          success: false,
          status: "UNPAID",
          message: "paymentLinkId is required",
        },
        { status: 400 }
      );
      return setCorsHeaders(res);
    }

    let paymentLink;
    try {
      paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);
    } catch (error) {
      // Invalid or not found payment link
      const res = NextResponse.json(
        {
          success: false,
          status: "UNPAID",
          message: "Invalid or missing payment link",
        },
        { status: 200 }
      );
      return setCorsHeaders(res);
    }

    // Razorpay statuses: created | issued | paid | cancelled | expired
    if (paymentLink.status === "paid") {
      // ✅ PAYMENT CONFIRMED
      // Fetch payments associated with the link to get paymentId
      let paymentId = null;
      try {
        const paymentsResponse = await razorpay.payments.all();
        const payment = paymentsResponse.items.find((p: any) => p.payment_link_id === paymentLinkId);
        if (payment) {
          paymentId = payment.id;
        }
      } catch (error) {
        console.warn("Failed to fetch payment details:", error);
      }

      const res = NextResponse.json({
        success: true,
        status: "PAID",
        paymentId: paymentId, // Include paymentId here
      });
      return setCorsHeaders(res);
    }
    const res = NextResponse.json(
      {
        success: false,
        status: "UNPAID",
        message: "Payment not completed",
      },
      { status: 200 }
    );
    return setCorsHeaders(res);
  } catch (error: any) {
    console.error("Verify payment error:", error);
    const res = NextResponse.json(
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
    return setCorsHeaders(res);
  }
}