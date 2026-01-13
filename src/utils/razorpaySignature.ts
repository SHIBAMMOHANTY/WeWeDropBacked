import crypto from "crypto";

/**
 * Verifies Razorpay payment signature
 * @param orderId - The order_id from your server
 * @param paymentId - The razorpay_payment_id returned by Checkout
 * @param signature - The razorpay_signature returned by Checkout
 * @param secret - The key_secret from Razorpay dashboard
 * @returns true if signature is valid, false otherwise
 */
export function verifyRazorpaySignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(`${orderId}|${paymentId}`);
  const generatedSignature = hmac.digest("hex");
  return generatedSignature === signature;
}
