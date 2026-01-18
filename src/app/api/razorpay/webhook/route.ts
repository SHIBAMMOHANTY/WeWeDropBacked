import crypto from "crypto";

export async function POST(req: Request) {
  const body = await req.text();
  const signature = req.headers.get("x-razorpay-signature")!;

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (expected !== signature) {
    return new Response("Invalid signature", { status: 400 });
  }

  const event = JSON.parse(body);

  if (event.event === "payment_link.paid") {
    const paymentLink = event.payload.payment_link.entity;

    // ✅ CONFIRM PAYMENT HERE
    // update DB: order.status = PAID
  }

  return new Response("OK");
}
