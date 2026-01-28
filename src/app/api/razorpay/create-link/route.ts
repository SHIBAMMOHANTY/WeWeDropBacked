
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

    const { amount, customerName, contact, orderId, callback_url } = body;

    // ✅ Validate amount (allow ₹1)
    const rupees = Number(amount);
    if (isNaN(rupees) || rupees <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid amount" },
        { status: 400 }
      );
    }

    // ✅ Normalize Indian phone number
    const digits = String(contact || "").replace(/\D/g, "");
    if (digits.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid contact number" },
        { status: 400 }
      );
    }
    const fixedContact = `+91${digits.slice(-10)}`;

    // ✅ Convert to paise (NO forced minimum)
    const amountInPaise = Math.round(rupees * 100);

    // ✅ Use provided callback_url or default to deep link
    const redirectUrl = callback_url || "wepick://payment-result"; // Your app's deep link
    console.log("Using callback URL:", redirectUrl);

    const paymentLink = razorpay.paymentLink.create({
      amount: amountInPaise,
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId || Date.now().toString(),
      customer: {
        name: customerName || "Customer",
        contact: fixedContact,
        email: `${digits.slice(-10)}@temp.com` // Razorpay requires email
      },
      // 🔥 CRITICAL CHANGE: Use deep link instead of web URL
      callback_url: redirectUrl,
      callback_method: "get",

      // ✅ Optional: Add web fallback for testing
      options: {
        checkout: {
          name: "WePick",
          // prefill removed due to type incompatibility
          theme: {
            hide_topbar: false
          },
          // Note: 'redirect' property removed due to type incompatibility
        }
      },
      notes: {
        order_id: orderId,
        source: "mobile_app",
        app_scheme: "wepick" // For tracking
      }
    });

    return NextResponse.json({
      success: true,
      short_url: (await paymentLink).short_url,
      paymentLinkId: (await paymentLink).id,
      chargedAmount: rupees,
      callback_url: redirectUrl, // Send back for debugging
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