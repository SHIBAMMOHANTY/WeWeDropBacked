import type { NextApiRequest, NextApiResponse } from "next";
import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Allow POST only
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method Not Allowed. Use POST.",
    });
  }

  try {
    const { amount, customerName, contact, orderId } = req.body;

    console.log("CREATE LINK PAYLOAD:", req.body);

    // ✅ Validate amount
    if (!amount || isNaN(Number(amount))) {
      return res.status(400).json({
        success: false,
        message: "Invalid amount",
      });
    }

    // ✅ Normalize phone number (VERY IMPORTANT)
    const digits = String(contact).replace(/\D/g, "");
    if (digits.length < 10) {
      return res.status(400).json({
        success: false,
        message: "Invalid contact number",
      });
    }
    const fixedContact = `+91${digits.slice(-10)}`;

    // ✅ Enforce minimum ₹10
    const rupees = Math.max(Number(amount), 10);

    const paymentLink = await razorpay.paymentLink.create({
      amount: rupees * 100, // paise
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

    return res.status(200).json({
      success: true,
      short_url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error: any) {
    console.error("RAZORPAY CREATE LINK ERROR:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        error?.message ||
        "Failed to create payment link",
    });
  }
}
