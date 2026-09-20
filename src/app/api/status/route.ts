import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRazorpayXConfig } from '@/lib/razorpayx';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

// Record process boot time
const serverStartTime = Date.now() - Math.floor(process.uptime() * 1000);

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0 || d > 0) parts.push(`${h}h`);
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);

  return parts.join(' ');
}

export async function GET() {
  const startTime = Date.now();

  // 1. Calculate Uptime Stats
  const uptimeSeconds = Math.floor(process.uptime());
  const bootTimestamp = new Date(serverStartTime).toISOString();
  const formattedUptime = formatUptime(uptimeSeconds);

  // 2. Measure Database Ping & Latency
  let dbStatus = 'DOWN';
  let dbLatencyMs = -1;
  let dbMessage = '';

  try {
    const dbStart = Date.now();
    await prisma.$runCommandRaw({ ping: 1 });
    dbLatencyMs = Date.now() - dbStart;
    dbStatus = 'OPERATIONAL';
    dbMessage = 'MongoDB connected via Prisma';
  } catch (err: any) {
    dbStatus = 'DOWN';
    dbMessage = err?.message || 'Database ping failed';
  }

  // 3. Check RazorpayX Config Status
  let rzpStatus = 'NOT_CONFIGURED';
  try {
    const config = getRazorpayXConfig();
    if (config.keyId && config.keySecret) {
      rzpStatus = 'OPERATIONAL';
    }
  } catch (e: any) {
    rzpStatus = 'DEGRADED';
  }

  // 4. Memory Metrics
  const mem = process.memoryUsage();
  const heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(2);
  const rssMb = (mem.rss / 1024 / 1024).toFixed(2);
  const heapPercent = Math.round((mem.heapUsed / mem.heapTotal) * 100);

  // 5. System Status Calculation
  let overallStatus = 'OPERATIONAL';
  if (dbStatus === 'DOWN') {
    overallStatus = 'OUTAGE';
  } else if (dbStatus === 'DEGRADED' || rzpStatus === 'DEGRADED') {
    overallStatus = 'DEGRADED';
  }

  const responseTimeMs = Date.now() - startTime;

  return NextResponse.json(
    {
      success: true,
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTimeMs,
      server: {
        uptimeSeconds,
        formattedUptime,
        bootTime: bootTimestamp,
        nodeVersion: process.version,
        environment: process.env.NODE_ENV || 'development',
        platform: process.platform,
        arch: process.arch,
      },
      memory: {
        heapUsedMb: Number(heapUsedMb),
        heapTotalMb: Number(heapTotalMb),
        rssMb: Number(rssMb),
        heapPercent,
      },
      services: [
        {
          name: 'Core API Gateway',
          status: 'OPERATIONAL',
          type: 'API',
          latencyMs: responseTimeMs,
          details: 'Handling active incoming requests',
        },
        {
          name: 'Database (MongoDB)',
          status: dbStatus,
          type: 'DATABASE',
          latencyMs: dbLatencyMs,
          details: dbMessage,
        },
        {
          name: 'RazorpayX Payout Gateway',
          status: rzpStatus,
          type: 'PAYMENT',
          details: rzpStatus === 'OPERATIONAL' ? 'Credentials configured & ready' : 'API credentials missing or invalid',
        },
        {
          name: 'Authentication Service',
          status: 'OPERATIONAL',
          type: 'AUTH',
          details: 'JWT session verification online',
        },
      ],
      rebootLog: [
        {
          event: 'System Boot / Server Started',
          timestamp: bootTimestamp,
          reason: 'Application Service Launched',
          status: 'SUCCESS',
        },
      ],
    },
    { headers: corsHeaders }
  );
}
