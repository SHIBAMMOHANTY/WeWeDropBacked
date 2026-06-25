import { z } from 'zod';
import { jsonResponse } from '@/lib/api';
import { PricingService } from '@/services/pricing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const calculateSchema = z.object({
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage size is required'),
  condition: z.enum(['excellent', 'good', 'average'], {
    errorMap: () => ({ message: "Condition must be 'excellent', 'good', or 'average'" }),
  }),
  screenCracked: z.boolean().default(false),
  batteryHealth: z.number().min(0).max(100).default(100),
  cameraIssue: z.boolean().default(false),
  fingerprintIssue: z.boolean().default(false),
  faceIdIssue: z.boolean().default(false),
  bodyDamage: z.boolean().default(false),
  speakerIssue: z.boolean().default(false),
  chargingPortIssue: z.boolean().default(false),
  modelSlug: z.string().optional(),
});

export async function OPTIONS() {
  return jsonResponse(null, 204);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // Validate request parameters
    const parseResult = calculateSchema.safeParse(body);
    if (!parseResult.success) {
      return jsonResponse(
        {
          error: 'Validation failed',
          details: parseResult.error.errors.map((e) => ({
            field: e.path.join('.'),
            message: e.message,
          })),
        },
        400
      );
    }

    // Process price estimation
    const calculation = await PricingService.calculateQuote(parseResult.data);
    
    return jsonResponse(calculation);
  } catch (err: any) {
    console.error('Calculation API Error:', err);
    return jsonResponse(
      { error: err.message || 'Internal server error during price calculation' },
      err.message?.includes('Device not found') ? 404 : 500
    );
  }
}
