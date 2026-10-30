import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyCashfreePayoutWebhookSignature } from '@/lib/cashfreePayout';
import { createNotification } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-webhook-signature') || req.headers.get('X-Webhook-Signature') || '';
    const timestamp = req.headers.get('x-webhook-timestamp') || req.headers.get('X-Webhook-Timestamp') || '';

    // 1. Signature Verification
    if (signature && timestamp) {
      const isValid = verifyCashfreePayoutWebhookSignature(rawBody, signature, timestamp);
      if (!isValid) {
        console.error('[Cashfree Payout Webhook] Signature verification failed');
        return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 401 });
      }
    } else {
      console.warn('[Cashfree Payout Webhook] Missing signature headers on incoming webhook');
    }

    const payload = JSON.parse(rawBody || '{}');
    const eventType = payload.type || payload.event;
    const transferData = payload.data || payload;

    const transferId = transferData.transfer_id || transferData.transferId;
    const cfTransferId = transferData.cf_transfer_id || transferData.referenceId;
    const utr = transferData.transfer_utr || transferData.utr || null;
    const statusDesc = transferData.status_description || transferData.reason || null;
    const rawStatus = (transferData.status || '').toUpperCase();

    if (!transferId && !cfTransferId) {
      return NextResponse.json({ success: true, message: 'Non-transfer event or missing transfer identifier' });
    }

    console.log(`[Cashfree Payout Webhook] Event: ${eventType}, Transfer ID: ${transferId}, Status: ${rawStatus}, UTR: ${utr}`);

    // Map Event to internal transaction state
    let mappedStatus: 'SUCCESS' | 'FAILED' | 'REVERSED' | 'PROCESSING' = 'PROCESSING';
    if (['TRANSFER_SUCCESS', 'TRANSFER_ACKNOWLEDGED'].includes(eventType) || rawStatus === 'SUCCESS') {
      mappedStatus = 'SUCCESS';
    } else if (['TRANSFER_FAILED', 'TRANSFER_REJECTED'].includes(eventType) || ['FAILED', 'REJECTED'].includes(rawStatus)) {
      mappedStatus = 'FAILED';
    } else if (eventType === 'TRANSFER_REVERSED' || rawStatus === 'REVERSED') {
      mappedStatus = 'REVERSED';
    }

    // 2. Find Transaction
    const transaction = await prisma.payoutTransaction.findFirst({
      where: {
        OR: [
          ...(transferId ? [{ cfTransferId: transferId }] : []),
          ...(cfTransferId ? [{ cfReferenceId: String(cfTransferId) }] : []),
        ],
      },
    });

    if (!transaction) {
      console.warn(`[Cashfree Webhook] No matching transaction found for transfer_id: ${transferId}, cf_transfer_id: ${cfTransferId}`);
      return NextResponse.json({ success: true, message: 'Transaction record not found' });
    }

    // 3. Update Transaction Record
    const updatedTransaction = await prisma.payoutTransaction.update({
      where: { id: transaction.id },
      data: {
        status: mappedStatus,
        utr: utr || transaction.utr,
        failureReason: statusDesc || transaction.failureReason,
        cfReferenceId: cfTransferId ? String(cfTransferId) : transaction.cfReferenceId,
        metadata: {
          ...(typeof transaction.metadata === 'object' && transaction.metadata ? transaction.metadata : {}),
          lastWebhookEvent: eventType,
          lastWebhookReceivedAt: new Date().toISOString(),
        },
      },
    });

    // 4. Update Quote and Notify Customer on Success
    if (mappedStatus === 'SUCCESS') {
      const quote = await prisma.quote.findUnique({
        where: { id: transaction.pickupId },
      });

      if (quote) {
        await prisma.quote.update({
          where: { id: quote.id },
          data: {
            status: 'pickup_successful',
            paymentStatus: 1,
            payoutDetails: {
              payoutId: transaction.cfTransferId,
              cfReferenceId: cfTransferId ? String(cfTransferId) : transaction.cfReferenceId,
              utr: utr || transaction.utr,
              status: 'SUCCESS',
              amount: transaction.amount,
            },
          },
        });

        if (quote.userId) {
          try {
            await createNotification({
              title: 'Buyback Payment Successful',
              message: `Your buyback payment of ₹${transaction.amount} has been processed successfully. UTR: ${utr || transaction.cfTransferId}`,
              type: 'completed',
              relatedId: quote.id,
              userId: quote.userId,
            });
          } catch (notifErr) {
            console.error('[Cashfree Webhook Notification Error]:', notifErr);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      transactionId: updatedTransaction.id,
      status: mappedStatus,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Cashfree webhook processing error';
    console.error('[Cashfree Webhook Handler Error]:', err);
    return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
  }
}

