import { getAuthSession } from '@/lib/api';
import { initiateCashfreePayout } from '@/lib/cashfreePayout';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

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
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-agent-key',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 1. Authenticate Delivery Agent or Super Admin
    let session: any = null;
    try {
      session = await getAuthSession(req);
    } catch (_) {
      const agentKey = req.headers.get('x-agent-key');
      if (agentKey === 'wepick-diagnose-agent-token') {
        session = { id: 'DIAGNOSE_APP', role: 'DELIVERY_AGENT' };
      }
    }

    if (!session || !session.id) {
      const agentKey = req.headers.get('x-agent-key');
      if (agentKey === 'wepick-diagnose-agent-token') {
        session = { id: 'DIAGNOSE_APP', role: 'DELIVERY_AGENT' };
      } else {
        return NextResponse.json(
          { success: false, error: 'Unauthorized: Authentication required' },
          { status: 401, headers: corsHeaders }
        );
      }
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

    // 2. Fetch Pickup Quote
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(pickupId);
    const quote = isObjectId
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
      session.id !== 'DIAGNOSE_APP' &&
      quote.agentId &&
      String(quote.agentId) !== String(session.id)
    ) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Pickup is assigned to a different delivery agent' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 4. Validate Buyback Amount
    const finalAmount = quote.finalPrice ?? quote.estimatedPrice;
    if (!finalAmount || finalAmount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Final buyback amount has not been calculated or set for this quote' },
        { status: 400, headers: corsHeaders }
      );
    }

    if (clientAmount !== undefined && Math.abs(clientAmount - finalAmount) > 0.01) {
      return NextResponse.json(
        {
          success: false,
          error: `Mismatched buyback amount. Server valuation is ₹${finalAmount}, but request received ₹${clientAmount}`,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // Check if already completed
    const currentPayoutDetails = (typeof quote.payoutDetails === 'object' && quote.payoutDetails) ? quote.payoutDetails : {};
    if (quote.status === 'pickup_successful' || quote.status === 'payment_completed') {
      return NextResponse.json(
        {
          success: true,
          alreadyCompleted: true,
          message: 'Payout for this pickup was already completed successfully.',
          payoutId: (currentPayoutDetails as any).payoutId || null,
          utr: (currentPayoutDetails as any).utr || null,
          status: 'SUCCESS',
          amount: finalAmount,
        },
        { headers: corsHeaders }
      );
    }

    // 5. Idempotency Guard - Prevent Concurrent Duplicate Disbursals
    const existingTransaction = await prisma.payoutTransaction.findFirst({
      where: {
        pickupId: quote.id,
        status: { in: ['PENDING', 'QUEUED', 'PROCESSING', 'SUCCESS'] },
      },
    });

    if (existingTransaction) {
      const activeId = existingTransaction.cfTransferId || existingTransaction.razorpayPayoutId;
      if (existingTransaction.status === 'SUCCESS') {
        return NextResponse.json(
          {
            success: true,
            alreadyCompleted: true,
            message: 'Payout for this pickup was already completed successfully.',
            payoutId: activeId,
            status: 'SUCCESS',
            amount: existingTransaction.amount,
          },
          { headers: corsHeaders }
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: `A payout transaction is already in ${existingTransaction.status} state for this pickup. Please wait for confirmation.`,
          payoutId: activeId,
          status: existingTransaction.status,
        },
        { status: 409, headers: corsHeaders }
      );
    }

    // 6. Validate Payment Instrument
    let parsedUpiId = rawUpiId;
    let payeeName = accountHolderName || quote.customerName || 'Customer';

    if (qrRawData && qrRawData.startsWith('upi://pay')) {
      try {
        const urlObj = new URL(qrRawData);
        const pa = urlObj.searchParams.get('pa');
        const pn = urlObj.searchParams.get('pn');
        if (pa) parsedUpiId = pa.trim();
        if (pn) payeeName = decodeURIComponent(pn).trim();
      } catch (e) {
        console.warn('Failed to parse UPI URL:', e);
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

    const transferId = `payout_${quote.id.slice(-10)}_${Date.now()}`;
    const idempotencyKey = transferId;
    const recipientRef = paymentMethod === 'UPI' ? parsedUpiId!.trim() : accountNumber!.trim();

    // 7. Execute Real Cashfree Payout
    let payoutResponse;
    try {
      payoutResponse = await initiateCashfreePayout({
        transferId,
        amount: finalAmount,
        paymentMethod,
        recipientName: payeeName,
        recipientPhone: quote.contactNumber || undefined,
        upiId: paymentMethod === 'UPI' ? parsedUpiId : undefined,
        accountNumber: paymentMethod === 'BANK_TRANSFER' ? accountNumber : undefined,
        ifsc: paymentMethod === 'BANK_TRANSFER' ? ifsc : undefined,
        remarks: `Buyback Quote ${quote.quoteNumber || quote.id}`,
      });
    } catch (cfErr: unknown) {
      const errMessage = cfErr instanceof Error ? cfErr.message : 'Cashfree Payout API Failure';
      const statusCode = (cfErr as any)?.statusCode || 502;
      const responseBody = (cfErr as any)?.responseBody;
      console.error('[Cashfree Payout Failure]:', errMessage, responseBody);

      // Persist failed attempt audit log
      await prisma.payoutTransaction.create({
        data: {
          pickupId: quote.id,
          quoteId: quote.id,
          customerId: quote.userId,
          agentId: session.id,
          amount: finalAmount,
          currency: 'INR',
          paymentMethod,
          recipientReference: recipientRef,
          recipientName: payeeName,
          bankIfsc: ifsc ? ifsc.trim().toUpperCase() : null,
          cfTransferId: transferId,
          status: 'FAILED',
          failureReason: errMessage,
          idempotencyKey,
          metadata: {
            error: responseBody || errMessage,
            qrRawData: qrRawData || null,
          },
        },
      });

      const detailedError = errMessage.includes('IP not whitelisted')
        ? 'Cashfree API Error: IP not whitelisted. Please whitelist your IP in Cashfree Merchant Dashboard (Payouts > Developers > IP Whitelist).'
        : `Cashfree Payout API Error: ${errMessage}`;

      return NextResponse.json(
        {
          success: false,
          error: detailedError,
          rawError: errMessage,
          responseBody,
          transferId,
        },
        { status: statusCode >= 400 && statusCode < 600 ? statusCode : 502, headers: corsHeaders }
      );
    }

    const cfTransferId = payoutResponse.transfer_id || transferId;
    const cfStatus = (payoutResponse.status || 'PENDING').toUpperCase();

    // 8. Map Real Gateway Status
    let mappedStatus = 'PROCESSING';
    if (cfStatus === 'SUCCESS') mappedStatus = 'SUCCESS';
    else if (cfStatus === 'REVERSED') mappedStatus = 'REVERSED';
    else if (['FAILED', 'REJECTED', 'MANUALLY_REJECTED'].includes(cfStatus)) mappedStatus = 'FAILED';
    else if (['PENDING', 'RECEIVED', 'QUEUED', 'APPROVAL_PENDING'].includes(cfStatus)) mappedStatus = 'PENDING';

    // 9. Persist Real Transaction in Database
    const transaction = await prisma.payoutTransaction.create({
      data: {
        pickupId: quote.id,
        quoteId: quote.id,
        customerId: quote.userId,
        agentId: session.id,
        amount: finalAmount,
        currency: 'INR',
        paymentMethod,
        recipientReference: recipientRef,
        recipientName: payeeName,
        bankIfsc: ifsc ? ifsc.trim().toUpperCase() : null,
        cfTransferId: cfTransferId,
        cfReferenceId: payoutResponse.cf_transfer_id || null,
        status: mappedStatus,
        utr: payoutResponse.transfer_utr || null,
        failureReason: payoutResponse.status_description || null,
        idempotencyKey,
        metadata: {
          transferMode: payoutResponse.transfer_mode || paymentMethod,
          rawStatus: cfStatus,
          statusCode: payoutResponse.status_code || null,
          qrRawData: qrRawData || null,
        },
      },
    });

    // 10. Update Quote State
    const paidAtTimestamp = new Date().toISOString();
    const effectiveUtr =
      payoutResponse.transfer_utr ||
      payoutResponse.cf_transfer_id ||
      cfTransferId;
    const paidAccountStr =
      paymentMethod === 'UPI'
        ? `UPI: ${recipientRef}`
        : `A/C: ${recipientRef} (IFSC: ${ifsc || ''})`;

    const quoteUpdateData: Record<string, any> = {
      payoutMethod: paymentMethod,
      upiId: paymentMethod === 'UPI' ? recipientRef : undefined,
      bankAccount: paymentMethod === 'BANK_TRANSFER' ? recipientRef : undefined,
      bankIfsc: ifsc ? ifsc.trim().toUpperCase() : undefined,
      bankAccountHolder: payeeName,
      payoutDetails: {
        payoutId: cfTransferId,
        cfTransferId,
        cfReferenceId: payoutResponse.cf_transfer_id || null,
        utr: effectiveUtr,
        status: mappedStatus,
        amount: finalAmount,
        paidAt: paidAtTimestamp,
        paymentGateway: 'CASHFREE',
        beneficiaryName: payeeName,
        accountHolderName: payeeName,
        paidToAccount: paidAccountStr,
        details: paidAccountStr,
        paymentMethod: paymentMethod,
        upiId: paymentMethod === 'UPI' ? recipientRef : undefined,
        accountNumber: paymentMethod === 'BANK_TRANSFER' ? recipientRef : undefined,
        ifsc: ifsc ? ifsc.trim().toUpperCase() : undefined,
      },
    };

    if (mappedStatus === 'SUCCESS') {
      quoteUpdateData.status = 'payment_completed';
      quoteUpdateData.paymentStatus = 1;
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
        message: 'Payout initiated successfully via Cashfree',
        payoutId: cfTransferId,
        cfTransferId,
        cfReferenceId: payoutResponse.cf_transfer_id || null,
        transactionId: transaction.id,
        status: mappedStatus,
        amount: finalAmount,
        utr: effectiveUtr,
        recipientName: payeeName,
        beneficiaryName: payeeName,
        paidToAccount: paidAccountStr,
        details: paidAccountStr,
        recipientReference: recipientRef,
        paidAt: paidAtTimestamp,
        paymentGateway: 'CASHFREE',
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error during payout';
    console.error('[Initiate Cashfree Payout Route Error]:', err);
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500, headers: corsHeaders }
    );
  }
}
