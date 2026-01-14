import Razorpay from "razorpay";
import { NextResponse } from "next/server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { amount = 199, customerName, contact } = body;

    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100,
      currency: "INR",
      description: "Order Payment",
      customer: {
        name: customerName || "Customer",
        contact: contact || "9999999999",
      },
    });

    return NextResponse.json({
      url: paymentLink.short_url, // 🔑 REQUIRED
    });
  } catch (err) {
    console.error("Razorpay error:", err);
    return NextResponse.json(
      { error: "Failed to create payment link" },
      { status: 500 }
    );
  }
}
