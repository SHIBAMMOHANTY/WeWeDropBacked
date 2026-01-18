import Razorpay from "razorpay";
import { NextResponse } from "next/server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount = 199, customerName, contact, orderId } = body;

    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100,
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId, // IMPORTANT
      customer: {
        name: customerName || "Customer",
        contact: "+91" + contact,
      },
      callback_url: "https://yourdomain.com/payment-success",
      callback_method: "get",
    });

    return NextResponse.json({
      short_url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (err: any) {
    console.error("Razorpay error:", err);
    return NextResponse.json(
      { error: err?.error?.description || err.message },
      { status: 500 }
    );
  }
}
