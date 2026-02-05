import { NextRequest, NextResponse } from 'next/server';
import { buildIncomeZip } from '@/lib/reports/income';
import { getClientIp, rateLimit, rateLimitHeaders } from '@/lib/security/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/reports/income
 * 
 * Request body:
 * {
 *   businessId: string;
 *   dateFrom: string; // ISO date or YYYY-MM-DD
 *   dateTo: string;   // ISO date or YYYY-MM-DD
 * }
 * 
 * Returns: ZIP file with PDFs
 */
export async function POST(request: NextRequest) {
  // Never expose this legacy report endpoint in production.
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  // Non-prod: system-admin only.
  const { requireSystemAdmin } = await import("@/lib/security/system-admin");
  try {
    await requireSystemAdmin();
  } catch {
    return new NextResponse("Not Found", { status: 404 });
  }

  try {
    const ip = getClientIp(request);
    const rl = rateLimit({ key: `income-report:${ip}`, limit: 10, windowMs: 60_000 });
    if (!rl.allowed) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429, headers: rateLimitHeaders(rl) });
    }

    const body = await request.json();
    
    const { businessId, dateFrom, dateTo } = body;
    
    // Validate inputs
    if (!businessId || !dateFrom || !dateTo) {
      return NextResponse.json(
        { error: 'Missing required fields: businessId, dateFrom, dateTo' },
        { status: 400 }
      );
    }
    
    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format' },
        { status: 400 }
      );
    }
    
    if (fromDate > toDate) {
      return NextResponse.json(
        { error: 'dateFrom must be before dateTo' },
        { status: 400 }
      );
    }
    
    // Generate ZIP with PDFs (non-prod system-admin only)
    const { zipBytes, zipName } = await buildIncomeZip({
      businessId,
      dateFrom: fromDate,
      dateTo: toDate,
    });
    const zipBody = Uint8Array.from(zipBytes).buffer;
    
    // Return ZIP file
    return new NextResponse(zipBody, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}"`,
        'Content-Length': String(zipBytes.length),
      },
    });
    
  } catch (error) {
    console.error('Income report generation error:', error);
    
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    );
  }
}
