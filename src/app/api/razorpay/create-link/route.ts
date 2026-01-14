import type { NextApiRequest, NextApiResponse } from "next";
import { razorpay } from "@/lib/razorpay";

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { amount, customerName, contact } = req.body;

    const paymentLink = await razorpay.paymentLink.create({
      amount: amount * 100, // ₹ → paise
      currency: "INR",
      description: "Order Payment",
      customer: {
        name: customerName || "Customer",
        contact: contact || "9999999999",
      },
      notify: {
        sms: true,
        email: false,
      },
      callback_method: "get",
      callback_url: "https://yourdomain.com/payment-success",
    });

    // 🔑 THIS URL IS WHAT EXPO GO OPENS
    return res.status(200).json({
      url: paymentLink.short_url,
      paymentLinkId: paymentLink.id,
    });
  } catch (error: any) {
    console.error("Razorpay error:", error);
    return res.status(500).json({ error: "Failed to create payment link" });
  }
}
