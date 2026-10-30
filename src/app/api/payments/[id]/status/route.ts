import { NextRequest, NextResponse } from 'next/server';
import { getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { getCashfreePayoutStatus } from '@/lib/cashfreePayout';

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

    const paymentId = params.id?.trim();
    if (!paymentId) {
      return NextResponse.json(
        { success: false, error: 'Payment or Payout ID is required' },
        { status: 400, headers: corsHeaders }
      );
    }

    // 1. Find transaction by ID, Cashfree Transfer ID, Pickup ID, or Quote ID
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(paymentId);
    let transaction = isObjectId
      ? await prisma.payoutTransaction.findUnique({ where: { id: paymentId } })
      : await prisma.payoutTransaction.findFirst({
          where: {
            OR: [
              { cfTransferId: paymentId },
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

    const activePayoutId = transaction.cfTransferId || transaction.razorpayPayoutId;

    // 2. If already terminal SUCCESS with UTR, return directly
    if (transaction.status === 'SUCCESS' && transaction.utr) {
      return NextResponse.json(
        {
          success: true,
          status: 'SUCCESS',
          utr: transaction.utr,
          amount: transaction.amount,
          payoutId: activePayoutId,
          quoteCompleted: true,
          updatedAt: transaction.updatedAt,
        },
        { headers: corsHeaders }
      );
    }

    // 3. Poll live status from Cashfree Payouts API
    let newStatus = transaction.status;
    let utr = transaction.utr;
    let failureReason = transaction.failureReason;

    if (transaction.cfTransferId) {
      try {
        const cfData = await getCashfreePayoutStatus(transaction.cfTransferId);
        const cfStatus = (cfData.status || '').toUpperCase();

        if (cfStatus === 'SUCCESS') newStatus = 'SUCCESS';
        else if (cfStatus === 'REVERSED') newStatus = 'REVERSED';
        else if (['FAILED', 'REJECTED', 'MANUALLY_REJECTED'].includes(cfStatus)) newStatus = 'FAILED';
        else if (['PENDING', 'RECEIVED', 'QUEUED', 'APPROVAL_PENDING'].includes(cfStatus)) newStatus = 'PROCESSING';

        if (cfData.transfer_utr) utr = cfData.transfer_utr;
        if (cfData.status_description) failureReason = cfData.status_description;
      } catch (err) {
        console.warn('[Cashfree Live Status Poll Warning]:', err);
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

      if (newStatus === 'SUCCESS') {
        await prisma.quote.update({
          where: { id: transaction.pickupId },
          data: {
            status: 'pickup_successful',
            paymentStatus: 1,
            payoutDetails: {
              payoutId: activePayoutId,
              utr: utr || null,
              status: 'SUCCESS',
              amount: transaction.amount,
            },
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
        payoutId: activePayoutId,
        quoteCompleted: transaction.status === 'SUCCESS',
        failureReason: transaction.failureReason,
        updatedAt: transaction.updatedAt,
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to fetch payment status';
    console.error('Fetch Payment Status Error:', err);
    return NextResponse.json(
      { success: false, error: errorMsg },
      { status: 500, headers: corsHeaders }
    );
  }
}
