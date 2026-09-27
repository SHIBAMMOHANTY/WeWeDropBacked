import { jsonResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { ids } = body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return jsonResponse({ error: 'Array of order IDs is required' }, 400);
    }

    const result = await prisma.oldPhoneOrder.deleteMany({
      where: {
        OR: [
          { id: { in: ids } },
          { orderId: { in: ids } },
        ],
      },
    });

    return jsonResponse({
      success: true,
      message: `Successfully deleted ${result.count} orders`,
      count: result.count,
    });
  } catch (err: any) {
    console.error('Bulk Delete OldPhone Orders Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while bulk deleting orders' },
      500
    );
  }
}
