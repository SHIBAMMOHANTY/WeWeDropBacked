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
    const { paymentLinkId } = req.body;

    if (!paymentLinkId) {
      return res.status(400).json({
        success: false,
        status: "INVALID",
        message: "paymentLinkId is required",
      });
    }

    const paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);

    // Razorpay statuses: created | issued | paid | cancelled | expired
    if (paymentLink.status === "paid") {
      // ✅ PAYMENT CONFIRMED
      return res.status(200).json({
        success: true,
        status: "PAID",
      });
    }

    return res.status(200).json({
      success: false,
      status: paymentLink.status || "PENDING",
    });
  } catch (error: any) {
    console.error("Verify payment error:", error);

    return res.status(500).json({
      success: false,
      status: "ERROR",
      message:
        error?.error?.description ||
        error?.message ||
        "Verification failed",
    });
  }
}
