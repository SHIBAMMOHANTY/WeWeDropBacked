// TODO: implement razorpay webhook route
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

// Replace with your Razorpay webhook secret
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "your_webhook_secret";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-razorpay-signature");

    // Verify signature
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (signature !== expectedSignature) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    // Handle different event types
    if (event.event === "payment.captured") {
      // TODO: Update order/payment status in your DB
      // Example: event.payload.payment.entity contains payment details
    }

    // Respond with 200 OK
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}