import { jsonResponse, getAuthSession, buildPagination } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(req: Request) {
  try {
    // 1. Authenticate user
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    // 2. Parse query parameters for pagination
    const { page, limit, skip } = buildPagination(req.url);

    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    // 3. Return ALL quotes for this user including 'pending' drafts from
    //    POST /quote/calculate (price previews) so they appear in history.
    const query: any = {
      userId: session.id,
    };
    
    if (status) {
      query.status = status;
    }
    
    const total = await prisma.quote.count({ where: query });
    const quotes = await prisma.quote.findMany({
      where: query,
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
    });

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
    console.error('Fetch User Quote History Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote history' },
      500
    );
  }
}
