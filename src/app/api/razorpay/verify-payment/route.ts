import { NextApiRequest, NextApiResponse } from "next";
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
    return res.status(405).json({ message: "Method not allowed" });
  }

  try {
    const { paymentLinkId } = req.body;

    if (!paymentLinkId) {
      return res.status(400).json({ error: "paymentLinkId required" });
    }

    // 🔁 Retry mechanism (wait for Razorpay update)
    let paymentLink;
    for (let i = 0; i < 3; i++) {
      paymentLink = await razorpay.paymentLink.fetch(paymentLinkId);
      if (paymentLink.status === "paid") break;
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (paymentLink?.status === "paid") {
      return res.status(200).json({
        success: true,
        status: "PAID",
        paymentLink,
      });
    }

    return res.status(200).json({
      success: false,
      status: paymentLink?.status || "UNKNOWN",
    });
  } catch (error) {
    console.error("Verification error:", error);
    return res.status(500).json({ error: "Verification failed" });
  }
}
