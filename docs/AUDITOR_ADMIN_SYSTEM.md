# VOW Auditor Admin Control Center

Full documentation for the Admin Auditor system at `/admin/auditor`.

---

## Architecture

All routes live inside `app/admin/(app)/auditor/`. The parent layout `app/admin/(app)/layout.tsx` guards every route by verifying the `system_admins` table and redirecting to `/admin/login` if unauthorized — no per-page auth guard needed.

All data-fetching pages are **Next.js Server Components** using `createServiceRoleClient()` (bypasses RLS) to read across all companies. Interactive filtering and table actions are isolated in small **Client Components**. Mutations use **Server Actions**.

```
app/admin/(app)/layout.tsx   ← Guards via system_admins table
└── /admin/auditor           ← Dashboard + KPIs
    ├── /scans               ← Scan Explorer (filterable table)
    │   └── /[scanId]        ← Tabbed Scan Inspector
    ├── /scan                ← Manual Run Scan tool
    ├── /tasks               ← Task Management
    └── /billing             ← Billing Debug
```

---

## Pages

### `/admin/auditor` — Dashboard

**File:** `app/admin/(app)/auditor/page.tsx`

Server Component. Loads KPI metrics in parallel:

| Metric | Query |
|---|---|
| Scans Today | `auditor_scans` filtered by `created_at >= today` |
| Total Scans | count of `auditor_scans` |
| Running | `auditor_scans` where `status = 'running'` |
| Failed Today | `auditor_scans` where `status = 'failed'` and today |
| Completed Today | `auditor_scans` where `status = 'done'` and today |
| Avg Score | Average `score_total` across all completed scans |

Renders `<AdminAuditorMetrics />` KPI cards + a 10-row "Recent Scans" table.

---

### `/admin/auditor/scans` — Scan Explorer

**File:** `app/admin/(app)/auditor/scans/page.tsx`

Server Component with URL search params: `?status=&kind=&cursor=`

Query:
```sql
SELECT id, hostname, status, step, score_total, created_at, scan_kind, lead_email_normalized
FROM auditor_scans
ORDER BY created_at DESC
LIMIT 50
-- Optional: WHERE status = $1, scan_kind = $2, created_at < $cursor
```

Renders `<AdminAuditorScansTable />` (Client Component) with:
- Status filter dropdown
- Kind filter dropdown
- Cursor-based "Next page" pagination
- Per-row "View", "Retry" (failed), "Cancel" (running) actions

**Server Actions:** `app/admin/(app)/auditor/scans/actions.ts`
- `retryScan(scanId)` — POSTs to `/api/admin/auditor/scan/continue`
- `cancelScan(scanId)` — Updates `status = 'failed'` via service role

---

### `/admin/auditor/scans/[scanId]` — Scan Inspector

**File:** `app/admin/(app)/auditor/scans/[scanId]/page.tsx`

Server Component. Loads all scan data in parallel via `Promise.all`:

| Tab | Table | Limit |
|---|---|---|
| Overview | `auditor_scans` (full row) | 1 |
| Pages | `auditor_scan_pages` | 100 |
| Rules | `auditor_scan_rules` | all |
| Findings | `auditor_scan_findings` | all |
| Logs | `auditor_scan_logs` | 500 |

Renders `<AdminAuditorScanViewer />` — a Client Component Tabs container that hosts:
- **Overview tab:** Scan metadata KV grid, score ring, score breakdown bars, raw JSON for `report_public` and `report_admin`
- **Pages tab:** `<AdminAuditorPagesTable />` — expandable rows with HTTP status, size, fetch time, meta
- **Rules tab:** `<AdminAuditorRulesTable />` — ordered failed → warn → pass, expandable evidence JSON
- **Findings tab:** `<AdminAuditorFindingsTable />` — severity cards with "Create Task" action
- **Logs tab:** `<AdminAuditorPipelineLogs />` — dark console with color-coded log levels

---

### `/admin/auditor/scan` — Run Scan

**File:** `app/admin/(app)/auditor/scan/page.tsx`

Client Component. Manual scan launcher (moved from original `/admin/auditor`). Calls:
- `POST /api/admin/auditor/scan/start`
- `POST /api/admin/auditor/scan/continue` (auto-poll every 2s)
- `GET /api/admin/auditor/scan/status`

---

### `/admin/auditor/tasks` — Task Management

**File:** `app/admin/(app)/auditor/tasks/page.tsx`

Server Component with `?status=open|in_progress|fixed|wont_fix` filter tabs.

Query:
```sql
SELECT t.*, s.hostname, s.normalized_host
FROM auditor_tasks t
LEFT JOIN auditor_scans s ON s.id = t.scan_id
WHERE t.status = $status
ORDER BY updated_at DESC
LIMIT 50
```

Renders `<AdminAuditorTasksTable />` (Client Component) with Server Actions:
- `resolveTask(taskId)` — `update({ status: 'fixed', resolved_at: now })`
- `closeTask(taskId)` — `update({ status: 'wont_fix', resolved_at: now })`

Also exposed: `createTaskFromFinding(findingId, scanId)` — creates a new task from a finding in the Scan Inspector.

**Actions file:** `app/admin/(app)/auditor/tasks/actions.ts`

---

### `/admin/auditor/billing` — Billing Debug

**File:** `app/admin/(app)/auditor/billing/page.tsx`

Server Component loading 3 datasets in parallel:

| Tab | Table | Columns |
|---|---|---|
| Subscriptions | `auditor_subscriptions` | company, plan, status, period, next billing, failures, cancel flag |
| Charges | `auditor_subscription_charges` | company, plan, status, amount, period, asmachta, created |
| Checkouts | `auditor_checkout_sessions` | company, plan, status, amount, link_id, low_profile_code, created |

Renders `<AdminAuditorBillingTable />` which uses shadcn `<Tabs>` for the 3 views.

---

## Components

All components live in `components/admin/auditor/`.

| Component | Type | Purpose |
|---|---|---|
| `AdminAuditorMetrics.tsx` | Server/presentational | 6 KPI metric cards |
| `AdminAuditorScansTable.tsx` | Client | Filterable, paginated scan list |
| `AdminAuditorScanViewer.tsx` | Client | Tabbed scan detail container (5 tabs) |
| `AdminAuditorPipelineLogs.tsx` | Client | Dark scrollable console log viewer |
| `AdminAuditorPagesTable.tsx` | Client | Expandable pages table with metadata |
| `AdminAuditorRulesTable.tsx` | Client | Rules table ordered by status, expandable evidence |
| `AdminAuditorFindingsTable.tsx` | Client | Findings cards with "Create Task" action |
| `AdminAuditorTasksTable.tsx` | Client | Tasks table with resolve/close Server Actions |
| `AdminAuditorBillingTable.tsx` | Client | 3-tab billing debug view |

---

## Security

Every data access uses `createServiceRoleClient()` which bypasses RLS. Access is protected by the admin layout (`app/admin/(app)/layout.tsx`) which calls `requireSystemAdmin()` — verified against the `system_admins` table in Supabase. All Server Actions also call `requireSystemAdmin()` independently.

---

## Navigation

`components/layout/AdminDashboardLayout.tsx` exposes these auditor nav items:

| Label | Path | Icon |
|---|---|---|
| Auditor Dashboard | `/admin/auditor` | BarChart3 |
| Scans | `/admin/auditor/scans` | List |
| Run Scan | `/admin/auditor/scan` | Play |
| Tasks | `/admin/auditor/tasks` | CheckSquare |
| Billing Debug | `/admin/auditor/billing` | CreditCard |

The `isActive` check uses exact-match for `/admin/auditor` to prevent it from highlighting on sub-routes.
