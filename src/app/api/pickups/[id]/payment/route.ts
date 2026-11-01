import { getAuthSession } from '@/lib/api';
import { initiateCashfreePayout, getCashfreePayoutStatus } from '@/lib/cashfreePayout';
import { prisma } from '@/lib/prisma';
import { sendInvoiceWhatsApp } from '@/lib/invoice';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paymentSchema = z.object({
  paymentMethod: z.enum(['UPI', 'BANK_TRANSFER', 'CASH', 'PHONE', 'QR_CODE']).default('UPI'),
  upiId: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  ifsc: z.string().trim().toUpperCase().optional(),
  accountHolderName: z.string().trim().optional(),
  customerAccepted: z.boolean().default(true),
  qrRawData: z.string().trim().optional(),
  amount: z.number().positive().optional(),
  phoneNumber: z.string().trim().optional(),
  phoneUpiHandle: z.string().trim().optional(),
});

function getCorsHeaders(req?: NextRequest): Record<string, string> {
  const origin = req?.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, x-agent-key, x-user-id, X-Requested-With',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: getCorsHeaders(req) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const corsHeaders = getCorsHeaders(req);
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
    // Allow retrying if the existing PENDING tx is stale (> 2 minutes old, no webhook received)
    // Only block on PENDING/QUEUED — FAILED/REJECTED are always retryable
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const existingTransaction = await prisma.payoutTransaction.findFirst({
      where: {
        pickupId: quote.id,
        status: { in: ['PENDING', 'QUEUED', 'SUCCESS'] },
        createdAt: { gte: twoMinutesAgo }, // Only block if tx was created within last 2 mins
      },
      orderBy: { createdAt: 'desc' },
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

      // Still genuinely PENDING within the 2-min window — return 202 so mobile treats it as PENDING, not error
      return NextResponse.json(
        {
          success: true,
          status: 'PENDING',
          message: `A payout transaction is already in ${existingTransaction.status} state for this pickup. Please wait for confirmation.`,
          payoutId: activeId,
          transferId: activeId,
        },
        { status: 202, headers: corsHeaders }
      );
    }

    // 5b. Cash Payment Mode (In-Hand Cash by Delivery Agent / Pilot)
    if (paymentMethod === 'CASH') {
      const paidTimestamp = new Date().toISOString();
      const payeeName = (
        accountHolderName ||
        quote.customerName ||
        quote.dealerName ||
        quote.ownerName ||
        ''
      ).trim();
      const recipientRef = payeeName || quote.contactNumber || quote.quoteNumber || quote.id;

      // 1. Create real database PayoutTransaction record
      const transaction = await prisma.payoutTransaction.create({
        data: {
          pickupId: quote.id,
          quoteId: quote.id,
          customerId: quote.userId,
          agentId: session.id,
          amount: finalAmount,
          currency: 'INR',
          paymentMethod: 'CASH',
          recipientReference: recipientRef,
          recipientName: payeeName || null,
          cfTransferId: null,
          cfReferenceId: null,
          status: 'SUCCESS',
          utr: null,
          idempotencyKey: `cash_${quote.id}_${Date.now()}`,
          metadata: {
            paymentMethod: 'CASH',
            confirmedByAgentId: session.id,
            paidAt: paidTimestamp,
          },
        },
      });

      // 2. Mark quote as payment_completed with real transaction reference
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'payment_completed',
          payoutMethod: 'CASH',
          paymentMethod: 'CASH',
          bankAccountHolder: payeeName || null,
          payoutDetails: {
            payoutId: transaction.id,
            transactionId: transaction.id,
            status: 'SUCCESS',
            amount: finalAmount,
            paidAt: paidTimestamp,
            paymentMethod: 'CASH',
            beneficiaryName: payeeName || null,
            accountHolderName: payeeName || null,
            confirmedByAgentId: session.id,
          },
        },
      });

      // 3. Dispatch WhatsApp Invoice asynchronously in background
      try {
        sendInvoiceWhatsApp({
          ...quote,
          finalPrice: finalAmount,
          payoutMethod: 'CASH',
          paymentMethod: 'CASH',
        }).catch((err) => console.error('[MSG91] Background invoice dispatch error (CASH):', err));
      } catch (err) {
        console.error('[MSG91] Background invoice dispatch init error (CASH):', err);
      }

      return NextResponse.json(
        {
          success: true,
          message: 'Cash payment confirmed successfully',
          payoutId: transaction.id,
          transactionId: transaction.id,
          status: 'SUCCESS',
          amount: finalAmount,
          utr: null,
          paymentMethod: 'CASH',
          beneficiaryName: payeeName || null,
          paidAt: paidTimestamp,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // 6. Validate Payment Instrument
    let parsedUpiId = rawUpiId;
    let payeeName = (
      accountHolderName ||
      quote.customerName ||
      quote.dealerName ||
      quote.ownerName ||
      ''
    ).trim();

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

    if (paymentMethod === 'PHONE' && !parsedUpiId && parseResult.data.phoneNumber) {
      const cleanPhone = parseResult.data.phoneNumber.replace(/\D/g, '').slice(-10);
      const handle = (parseResult.data.phoneUpiHandle || '@upi').trim();
      parsedUpiId = `${cleanPhone}${handle.startsWith('@') ? handle : `@${handle}`}`;
    }

    const isUpiLike = ['UPI', 'QR_CODE', 'PHONE'].includes(paymentMethod);

    if (isUpiLike) {
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
      if (!parsedUpiId || !upiRegex.test(parsedUpiId.trim())) {
        return NextResponse.json(
          {
            success: false,
            error: paymentMethod === 'PHONE'
              ? 'Invalid mobile number or UPI handle for Phone UPI'
              : paymentMethod === 'QR_CODE'
              ? 'Invalid or unscanned UPI QR code data'
              : 'Invalid or missing UPI ID (VPA) format (e.g. user@bank)',
          },
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
    const recipientRef = isUpiLike ? parsedUpiId!.trim() : accountNumber!.trim();

    // 7. Execute Real Cashfree Payout
    let payoutResponse;
    try {
      payoutResponse = await initiateCashfreePayout({
        transferId,
        amount: finalAmount,
        paymentMethod: isUpiLike ? 'UPI' : 'BANK_TRANSFER',
        recipientName: payeeName,
        recipientPhone: quote.contactNumber || undefined,
        upiId: isUpiLike ? parsedUpiId : undefined,
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
    let finalCfResponse = payoutResponse;
    let finalCfStatus = (payoutResponse.status || 'PENDING').toUpperCase();

    // 8. If initial status is PENDING/RECEIVED/PROCESSING, wait 1.8s and poll Cashfree for final terminal status
    if (['PENDING', 'RECEIVED', 'QUEUED', 'PROCESSING'].includes(finalCfStatus)) {
      try {
        await new Promise((r) => setTimeout(r, 1800));
        const statusPoll = await getCashfreePayoutStatus(cfTransferId);
        if (statusPoll && statusPoll.status) {
          finalCfResponse = statusPoll;
          finalCfStatus = statusPoll.status.toUpperCase();
          console.log('[Cashfree Polled Final Status]:', finalCfStatus, statusPoll);
        }
      } catch (pollErr) {
        console.warn('[Cashfree Status Poll Warning]:', pollErr);
      }
    }

    // 9. Map Real Gateway Status
    let mappedStatus = 'PENDING';
    if (finalCfStatus === 'SUCCESS') mappedStatus = 'SUCCESS';
    else if (finalCfStatus === 'REVERSED') mappedStatus = 'REVERSED';
    else if (['FAILED', 'REJECTED', 'MANUALLY_REJECTED'].includes(finalCfStatus)) mappedStatus = 'FAILED';
    else if (['PENDING', 'RECEIVED', 'QUEUED', 'APPROVAL_PENDING', 'PROCESSING'].includes(finalCfStatus)) mappedStatus = 'PENDING';

    const statusDesc =
      finalCfResponse.status_description ||
      finalCfResponse.message ||
      (mappedStatus === 'FAILED' ? 'Cashfree payout was rejected or failed' : 'Payout initiated');

    const paidAccountStr =
      paymentMethod === 'PHONE'
        ? `Phone UPI: ${recipientRef}`
        : paymentMethod === 'QR_CODE'
        ? `QR Code: ${recipientRef}`
        : paymentMethod === 'UPI'
        ? `UPI: ${recipientRef}`
        : `A/C: ${recipientRef} (IFSC: ${ifsc || ''})`;

    // 10. Persist Real Transaction in Database
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
        cfReferenceId: finalCfResponse.cf_transfer_id || null,
        status: mappedStatus,
        utr: finalCfResponse.transfer_utr || null,
        failureReason: mappedStatus === 'FAILED' ? statusDesc : null,
        idempotencyKey,
        metadata: {
          transferMode: finalCfResponse.transfer_mode || paymentMethod,
          rawStatus: finalCfStatus,
          statusCode: finalCfResponse.status_code || null,
          statusDescription: statusDesc,
          qrRawData: qrRawData || null,
        },
      },
    });

    // 11. If Cashfree REJECTED or FAILED: STRICTLY FAIL! Never mark payment_completed!
    if (mappedStatus === 'FAILED') {
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'payment_pending',
          payoutDetails: {
            payoutId: cfTransferId,
            cfTransferId,
            cfReferenceId: finalCfResponse.cf_transfer_id || null,
            status: 'FAILED',
            rawStatus: finalCfStatus,
            amount: finalAmount,
            failureReason: statusDesc,
            failedAt: new Date().toISOString(),
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
        },
      });

      return NextResponse.json(
        {
          success: false,
          error: `Cashfree Payout ${finalCfStatus}: ${statusDesc}`,
          status: 'FAILED',
          rawStatus: finalCfStatus,
          statusDescription: statusDesc,
          transferId: cfTransferId,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    // 12. If Still PENDING after polling: Do NOT mark payment_completed!
    if (mappedStatus !== 'SUCCESS') {
      await prisma.quote.update({
        where: { id: quote.id },
        data: {
          status: 'payment_processing',
          payoutDetails: {
            payoutId: cfTransferId,
            cfTransferId,
            cfReferenceId: finalCfResponse.cf_transfer_id || null,
            status: 'PENDING',
            rawStatus: finalCfStatus,
            amount: finalAmount,
            paymentGateway: 'CASHFREE',
            beneficiaryName: payeeName,
            accountHolderName: payeeName,
            paidToAccount: paidAccountStr,
            details: paidAccountStr,
            paymentMethod: paymentMethod,
          },
        },
      });

      // Return success:true + status:'PENDING' + HTTP 202 so the mobile app
      // knows the transfer was accepted by Cashfree and routes to the pending modal
      return NextResponse.json(
        {
          success: true,
          status: 'PENDING',
          message: 'Payout initiated successfully via Cashfree. Awaiting bank settlement confirmation.',
          transferId: cfTransferId,
          payoutId: cfTransferId,
          rawStatus: finalCfStatus,
        },
        { status: 202, headers: corsHeaders }
      );
    }

    // 13. ONLY when mappedStatus === 'SUCCESS': Update to payment_completed!
    const paidAtTimestamp = new Date().toISOString();
    const effectiveUtr =
      finalCfResponse.transfer_utr ||
      finalCfResponse.cf_transfer_id ||
      cfTransferId;

    await prisma.quote.update({
      where: { id: quote.id },
      data: {
        status: 'payment_completed',
        payoutMethod: paymentMethod,
        upiId: isUpiLike ? recipientRef : undefined,
        bankAccount: paymentMethod === 'BANK_TRANSFER' ? recipientRef : undefined,
        bankIfsc: ifsc ? ifsc.trim().toUpperCase() : undefined,
        bankAccountHolder: payeeName,
        payoutDetails: {
          payoutId: cfTransferId,
          cfTransferId,
          cfReferenceId: finalCfResponse.cf_transfer_id || null,
          utr: effectiveUtr,
          status: 'SUCCESS',
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
      },
    });

    // 14. Dispatch WhatsApp Invoice asynchronously in background
    try {
      sendInvoiceWhatsApp({
        ...quote,
        finalPrice: finalAmount,
        payoutMethod: paymentMethod,
        paymentMethod: paymentMethod,
      }).catch((err) => console.error('[MSG91] Background invoice dispatch error (Cashfree):', err));
    } catch (err) {
      console.error('[MSG91] Background invoice dispatch init error (Cashfree):', err);
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Payout settled successfully via Cashfree',
        payoutId: cfTransferId,
        cfTransferId,
        cfReferenceId: finalCfResponse.cf_transfer_id || null,
        transactionId: transaction.id,
        status: 'SUCCESS',
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
