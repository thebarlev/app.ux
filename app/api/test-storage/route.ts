export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

/**
 * Debug endpoint to test Supabase Storage connectivity
 * Visit: /api/test-storage
 */
export async function GET() {
  // Never expose debug/test endpoints in production.
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
    const supabase = await createClient();

    // Test 1: List all buckets
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    // Test 2: Check if business-assets bucket exists
    const businessAssetsBucket = buckets?.find(b => b.name === "business-assets");

    // Test 3: If bucket exists, try to list files
    let filesInBucket = null;
    if (businessAssetsBucket) {
      const { data: files, error: filesError } = await supabase.storage
        .from("business-assets")
        .list("business-logos", { limit: 10 });
      
      filesInBucket = files;
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      tests: {
        buckets: {
          success: !bucketsError,
          error: bucketsError?.message,
          total: buckets?.length || 0,
          list: buckets?.map(b => ({
            name: b.name,
            public: b.public,
            created_at: b.created_at,
          })),
        },
        businessAssetsBucket: {
          exists: !!businessAssetsBucket,
          public: businessAssetsBucket?.public,
          created_at: businessAssetsBucket?.created_at,
        },
        filesInBusinessAssets: {
          count: filesInBucket?.length || 0,
          files: filesInBucket?.map(f => f.name) || [],
        },
      },
      recommendations: {
        needsAction: !businessAssetsBucket,
        steps: !businessAssetsBucket ? [
          "1. Go to Supabase Dashboard > Storage",
          "2. Click 'Create a new bucket'",
          "3. Name it 'business-assets'",
          "4. Check 'Public bucket'",
          "5. Set file size limit to 5242880 (5MB)",
          "6. Set allowed MIME types: image/png,image/jpeg,image/jpg,image/svg+xml",
          "7. Click 'Create bucket'",
          "8. Run the RLS policies from scripts/011-setup-storage-bucket.sql",
        ] : [
          "✓ Bucket exists! You're ready to upload logos.",
        ],
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: "Internal Server Error",
    }, { status: 500 });
  }
}
