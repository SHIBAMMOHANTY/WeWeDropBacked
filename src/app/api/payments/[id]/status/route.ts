import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { getRazorpayXPayout } from '@/lib/razorpayx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    const paymentId = params.id;
    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'Payment or Payout ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Find transaction by ID or Razorpay Payout ID or pickupId
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(paymentId);
    let transaction = isObjectId
      ? await prisma.payoutTransaction.findUnique({ where: { id: paymentId } })
      : await prisma.payoutTransaction.findFirst({
          where: {
            OR: [
              { razorpayPayoutId: paymentId },
              { pickupId: paymentId },
              { quoteId: paymentId },
            ],
          },
          orderBy: { createdAt: 'desc' },
        });

    if (!transaction) {
      return NextResponse.json(
        { success: false, error: 'Payment transaction record not found' },
        { status: 404, headers: corsHeaders }
      );
    }

    // 2. If status is already terminal SUCCESS or REVERSED, return cached status
    if (transaction.status === 'SUCCESS' && transaction.utr) {
      return NextResponse.json(
        {
          success: true,
          status: 'SUCCESS',
          utr: transaction.utr,
          amount: transaction.amount,
          payoutId: transaction.razorpayPayoutId,
          quoteCompleted: true,
          updatedAt: transaction.updatedAt,
        },
        { headers: corsHeaders }
      );
    }

    // 3. Otherwise fetch latest status from RazorpayX API
    let livePayoutData = null;
    let newStatus = transaction.status;
    let utr = transaction.utr;
    let failureReason = transaction.failureReason;

    if (transaction.razorpayPayoutId) {
      try {
        livePayoutData = await getRazorpayXPayout(transaction.razorpayPayoutId);
        const rzpStatus = (livePayoutData.status || '').toUpperCase();

        if (['PROCESSED', 'SUCCESS'].includes(rzpStatus)) newStatus = 'SUCCESS';
        else if (['REVERSED', 'CANCELLED'].includes(rzpStatus)) newStatus = 'REVERSED';
        else if (['FAILED', 'REJECTED'].includes(rzpStatus)) newStatus = 'FAILED';
        else if (['QUEUED', 'PENDING', 'PROCESSING'].includes(rzpStatus)) newStatus = 'PROCESSING';

        if (livePayoutData.utr) utr = livePayoutData.utr;
        if (livePayoutData.status_details?.reason) failureReason = livePayoutData.status_details.reason;
      } catch (err) {
        console.warn('[RazorpayX Poll Live Status Warning]', err);
      }
    }

    // 4. Update Database if status changed
    if (newStatus !== transaction.status || utr !== transaction.utr) {
      transaction = await prisma.payoutTransaction.update({
        where: { id: transaction.id },
        data: {
          status: newStatus,
          utr: utr || undefined,
          failureReason: failureReason || undefined,
        },
      });

      // Synchronize Quote status if completed
      if (newStatus === 'SUCCESS') {
        await prisma.quote.update({
          where: { id: transaction.pickupId },
          data: {
            status: 'pickup_successful',
          },
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        status: transaction.status,
        utr: transaction.utr,
        amount: transaction.amount,
        payoutId: transaction.razorpayPayoutId,
        quoteCompleted: transaction.status === 'SUCCESS',
        failureReason: transaction.failureReason,
        updatedAt: transaction.updatedAt,
      },
      { headers: corsHeaders }
    );
  } catch (err: any) {
    console.error('Fetch Payment Status Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to fetch payment status' },
      { status: 500, headers: corsHeaders }
    );
  }
}
