import { NextRequest, NextResponse } from 'next/server';
import { QuoteService } from '@/services/mobile/quote.service';
import { ZodError } from 'zod';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("BACKEND MOBILE QUOTE REQUEST PATH: /api/mobile/quote");
    console.log("REQUEST PAYLOAD:", JSON.stringify(body, null, 2));

    const quote = await QuoteService.calculateQuote(body);
    console.log("BACKEND MOBILE QUOTE RESPONSE:", JSON.stringify(quote, null, 2));

    return NextResponse.json({ success: true, quote });
  } catch (error: any) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          error: 'Validation Error',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    console.error('Error in mobile quote API:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', message: error.message },
      { status: 500 }
    );
  }
}
