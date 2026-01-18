import Razorpay from "razorpay";
import { NextResponse } from "next/server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log("CREATE LINK PAYLOAD:", body);

    const { amount, customerName, contact, orderId } = body;

    if (!amount || !contact) {
      return NextResponse.json(
        { success: false, message: "amount and contact required" },
        { status: 400 }
      );
    }

    // ✅ Normalize phone
    const digits = String(contact).replace(/\D/g, "");
    if (digits.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid contact number" },
        { status: 400 }
      );
    }

    const fixedContact = `+91${digits.slice(-10)}`;

    // ✅ Enforce minimum ₹10
    const rupees = Math.max(Number(amount), 10);

    const paymentLink = await razorpay.paymentLink.create({
      amount: rupees * 100,
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId || Date.now().toString(),
      customer: {
        name: customerName || "Customer",
        contact: fixedContact,
      },
      callback_url: "https://wepick-rho.vercel.app/payment-success",
      callback_method: "get",
    });

    return NextResponse.json({
      success: true,
      short_url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error: any) {
    console.error("RAZORPAY CREATE LINK ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error?.error?.description ||
          error?.message ||
          "Failed to create payment link",
      },
      { status: 500 }
    );
  }
}
