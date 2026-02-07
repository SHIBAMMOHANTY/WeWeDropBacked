
import { NextRequest, NextResponse } from "next/server";
import Razorpay from "razorpay";

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
      const payload = { success: true, status: "PENDING" };
      console.log("POST /api/razorpay/verify-payment response:", payload);
      return setCorsHeaders(NextResponse.json(payload));
    }

    // 3️⃣ Fetch payments under this link
    const payments = await razorpay.payments.all({
      payment_link: paymentLinkId,
    });

    // 4️⃣ Find CAPTURED payment
    const successfulPayment = payments.items.find(
      (p: any) => p.status === "captured"
    );

    if (!successfulPayment) {
      const payload = {
        success: true,
        status: "PENDING",
        message: "Payment not captured yet",
      };
      console.log("POST /api/razorpay/verify-payment response:", payload);
      return setCorsHeaders(NextResponse.json(payload));
    }

    // ✅ FINAL SUCCESS RESPONSE
    const payload = {
      success: true,
      status: "PAID",
      paymentId: successfulPayment.id, // pay_XXXX
    };
    console.log("POST /api/razorpay/verify-payment response:", payload);
    return setCorsHeaders(NextResponse.json(payload));
  } catch (error: any) {
    console.error("Verify payment error:", error);
    const payload = {
      success: false,
      status: "ERROR",
      message:
        error?.error?.description || error?.message || "Verification failed",
    };
    console.log("POST /api/razorpay/verify-payment response:", payload);
    return setCorsHeaders(NextResponse.json(payload, { status: 500 }));
  }
}
