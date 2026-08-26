import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: Request) {
  try {
    // 1. Authenticate user and verify role is SUPER_ADMIN
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }
    
    if (session.role !== 'SUPER_ADMIN') {
      return jsonResponse({ error: 'Forbidden: Admin role required' }, 403);
    }

    // 2. Parse query parameters (pagination + status filter)
    const { page, limit, skip } = buildPagination(req.url);
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    const query: any = {};
    if (status) {
      const validStatuses = [
        'pending',
        'requested',
        'accepted',
        'pickup_scheduled',
        'pickup_successful',
        'payment_processing',
        'payment_completed',
        'cancelled',
        'rejected',
        'ordered',
        'submitted'
      ];
      const normalizedStatus = status.toLowerCase().trim();
      if (validStatuses.includes(normalizedStatus)) {
        query.status = normalizedStatus;
      } else {
        return jsonResponse(
          { error: `Invalid status filter. Must be one of: ${validStatuses.join(', ')}` },
          400
        );
      }
    }

    // 3. Query documents using Prisma client
    const total = await prisma.quote.count({ where: query });
    const quotes = await prisma.quote.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

    // 4. Return paginated quotes
    return jsonResponse({
      success: true,
      quotes,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('Fetch Admin Quotes Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quotes list' },
      500
    );
  }
}
