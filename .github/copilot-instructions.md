# Copilot Instructions

## Architecture

**Multi-tenant accounting SaaS** with system admin and business owner portals. Built with Next.js 16 (App Router), Supabase (PostgreSQL + Auth), and shadcn/ui.

### Key Entities
- **System Admins** (`/admin/*`): System-level oversight, manage all companies via `system_admins` table
- **Business Owners** (`/dashboard/*`): Tenant-isolated access to documents, receipts via `company_members` + RLS
- **Companies**: Primary tenant boundary. All business data scoped via `company_id` foreign keys

### Data Flow
1. **Tenant Isolation**: RLS enforced via `user_company_ids()` function ([scripts/006-tenant-isolation-and-audit.sql](scripts/006-tenant-isolation-and-audit.sql#L204))
2. **Document Immutability**: Finalized documents cannot be edited ([scripts/006-tenant-isolation-and-audit.sql](scripts/006-tenant-isolation-and-audit.sql#L270))
3. **Sequence Locking**: Document numbers assigned atomically via `generate_document_number()` ([scripts/006-tenant-isolation-and-audit.sql](scripts/006-tenant-isolation-and-audit.sql#L223))

## Critical Patterns

### Server/Client Separation
- **Server Components**: Default. Data fetching in page.tsx using `createClient()` from [lib/supabase/server.ts](lib/supabase/server.ts)
- **Client Components**: Explicit `"use client"` for interactivity (forms, modals, state management)
- **Server Actions**: All mutations via `"use server"` functions (e.g., [app/dashboard/documents/receipt/actions.ts](app/dashboard/documents/receipt/actions.ts))

### Authentication & Authorization
```typescript
// Server component auth pattern (see app/admin/page.tsx)
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect("/admin/login")

// Verify admin role
const { data: adminData } = await supabase
  .from("system_admins")
  .select("id")
  .eq("auth_user_id", user.id)
  .single()
```

### Multi-tenancy Access
```typescript
// Get user's company via company_members or companies.auth_user_id
// Fallback pattern in app/dashboard/documents/receipt/actions.ts:
const m1 = await supabase.from("company_memberships").select("company_id").eq("user_id", userId).maybeSingle()
if (m1.data?.company_id) return m1.data.company_id
// Fallback to companies.owner_id...
```

### UI Components
- **shadcn/ui**: All components in [components/ui/](components/ui/) using Radix primitives + CVA variants
- **RTL Support**: Hebrew (`dir="rtl"`) in [app/layout.tsx](app/layout.tsx#L39). Forms/labels assume Hebrew text
- **Neumorphic Design**: Custom components in [components/registration/](components/registration/) for registration flow

## Development Workflow

### Commands
```bash
pnpm dev          # Next.js dev server (localhost:3000)
pnpm build        # Production build (TypeScript errors ignored per next.config.mjs)
pnpm lint         # ESLint check
```

### Database Setup
Execute scripts in order ([scripts/](scripts/)):
1. `001-create-tables.sql` → Core schema
2. `002-enable-rls.sql` → Admin-only policies
3. `006-tenant-isolation-and-audit.sql` → Multi-tenant tables + `user_company_ids()` helper
4. `007-tenant-rls-policies.sql` → Tenant-scoped RLS policies

### Middleware
[lib/supabase/proxy.ts](lib/supabase/proxy.ts) handles session refresh + admin route protection. Imported by [proxy.ts](proxy.ts).

## Project Conventions

### Path Aliases
`@/*` → Root ([tsconfig.json](tsconfig.json#L28)). Import as `@/lib/utils`, `@/components/ui/button`

### Styling
- Tailwind v4 ([postcss.config.mjs](postcss.config.mjs)) with CSS variables ([app/globals.css](app/globals.css))
- Utility-first classes. Use `cn()` from [lib/utils.ts](lib/utils.ts) for conditional classes

### State Management
- **Server State**: React Server Components (async page.tsx)
- **Client State**: React Context ([components/registration/registration-context.tsx](components/registration/registration-context.tsx)) for multi-step forms
- **No global store**: Avoid Redux/Zustand unless explicitly required

### Document Workflows
- **Draft → Final**: Documents start as drafts. Number assigned only when finalized via `generate_document_number()`
- **Starting Number Modal**: [components/documents/StartingNumberModal.tsx](components/documents/StartingNumberModal.tsx) locks sequences
- **Immutability**: Finalized documents trigger audit logs ([scripts/006-tenant-isolation-and-audit.sql](scripts/006-tenant-isolation-and-audit.sql#L373))

## Integration Points

- **Supabase**: Auth + Postgres. Never use service role in client code
- **Vercel Analytics**: Configured via `@vercel/analytics` ([package.json](package.json#L42))
- **Next Themes**: Dark mode support ([components/theme-provider.tsx](components/theme-provider.tsx))

## Sequence Locking & Document Numbering

### Why Sequence Locking Exists
Documents start as **drafts** without assigned numbers. Numbers are only assigned when a document is **finalized** to prevent gaps in the sequence (e.g., deleted drafts creating missing invoice numbers for tax compliance).

### How to Use
1. **Draft Creation**: Create document with `document_status: 'draft'` and `document_number: null`
2. **Finalization**: Call `generate_document_number(company_id, document_type)` to atomically:
   - Lock the sequence (if first finalization)
   - Increment counter
   - Assign formatted number (e.g., `000042`)
3. **Immutability**: Once finalized, documents cannot be edited (enforced by trigger)

### Common Mistakes
- ❌ Assigning numbers to drafts
- ❌ Manually incrementing `current_number` (use `generate_document_number()`)
- ❌ Attempting to edit finalized documents (status: `final`)
- ❌ Forgetting to lock sequences before production use ([StartingNumberModal.tsx](components/documents/StartingNumberModal.tsx))

## Code Examples

### Creating a Multi-Tenant Server Action
```typescript
"use server"
import { createClient } from "@/lib/supabase/server"

// Helper: Get company ID for current user
async function getMyCompanyIdOrThrow() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error("not_authenticated")

  // Try company_members first (multi-tenant membership)
  const m1 = await supabase
    .from("company_members")
    .select("company_id")
    .eq("user_id", user.id)
    .maybeSingle()
  if (m1.data?.company_id) return m1.data.company_id

  // Fallback: Direct ownership via companies.auth_user_id
  const m2 = await supabase
    .from("companies")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (m2.data?.id) return m2.data.id

  throw new Error("company_not_found")
}

// Example action: Create customer
export async function createCustomerAction(name: string, email: string) {
  const supabase = await createClient()
  const companyId = await getMyCompanyIdOrThrow()

  const { data, error } = await supabase
    .from("customers")
    .insert({ company_id: companyId, name, email })
    .select("id")
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, customerId: data.id }
}
```

### Adding RLS Policy for Company-Owned Table
```sql
-- Example: products table owned by companies
alter table public.products enable row level security;

-- SELECT: Users can view products from their companies
drop policy if exists products_select on public.products;
create policy products_select on public.products
  for select
  using (company_id in (select public.user_company_ids()));

-- INSERT: Users can create products for their companies
drop policy if exists products_insert on public.products;
create policy products_insert on public.products
  for insert
  with check (company_id in (select public.user_company_ids()));

-- UPDATE: Only non-archived products can be edited
drop policy if exists products_update on public.products;
create policy products_update on public.products
  for update
  using (
    company_id in (select public.user_company_ids())
    and status != 'archived'
  );

-- DELETE: Only draft products can be deleted
drop policy if exists products_delete on public.products;
create policy products_delete on public.products
  for delete
  using (
    company_id in (select public.user_company_ids())
    and status = 'draft'
  );
```

### Adding New Document Type (Draft → Final Pattern)
```typescript
// 1. Update document_type enum in scripts/006-tenant-isolation-and-audit.sql
// Add 'invoice' to document_sequences.document_type check constraint

// 2. Server action for draft invoice
"use server"
import { createClient } from "@/lib/supabase/server"

export async function saveInvoiceDraftAction(payload: InvoicePayload) {
  const supabase = await createClient()
  const companyId = await getMyCompanyIdOrThrow()

  const { data, error } = await supabase
    .from("documents")
    .insert({
      company_id: companyId,
      document_type: "invoice",
      document_status: "draft", // No number yet
      document_number: null,
      customer_name: payload.customerName,
      subtotal: payload.subtotal,
      total_amount: payload.total,
      currency: payload.currency,
    })
    .select("id")
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, draftId: data.id }
}

// 3. Server action to finalize invoice
export async function finalizeInvoiceAction(draftId: string) {
  const supabase = await createClient()
  const companyId = await getMyCompanyIdOrThrow()

  // Atomically assign number and finalize
  const { data: docNumber } = await supabase.rpc("generate_document_number", {
    p_company_id: companyId,
    p_document_type: "invoice"
  })

  const { data, error } = await supabase
    .from("documents")
    .update({
      document_number: docNumber,
      document_status: "final",
      finalized_at: new Date().toISOString(),
    })
    .eq("id", draftId)
    .eq("company_id", companyId) // Verify ownership
    .eq("document_status", "draft") // Only drafts can be finalized
    .select("id, document_number")
    .single()

  if (error) return { ok: false, message: error.message }
  return { ok: true, invoiceNumber: data.document_number }
}
```

## Common Pitfalls

1. **Don't bypass RLS**: Always use authenticated Supabase client. Test policies with non-admin users
2. **Server Actions must be top-level**: No nested "use server" in client components
3. **Hebrew text**: Ensure RTL layout when adding forms/tables
4. **TypeScript errors ignored in build**: Fix type errors despite `ignoreBuildErrors: true`

## Known Issues & TODOs

1. ~~**Table Name Inconsistency**: Code references `company_memberships` but schema defines `company_members`.~~ **FIXED** - Updated all references to use `company_members` via unified `getCompanyIdForUser()` helper in [lib/document-helpers.ts](lib/document-helpers.ts).

2. ~~**Missing RPC Function**: `issueReceiptAction` calls non-existent `allocate_document_number` RPC.~~ **FIXED** - Now uses `generate_document_number` RPC correctly via `finalizeDocument()` helper.

3. ~~**Non-existent RPC calls**: `lock_sequence_start` and `get_sequence_info` don't exist in database.~~ **FIXED** - Replaced with direct database queries using `initializeSequence()` and `isSequenceLocked()` helpers.

4. **TypeScript Build Errors Ignored**: `ignoreBuildErrors: true` in [next.config.mjs](next.config.mjs#L3) allows broken types to deploy. Recommend auditing and fixing type errors.

5. **Mixed Language Comments**: Hebrew comments in TypeScript files may confuse some tooling. Consider standardizing on English for code comments.

6. **No Automated Tests**: No test files found in workspace. Consider adding:
   - RLS policy tests (verify tenant isolation)
   - Server action validation tests
   - Document finalization workflow tests

## Recent Changes (Dec 27, 2025)

**Document Numbering Refactor**: Complete rebuild of sequence locking and document finalization logic
- Created [lib/document-helpers.ts](lib/document-helpers.ts) with unified helpers for multi-tenant access and document workflows
- Fixed table name inconsistency (`company_members` vs `company_memberships`)
- Removed calls to non-existent RPC functions (`allocate_document_number`, `lock_sequence_start`, `get_sequence_info`)
- Updated all document actions to use correct `generate_document_number` RPC via `finalizeDocument()` helper
- All `/dashboard/documents` routes now work end-to-end with clean draft→final workflow
