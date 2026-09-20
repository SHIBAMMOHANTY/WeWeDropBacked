import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import {
  createRazorpayXContact,
  createRazorpayXFundAccount,
  initiateRazorpayXPayout,
} from '@/lib/razorpayx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paymentSchema = z.object({
  paymentMethod: z.enum(['UPI', 'BANK_TRANSFER']).default('UPI'),
  upiId: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().toUpperCase().optional(),
  accountHolderName: z.string().trim().optional(),
  customerAccepted: z.boolean().default(true),
  qrRawData: z.string().trim().optional(),
  amount: z.number().positive().optional(),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate Delivery Agent / Admin
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (session.role !== 'DELIVERY_AGENT' && session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Delivery Agent or Admin role required' },
        { status: 403, headers: corsHeaders }
      );
    }

    const pickupId = params.id?.trim();
    if (!pickupId) {
      return NextResponse.json(
        { success: false, error: 'Pickup / Quote ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    const body = await req.json().catch(() => ({}));
    const parseResult = paymentSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Validation failed',
          details: parseResult.error.errors,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const {
      paymentMethod,
      upiId: rawUpiId,
      accountNumber,
      ifsc,
      accountHolderName,
      customerAccepted,
      qrRawData,
      amount: clientAmount,
    } = parseResult.data;

    if (!customerAccepted) {
      return NextResponse.json(
        { success: false, error: 'Customer has not accepted the final buyback valuation' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 2. Fetch Pickup / Quote from Database
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(pickupId);
    let quote = isObjectId
      ? await prisma.quote.findUnique({ where: { id: pickupId } })
      : await prisma.quote.findUnique({ where: { quoteNumber: pickupId } });

    if (!quote) {
      return NextResponse.json(
        { success: false, error: 'Pickup / Quote not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 3. Verify Agent Assignment
    if (
      session.role === 'DELIVERY_AGENT' &&
      quote.agentId &&
      String(quote.agentId) !== String(session.id)
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Pickup is assigned to a different delivery agent' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 4. Validate Server Buyback Valuation Amount
    const finalAmount = quote.finalPrice ?? quote.estimatedPrice;
    if (!finalAmount || finalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Final buyback amount has not been calculated or set for this quote' },
        { status: 400, headers: corsHeaders }
      );
    }

    // Server-side check: if client sent an amount, ensure no tampering
    if (clientAmount !== undefined && Math.abs(clientAmount - finalAmount) > 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Mismatched buyback amount. Server valuation is ₹${finalAmount}, but request received ₹${clientAmount}`,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 5. Check for Duplicate / Pending Payouts (Idempotency Protection)
    const existingTransaction = await prisma.payoutTransaction.findFirst({
      where: {
        pickupId: quote.id,
        status: { in: ['PENDING', 'QUEUED', 'PROCESSING', 'SUCCESS'] },
      },
    });

    if (existingTransaction) {
      if (existingTransaction.status === 'SUCCESS') {
        return NextResponse.json(
          {
            success: true,
            alreadyCompleted: true,
            message: 'Payout for this pickup was already completed successfully.',
            payoutId: existingTransaction.razorpayPayoutId,
            status: 'SUCCESS',
            amount: existingTransaction.amount,
          },
          { headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `A payout transaction is already in ${existingTransaction.status} state for this pickup. Please wait for status confirmation.`,
          payoutId: existingTransaction.razorpayPayoutId,
          status: existingTransaction.status,
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // 6. Parse and Validate Recipient Payment Information
    let parsedUpiId = rawUpiId;
    let payeeName = accountHolderName || quote.customerName || 'Customer';

    // Parse UPI QR Code if provided
    if (qrRawData && qrRawData.startsWith('upi://pay')) {
      try {
        const urlObj = new URL(qrRawData);
        const pa = urlObj.searchParams.get('pa');
        const pn = urlObj.searchParams.get('pn');
        if (pa) parsedUpiId = pa.trim();
        if (pn) payeeName = decodeURIComponent(pn).trim();
      } catch (e) {
        console.warn('Failed to parse UPI URL query parameters:', e);
      }
    }

    if (paymentMethod === 'UPI') {
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!parsedUpiId || !upiRegex.test(parsedUpiId.trim())) {
        return NextResponse.json(
          { success: false, error: 'Invalid or missing UPI ID (VPA) format (e.g. user@bank)' },
          { status: 400, headers: corsHeaders }
        );
      }
    } else {
      if (!accountNumber || !ifsc) {
        return NextResponse.json(
          { success: false, error: 'Bank account number and IFSC code are required for bank transfer' },
          { status: 400, headers: corsHeaders }
        );
      }
      const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
      if (!ifscRegex.test(ifsc.trim().toUpperCase())) {
        return NextResponse.json(
          { success: false, error: 'Invalid IFSC code format (e.g. SBIN0001234)' },
          { status: 400, headers: corsHeaders }
        );
      }
      const bankAccRegex = /^[0-9]{9,18}$/;
      if (!bankAccRegex.test(accountNumber.trim())) {
        return NextResponse.json(
          { success: false, error: 'Invalid bank account number format (must be 9-18 digits)' },
          { status: 400, headers: corsHeaders }
        );
      }
    }

    const amountInPaise = Math.round(finalAmount * 100);
    const idempotencyKey = `payout_${quote.id}_${Date.now()}`;
    const recipientRef = paymentMethod === 'UPI' ? parsedUpiId!.trim() : accountNumber!.trim();

    // 7. Step A: Create RazorpayX Contact
    const contactResponse = await createRazorpayXContact({
      name: payeeName,
      contact: quote.contactNumber || '9999999999',
      referenceId: quote.id,
      notes: { pickupId: quote.id, quoteNumber: quote.quoteNumber || '' },
    });
    const contactId = contactResponse.id;

    // 8. Step B: Create Fund Account
    let fundAccountResponse;
    if (paymentMethod === 'UPI') {
      fundAccountResponse = await createRazorpayXFundAccount({
        contactId,
        accountType: 'vpa',
        vpaAddress: parsedUpiId!.trim(),
      });
    } else {
      fundAccountResponse = await createRazorpayXFundAccount({
        contactId,
        accountType: 'bank_account',
        name: payeeName,
        ifsc: ifsc!.trim().toUpperCase(),
        accountNumber: accountNumber!.trim(),
      });
    }
    const fundAccountId = fundAccountResponse.id;

    // 9. Step C: Initiate RazorpayX Payout
    let payoutResponse;
    try {
      payoutResponse = await initiateRazorpayXPayout({
        fundAccountId,
        amountInPaise,
        currency: 'INR',
        mode: paymentMethod === 'UPI' ? 'UPI' : 'IMPS',
        purpose: 'payout',
        referenceId: quote.quoteNumber || quote.id,
        narration: 'Mobile Buyback Payout',
        idempotencyKey,
        notes: {
          pickupId: quote.id,
          agentId: session.id,
          customerName: quote.customerName || '',
        },
      });
    } catch (rzpErr: unknown) {
      const errMessage = rzpErr instanceof Error ? rzpErr.message : 'RazorpayX Payout API Failure';
      console.error('[RazorpayX Payout Creation Error]', rzpErr);

      // Record Failed Transaction Audit Log
      await prisma.payoutTransaction.create({
        data: {
          pickupId: quote.id,
          quoteId: quote.id,
          customerId: quote.userId,
          agentId: session.id,
          amount: finalAmount,
          amountInPaise,
          currency: 'INR',
          paymentMethod,
          recipientReference: recipientRef,
          recipientName: payeeName,
          bankIfsc: ifsc ? ifsc.trim().toUpperCase() : null,
          contactId,
          fundAccountId,
          status: 'FAILED',
          failureReason: errMessage,
          idempotencyKey,
          metadata: { qrRawData: qrRawData || null },
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: errMessage,
        },
        { status: 502, headers: corsHeaders }
      );
    }

    const rzpPayoutId = payoutResponse.id;
    const rzpStatus = (payoutResponse.status || 'PENDING').toUpperCase();

    // Map RazorpayX status to internal status
    let mappedStatus = 'PROCESSING';
    if (['PROCESSED', 'SUCCESS'].includes(rzpStatus)) mappedStatus = 'SUCCESS';
    if (['REVERSED', 'CANCELLED'].includes(rzpStatus)) mappedStatus = 'REVERSED';
    if (['FAILED', 'REJECTED'].includes(rzpStatus)) mappedStatus = 'FAILED';
    if (['QUEUED', 'PENDING'].includes(rzpStatus)) mappedStatus = 'PENDING';

    // 10. Save Payout Transaction in DB
    const transaction = await prisma.payoutTransaction.create({
      data: {
        pickupId: quote.id,
        quoteId: quote.id,
        customerId: quote.userId,
        agentId: session.id,
        amount: finalAmount,
        amountInPaise,
        currency: 'INR',
        paymentMethod,
        recipientReference: recipientRef,
        recipientName: payeeName,
        bankIfsc: ifsc ? ifsc.trim().toUpperCase() : null,
        contactId,
        fundAccountId,
        razorpayPayoutId: rzpPayoutId,
        status: mappedStatus,
        utr: payoutResponse.utr || null,
        failureReason: payoutResponse.status_details?.reason || null,
        idempotencyKey,
        metadata: {
          mode: payoutResponse.mode,
          rawStatus: rzpStatus,
          qrRawData: qrRawData || null,
        },
      },
    });

    // 11. Update Quote Record
    const quoteUpdateData: Record<string, any> = {
      payoutMethod: paymentMethod,
      upiId: paymentMethod === 'UPI' ? recipientRef : undefined,
      bankAccount: paymentMethod === 'BANK_TRANSFER' ? recipientRef : undefined,
      bankIfsc: ifsc ? ifsc.trim().toUpperCase() : undefined,
      bankAccountHolder: payeeName,
    };

    if (mappedStatus === 'SUCCESS') {
      quoteUpdateData.status = 'pickup_successful';
      quoteUpdateData.paymentStatus = 1; // VERIFIED/PAID
    } else if (mappedStatus === 'PROCESSING' || mappedStatus === 'PENDING') {
      quoteUpdateData.status = 'payment_processing';
    }

    await prisma.quote.update({
      where: { id: quote.id },
      data: quoteUpdateData,
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Payout initiated successfully',
        payoutId: rzpPayoutId,
        transactionId: transaction.id,
        status: mappedStatus,
        amount: finalAmount,
        utr: payoutResponse.utr || null,
        recipientName: payeeName,
        recipientReference: recipientRef,
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error during payout';
    console.error('[Initiate Payout Route Error]:', err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}
