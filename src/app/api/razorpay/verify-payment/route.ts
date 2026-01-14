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
    const { paymentLinkId } = req.body;

    const paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);

    if (paymentLink.status === "paid") {
      // ✅ Payment successful
      return res.status(200).json({
        success: true,
        status: "PAID",
        paymentLink,
      });
    }

    return res.status(200).json({
      success: false,
      status: paymentLink.status,
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
}
