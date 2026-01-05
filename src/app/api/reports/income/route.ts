import { NextRequest, NextResponse } from 'next/server';
import { buildIncomeZip } from '@/lib/reports/income';

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
  try {
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
    
    // Generate ZIP with PDFs
    // TODO: Add authentication check here:
    // const session = await getServerSession();
    // if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    
    const { zipBytes, zipName } = await buildIncomeZip({
      businessId,
      dateFrom: fromDate,
      dateTo: toDate,
    });
    
    // Return ZIP file
    return new NextResponse(zipBytes, {
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
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
