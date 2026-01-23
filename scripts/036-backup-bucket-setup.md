## Backup storage setup (Quarterly)

This project writes quarterly inventory snapshots to a **separate** Supabase Storage bucket.

### Create bucket
- **Bucket name**: `business-backups`
- **Public**: false (private)
- **Allowed MIME types**: include `application/json`

### Access
The backup job is executed server-side using the **service role** key (`createAdminClient()`), so it bypasses RLS. No public access is required.

### Run manually (local)
Call:
- `POST /api/backups/run`
- To force re-run in the same quarter: `POST /api/backups/run?force=true`

