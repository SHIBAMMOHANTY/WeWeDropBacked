import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthSession, buildPagination, ApiError } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const ALLOWED_STATUSES = [
  'PENDING',
  'QUEUED',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'REVERSED',
  'CANCELLED',
] as const;

const querySchema = z.object({
  status: z
    .string()
    .transform((val) => val.toUpperCase().trim())
    .refine((val) => val === 'ALL' || ALLOWED_STATUSES.includes(val as any), {
      message: 'Invalid status filter value',
    })
    .optional(),
  search: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => val.length <= 100, {
      message: 'Search term must be 100 characters or less',
    })
    .optional(),
});

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    // 1. Authentication & Authorization Check
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Authentication required' },
        { status: 401, headers: corsHeaders }
      );
    }

    if (session.role !== 'SUPER_ADMIN') {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Super Admin access required' },
        { status: 403, headers: corsHeaders }
      );
    }

    // 2. Validate Query Parameters
    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get('status');
    const rawSearch = searchParams.get('search');

    const parseResult = querySchema.safeParse({
      status: rawStatus || undefined,
      search: rawSearch || undefined,
    });

    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid query parameters',
          details: parseResult.error.errors,
        },
        { status: 400, headers: corsHeaders }
      );
    }

    const { status: filterStatus, search } = parseResult.data;
    const { page, limit, skip } = buildPagination(req.url);

    // 3. Build Filter Condition
    const whereCondition: Record<string, any> = {};

    if (filterStatus && filterStatus !== 'ALL') {
      whereCondition.status = filterStatus;
    }

    if (search && search.length > 0) {
      // Escape special characters to prevent regex issues in text queries
      const sanitizedSearch = search.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      whereCondition.OR = [
        { pickupId: { contains: sanitizedSearch, mode: 'insensitive' } },
        { razorpayPayoutId: { contains: sanitizedSearch, mode: 'insensitive' } },
        { recipientReference: { contains: sanitizedSearch, mode: 'insensitive' } },
        { recipientName: { contains: sanitizedSearch, mode: 'insensitive' } },
        { utr: { contains: sanitizedSearch, mode: 'insensitive' } },
      ];
    }

    // 4. Fetch Payout Transactions & Total Count
    const [payouts, total] = await Promise.all([
      prisma.payoutTransaction.findMany({
        where: whereCondition,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.payoutTransaction.count({ where: whereCondition }),
    ]);

    // 5. Populate Quote details for each payout safely
    const quoteIds = Array.from(
      new Set(payouts.map((p: any) => p.pickupId).filter((id: any): id is string => Boolean(id)))
    ) as string[];

    const quotes =
      quoteIds.length > 0
        ? await prisma.quote.findMany({
            where: { id: { in: quoteIds } },
            select: {
              id: true,
              quoteNumber: true,
              brand: true,
              model: true,
              customerName: true,
              contactNumber: true,
              finalPrice: true,
              estimatedPrice: true,
            },
          })
        : [];

    const quoteMap = new Map(quotes.map((q: any) => [q.id, q]));

    const enrichedPayouts = payouts.map((p: any) => {
      const q: any = quoteMap.get(p.pickupId);
      return {
        ...p,
        quoteNumber: q?.quoteNumber || p.pickupId,
        device: q ? `${q.brand || ''} ${q.model || ''}`.trim() : 'Mobile Phone',
        customerName: p.recipientName || q?.customerName || 'Customer',
        customerPhone: q?.contactNumber || '-',
      };
    });

    return NextResponse.json(
      {
        success: true,
        payouts: enrichedPayouts,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
      { headers: corsHeaders }
    );
  } catch (err: unknown) {
    const status = err instanceof ApiError ? err.status : 500;
    const errorMessage = err instanceof Error ? err.message : 'Failed to fetch payouts';
    if (status === 500) {
      console.error('[Admin Payouts API Error]:', err);
    }
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status, headers: corsHeaders }
    );
  }
}
