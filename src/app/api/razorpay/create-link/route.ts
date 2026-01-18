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
  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  try {
    const { amount, customerName, contact, orderId } = req.body;

    if (!amount || !contact) {
      return res.status(400).json({
        success: false,
        message: "amount and contact are required",
      });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: Number(amount) * 100, // paise
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId || Date.now().toString(),
      customer: {
        name: customerName || "Customer",
        contact: contact.startsWith("+91") ? contact : `+91${contact}`,
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
    console.error("Create link error:", error);

    return res.status(500).json({
      success: false,
      message:
        error?.error?.description ||
        error?.message ||
        "Failed to create payment link",
    });
  }
}
