// TODO: implement razorpay create-order route
// src/app/api/razorpay/create-order/route.ts
import { razorpay } from "../../../../lib/razorpay";

export async function POST(req: Request) {
  const { amount } = await req.json();
  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
  });
  return new Response(JSON.stringify(order), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
