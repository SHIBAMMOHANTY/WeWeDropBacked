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
  if (req.method === "GET") {
    return res.status(200).json({
      success: true,
      message:
        "GET method is allowed for testing purposes. Use POST to create a payment link.",
    });
  }

  if (req.method !== "POST") {
    return res
      .status(405)
      .json({ success: false, message: "Method not allowed" });
  }

  try {
    const { amount, customerName, contact, orderId } = req.body;

    // Ensure amount is a valid number
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing amount. Amount must be a positive number.",
      });
    }

    // Ensure contact is a valid phone number
    if (!contact || !/^\+?\d{10,15}$/.test(contact)) {
      return res.status(400).json({
        success: false,
        message: "Invalid or missing contact. Contact must be a valid phone number.",
      });
    }

    const paymentLink = await razorpay.paymentLink.create({
      amount: Math.round(Number(amount) * 100), // Convert to paise
      currency: "INR",
      description: "Order Payment",
      reference_id: orderId || Date.now().toString(),
      customer: {
        name: customerName || "Customer",
        contact: contact.startsWith("+") ? contact : contact,
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
