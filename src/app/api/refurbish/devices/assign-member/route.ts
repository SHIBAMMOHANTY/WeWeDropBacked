export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse, NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-role, x-user-role',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// POST: Admin assigns one or multiple devices to a Refurbish Team member (technician)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      deviceIds = [],
      deviceId, // fallback single
      memberId = null,
      memberName = null,
      memberPhone = null,
      notes = '',
    } = body;

    const idsToAssign = Array.isArray(deviceIds) && deviceIds.length > 0
      ? deviceIds
      : deviceId
      ? [deviceId]
      : [];

    if (idsToAssign.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one device ID is required for assignment' },
        { status: 400, headers: corsHeaders }
      );
    }

    const assignedAt = new Date().toISOString();

    const updatedDevices = [];
    for (const id of idsToAssign) {
      const quote = await (prisma as any).quote.findUnique({
        where: { id },
      });

      if (!quote) continue;

      const existingRefurbData = (quote.refurbishData as any) || {};

      const newRefurbData = {
        ...existingRefurbData,
        assignedMemberId: memberId || null,
        assignedMemberName: memberName || (memberId ? 'Refurbish Specialist' : null),
        assignedMemberPhone: memberPhone || null,
        assignedMemberAt: memberId ? assignedAt : null,
        assignedMemberNotes: notes || existingRefurbData.assignedMemberNotes || '',
        refurbStatus: existingRefurbData.refurbStatus || 'PENDING_INSPECTION',
      };

      const updatePayload: any = {
        refurbishData: newRefurbData,
        updatedAt: new Date(),
      };

      const updated = await (prisma as any).quote.update({
        where: { id },
        data: updatePayload,
      });

      updatedDevices.push({
        id: updated.id,
        quoteNumber: updated.quoteNumber,
        model: updated.model,
        assignedMemberId: memberId || null,
        assignedMemberName: memberName || (memberId ? 'Refurbish Specialist' : null),
      });
    }

    const actionText = memberId ? `assigned to ${memberName || 'Technician'}` : 'unassigned';
    return NextResponse.json(
      {
        success: true,
        message: `Successfully ${actionText} for ${updatedDevices.length} device(s)!`,
        count: updatedDevices.length,
        devices: updatedDevices,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (error: any) {
    console.error('[POST /api/refurbish/devices/assign-member error]:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to assign device to Refurbish Team member' },
      { status: 500, headers: corsHeaders }
    );
  }
}
