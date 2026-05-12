import Razorpay from "razorpay";
import { NextResponse } from "next/server";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

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
        { status: 400, headers: corsHeaders }
      );
    }

    // ✅ Normalize Indian phone number
    const digits = String(contact || "").replace(/\D/g, "");
    if (digits.length < 10) {
      return NextResponse.json(
        { success: false, message: "Invalid contact number" },
        { status: 400, headers: corsHeaders }
      );
    }
    const fixedContact = `+91${digits.slice(-10)}`;

    // ✅ Convert to paise (NO forced minimum)
    const amountInPaise = Math.round(rupees * 100);

    // ✅ Only set callback_url if a valid web URL is provided
    const paymentLinkOptions = {
      amount: amountInPaise,
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId || Date.now().toString(),
      customer: {
        name: customerName || "Customer",
        contact: fixedContact,
        email: `${digits.slice(-10)}@temp.com` // Razorpay requires email
      },
      // Conditionally add callback_url only if it's a valid web URL
      ...(callback_url && callback_url.startsWith('http') ? { 
        callback_url, 
        callback_method: "get" 
      } : {}),
      options: {
        checkout: {
          name: "WePick",
          theme: {
            hide_topbar: false
          },
        }
      },
      notes: {
        order_id: orderId,
        source: "mobile_app",
        app_scheme: "wepickwedrop" // For tracking
      }
    };

    const paymentLink = razorpay.paymentLink.create(paymentLinkOptions);

    return NextResponse.json({
      success: true,
      short_url: (await paymentLink).short_url,
      paymentLinkId: (await paymentLink).id,
      chargedAmount: rupees,
    }, { headers: corsHeaders });
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
      { status: 500, headers: corsHeaders }
    );
  }
}