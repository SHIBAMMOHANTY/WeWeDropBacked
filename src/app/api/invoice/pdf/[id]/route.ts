import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateInvoicePDF } from '@/lib/invoice';

/**
 * GET /api/invoice/pdf/[id]
 * 
 * Returns the raw generated PDF file stream for a given quote ID.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const { id } = params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    let quote = null;

    if (isObjectId) {
      quote = await prisma.quote.findUnique({
        where: { id },
      });
    }

    if (!quote) {
      quote = await prisma.quote.findUnique({
        where: { quoteNumber: id },
      });
    }

    if (!quote) {
      // Fallback lookup by ID string
      quote = await prisma.quote.findFirst({
        where: {
          OR: [
            { id },
            { quoteNumber: id },
            { orderId: id }
          ]
        }
      });
    }

    if (!quote) {
      return NextResponse.json({ error: 'Quote record not found' }, { status: 404 });
    }

    const pdfBuffer = await generateInvoicePDF(quote);

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Used_Mobile_Purchase_Receipt_${quote.quoteNumber || id}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error('[API GET /api/invoice/pdf/[id]] Error:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate PDF' }, { status: 500 });
  }
}
