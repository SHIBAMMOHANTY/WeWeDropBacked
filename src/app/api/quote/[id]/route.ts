import { jsonResponse, getAuthSession } from '@/lib/api';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getAuthSession(req);
    if (!session || !session.id) {
      return jsonResponse({ error: 'Unauthorized: Authentication required' }, 401);
    }

    const { id } = params;
    if (!id) {
      return jsonResponse({ error: 'Quote ID is required' }, 400);
    }

    // Attempt retrieval by MongoDB ObjectId or Unique Quote Number
    let quote = null;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);

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
      return jsonResponse({ error: 'Quote not found' }, 404);
    }

    // Role-based Access Control: User must be owner, or have SUPER_ADMIN role
    const isOwner = quote.userId === session.id;
    const isAdmin = session.role === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      return jsonResponse({ error: 'Forbidden: Access denied' }, 403);
    }

    return jsonResponse({
      success: true,
      quote,
    });
  } catch (err: any) {
    console.error('Fetch Quote Details Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error while fetching quote details' },
      500
    );
  }
}
