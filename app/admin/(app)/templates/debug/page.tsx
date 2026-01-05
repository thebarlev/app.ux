import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function TemplatesDebugPage() {
  const supabase = await createClient()
  
  // Check if user is admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/admin/login")

  const { data: adminData } = await supabase
    .from("system_admins")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle()

  if (!adminData) {
    return <div className="p-8 text-red-600">Access denied - Admin only</div>
  }

  // Fetch all templates
  const { data: templates, error } = await supabase
    .from("templates")
    .select("*")
    .order("document_type", { ascending: true })
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false })

  // Count templates by document_type + default status
  const stats: Record<string, { total: number; defaults: number; nonDefaults: number }> = {}
  
  templates?.forEach(t => {
    const key = `${t.company_id || 'GLOBAL'}_${t.document_type}`
    if (!stats[key]) {
      stats[key] = { total: 0, defaults: 0, nonDefaults: 0 }
    }
    stats[key].total++
    if (t.is_default) {
      stats[key].defaults++
    } else {
      stats[key].nonDefaults++
    }
  })

  // Find conflicts (more than 1 default)
  const conflicts = Object.entries(stats).filter(([_, s]) => s.defaults > 1)

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">🔍 Templates Debug Panel</h1>

      {/* Conflicts Warning */}
      {conflicts.length > 0 && (
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-red-700 mb-3">
            ⚠️ {conflicts.length} Conflict(s) Detected!
          </h2>
          <p className="text-red-600 mb-4">
            Multiple templates marked as default for the same (company_id, document_type).
            This violates the unique constraint.
          </p>
          <ul className="space-y-2">
            {conflicts.map(([key, s]) => (
              <li key={key} className="font-mono text-sm bg-red-100 p-2 rounded">
                {key}: <strong>{s.defaults} defaults</strong> (should be max 1!)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Statistics */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3">📊 Statistics</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-2xl font-bold">{templates?.length || 0}</div>
            <div className="text-sm text-gray-600">Total Templates</div>
          </div>
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-2xl font-bold text-green-600">
              {templates?.filter(t => t.is_default).length || 0}
            </div>
            <div className="text-sm text-gray-600">Default Templates</div>
          </div>
          <div className="bg-white p-4 rounded shadow-sm">
            <div className="text-2xl font-bold text-gray-600">
              {templates?.filter(t => !t.is_default).length || 0}
            </div>
            <div className="text-sm text-gray-600">Non-Default Templates</div>
          </div>
        </div>
      </div>

      {/* Error Info */}
      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-semibold text-red-700 mb-2">Error Loading Templates</h2>
          <pre className="text-sm text-red-600">{JSON.stringify(error, null, 2)}</pre>
        </div>
      )}

      {/* Templates Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Document Type</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-center">Default</th>
              <th className="px-4 py-3 text-center">Active</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {templates?.map((t) => (
              <tr 
                key={t.id}
                className={`
                  ${t.is_default ? 'bg-green-50' : ''}
                  ${!t.is_active ? 'opacity-50' : ''}
                  hover:bg-gray-50
                `}
              >
                <td className="px-4 py-3 font-medium">
                  {t.name}
                  {!t.is_active && <span className="text-xs text-red-500 ml-2">(Inactive)</span>}
                </td>
                <td className="px-4 py-3">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    {t.document_type}
                  </code>
                </td>
                <td className="px-4 py-3">
                  {t.company_id ? (
                    <code className="bg-blue-100 px-2 py-1 rounded text-xs">
                      {t.company_id.slice(0, 8)}...
                    </code>
                  ) : (
                    <span className="bg-purple-100 px-2 py-1 rounded text-xs font-semibold">
                      GLOBAL
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.is_default ? (
                    <span className="inline-block w-3 h-3 bg-green-500 rounded-full"></span>
                  ) : (
                    <span className="inline-block w-3 h-3 bg-gray-300 rounded-full"></span>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
                  {t.is_active ? (
                    <span className="inline-block w-3 h-3 bg-blue-500 rounded-full"></span>
                  ) : (
                    <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(t.created_at).toLocaleString('he-IL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SQL Fix Instructions */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 mt-6">
        <h2 className="text-xl font-semibold mb-3">🔧 How to Fix</h2>
        <p className="mb-4">
          If you're seeing conflicts or duplicate key errors, run this SQL in Supabase:
        </p>
        <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`-- Step 1: Remove old constraint
ALTER TABLE templates 
DROP CONSTRAINT IF EXISTS unique_default_per_company_type;

-- Step 2: Create partial unique index (only for defaults)
CREATE UNIQUE INDEX unique_default_per_company_type
ON templates (company_id, document_type)
WHERE is_default = TRUE;

-- Step 3: Verify
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'templates' 
  AND indexname = 'unique_default_per_company_type';`}
        </pre>
        <p className="mt-4 text-sm text-gray-600">
          This allows unlimited non-default templates but only ONE default per (company_id, document_type).
        </p>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <a
          href="/admin/templates"
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          ← Back to Templates
        </a>
        <a
          href="/admin/templates/new"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Create New Template
        </a>
      </div>
    </div>
  )
}
