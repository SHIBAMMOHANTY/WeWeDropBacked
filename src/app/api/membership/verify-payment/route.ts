

import { NextResponse } from 'next/server';
import { verifyRazorpaySignature } from '../../../../utils/razorpaySignature';

// Example: handle POST request for membership verify-payment
export async function POST(request: Request) {
	const body = await request.json();
	const { order_id, razorpay_payment_id, razorpay_signature } = body;
	// You should get your Razorpay secret from env or config
	const secret = process.env.RAZORPAY_SECRET;
	if (!order_id || !razorpay_payment_id || !razorpay_signature || !secret) {
		return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
	}

	const isValid = verifyRazorpaySignature(order_id, razorpay_payment_id, razorpay_signature, secret);
	if (isValid) {
		// Payment is authentic, proceed with your logic (e.g., update DB, grant membership)
		return NextResponse.json({ success: true, message: 'Payment verified successfully' });
	} else {
		return NextResponse.json({ success: false, message: 'Invalid payment signature' }, { status: 400 });
	}
}
