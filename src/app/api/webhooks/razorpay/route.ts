import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyRazorpayXWebhookSignature } from '@/lib/razorpayx';
import { createNotification } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || req.headers.get('X-Razorpay-Signature');

    // 1. Verify Webhook Signature
    if (signature) {
      const isValid = verifyRazorpayXWebhookSignature(rawBody, signature);
      if (!isValid) {
        console.error('[RazorpayX Webhook] Signature verification failed!');
        return NextResponse.json({ success: false, error: 'Invalid webhook signature' }, { status: 400 });
      }
    } else {
      console.warn('[RazorpayX Webhook] Warning: Missing signature header.');
    }

    const payload = JSON.parse(rawBody || '{}');
    const event = payload.event;
    console.log(`[RazorpayX Webhook Event Received]: ${event}`);

    // We process payout events: payout.processed, payout.failed, payout.reversed, payout.rejected, payout.queued
    if (event && event.startsWith('payout.')) {
      const payoutEntity = payload.payload?.payout?.entity;
      if (!payoutEntity || !payoutEntity.id) {
        return NextResponse.json({ success: true, message: 'No payout entity found in webhook payload' });
      }

      const payoutId = payoutEntity.id;
      const rzpStatus = (payoutEntity.status || '').toUpperCase();
      const utr = payoutEntity.utr || null;
      const failureReason = payoutEntity.status_details?.reason || payoutEntity.failure_reason || null;
      const referenceId = payoutEntity.reference_id || payoutEntity.notes?.pickupId;

      console.log(`[RazorpayX Webhook Processing] Payout ID: ${payoutId}, Status: ${rzpStatus}, UTR: ${utr}`);

      // Map event status
      let internalStatus = 'PROCESSING';
      if (['PROCESSED', 'SUCCESS'].includes(rzpStatus) || event === 'payout.processed') {
        internalStatus = 'SUCCESS';
      } else if (['REVERSED', 'CANCELLED'].includes(rzpStatus) || event === 'payout.reversed') {
        internalStatus = 'REVERSED';
      } else if (['FAILED', 'REJECTED'].includes(rzpStatus) || event === 'payout.failed' || event === 'payout.rejected') {
        internalStatus = 'FAILED';
      }

      // 2. Find matching PayoutTransaction
      let transaction = await prisma.payoutTransaction.findFirst({
        where: {
          OR: [
            { razorpayPayoutId: payoutId },
            ...(referenceId ? [{ pickupId: referenceId }, { quoteId: referenceId }] : []),
          ],
        },
      });

      if (transaction) {
        // Update PayoutTransaction record
        transaction = await prisma.payoutTransaction.update({
          where: { id: transaction.id },
          data: {
            status: internalStatus,
            utr: utr || transaction.utr,
            failureReason: failureReason || transaction.failureReason,
            metadata: {
              ...(typeof transaction.metadata === 'object' && transaction.metadata ? transaction.metadata : {}),
              lastWebhookEvent: event,
              updatedAt: new Date().toISOString(),
            },
          },
        });

        // 3. Update Quote / Pickup Status upon success
        if (internalStatus === 'SUCCESS') {
          const quote = await prisma.quote.findUnique({
            where: { id: transaction.pickupId },
          });

          if (quote) {
            await prisma.quote.update({
              where: { id: quote.id },
              data: {
                status: 'pickup_successful',
              },
            });

            // Trigger notification
            try {
              if (quote.userId) {
                await createNotification({
                  title: 'Buyback Payment Successful',
                  message: `Your buyback payment of ₹${transaction.amount} has been processed successfully via UPI/Bank. UTR: ${utr || payoutId}`,
                  type: 'completed',
                  relatedId: quote.id,
                  userId: quote.userId,
                });
              }
            } catch (notifErr) {
              console.error('[Notification Dispatch Error]', notifErr);
            }
          }
        }
      } else {
        console.warn(`[RazorpayX Webhook] No matching transaction found for payout ${payoutId}`);
      }
    }

    return NextResponse.json({ success: true, message: 'Webhook processed successfully' });
  } catch (err: any) {
    console.error('[RazorpayX Webhook Route Error]', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Webhook processing failed' },
      { status: 500 }
    );
  }
}
