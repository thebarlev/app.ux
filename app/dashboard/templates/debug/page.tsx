import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { getCompanyIdForUser } from "@/lib/document-helpers"

export default async function TemplateDebugUserPage() {
  const supabase = await createClient()
  
  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Get company ID
  let companyId: string | null = null
  try {
    companyId = await getCompanyIdForUser()
  } catch (error) {
    return (
      <div className="p-8 text-red-600">
        No company found for user. Contact support.
      </div>
    )
  }

  // Get company details
  const { data: company } = await supabase
    .from("companies")
    .select("company_name, email")
    .eq("id", companyId)
    .single()

  // Get all available templates for this user
  const { data: allTemplates } = await supabase
    .from("templates")
    .select("*")
    .or(`company_id.eq.${companyId},company_id.is.null`)
    .eq("is_active", true)
    .order("document_type")
    .order("is_default", { ascending: false })

  // Get default templates per document type
  const defaultsByType: Record<string, any> = {}
  allTemplates?.forEach(t => {
    if (t.is_default && !defaultsByType[t.document_type]) {
      defaultsByType[t.document_type] = t
    }
  })

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">🔍 Template Debug - User View</h1>

      {/* User Info */}
      <div className="bg-blue-50 border border-blue-300 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3">👤 User Information</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm text-gray-600">Email</div>
            <div className="font-mono font-semibold">{user.email}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Company</div>
            <div className="font-semibold">{company?.company_name || 'N/A'}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">Company ID</div>
            <div className="font-mono text-sm">{companyId}</div>
          </div>
          <div>
            <div className="text-sm text-gray-600">User ID</div>
            <div className="font-mono text-sm">{user.id}</div>
          </div>
        </div>
      </div>

      {/* Default Templates */}
      <div className="bg-green-50 border border-green-300 rounded-lg p-6 mb-6">
        <h2 className="text-xl font-semibold mb-3">✅ Active Default Templates</h2>
        <p className="text-sm text-gray-600 mb-4">
          These templates will be used when generating PDFs:
        </p>
        
        {Object.keys(defaultsByType).length === 0 ? (
          <div className="bg-yellow-50 border border-yellow-300 rounded p-4">
            <p className="text-yellow-800">
              ⚠️ No default templates set! PDFs will use hardcoded fallback.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {Object.entries(defaultsByType).map(([docType, template]) => (
              <div key={docType} className="bg-white rounded-lg p-4 border border-green-200">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-lg">{template.name}</div>
                    <div className="flex gap-3 mt-1">
                      <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                        {docType}
                      </code>
                      {template.company_id === null ? (
                        <span className="text-xs bg-purple-100 px-2 py-1 rounded">
                          Global Template
                        </span>
                      ) : (
                        <span className="text-xs bg-blue-100 px-2 py-1 rounded">
                          Company Template
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm font-semibold text-green-700">Default</span>
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Template ID: <code>{template.id}</code>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* All Available Templates */}
      <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
        <div className="bg-gray-100 p-4 border-b">
          <h2 className="text-xl font-semibold">📋 All Available Templates</h2>
          <p className="text-sm text-gray-600 mt-1">
            Total: {allTemplates?.length || 0} templates
          </p>
        </div>
        
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Document Type</th>
              <th className="px-4 py-3 text-left">Scope</th>
              <th className="px-4 py-3 text-center">Default</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allTemplates?.map((t) => (
              <tr 
                key={t.id}
                className={t.is_default ? 'bg-green-50' : 'hover:bg-gray-50'}
              >
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3">
                  <code className="bg-gray-100 px-2 py-1 rounded text-xs">
                    {t.document_type}
                  </code>
                </td>
                <td className="px-4 py-3">
                  {t.company_id === null ? (
                    <span className="bg-purple-100 px-2 py-1 rounded text-xs">
                      Global
                    </span>
                  ) : t.company_id === companyId ? (
                    <span className="bg-blue-100 px-2 py-1 rounded text-xs">
                      My Company
                    </span>
                  ) : (
                    <span className="bg-gray-100 px-2 py-1 rounded text-xs">
                      Other
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
                <td className="px-4 py-3 text-xs text-gray-500">
                  {new Date(t.created_at).toLocaleString('he-IL')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* SQL Debug Query */}
      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-3">🔧 Debug Query</h2>
        <p className="text-sm mb-4">
          Run this in Supabase to verify your default templates:
        </p>
        <pre className="bg-gray-900 text-green-400 p-4 rounded overflow-x-auto text-sm">
{`-- Check default templates for your company
SELECT 
  id,
  name,
  document_type,
  is_default,
  company_id,
  created_at
FROM templates
WHERE (company_id = '${companyId}' OR company_id IS NULL)
  AND is_active = true
  AND is_default = true
ORDER BY document_type;`}
        </pre>
      </div>

      {/* Actions */}
      <div className="mt-6 flex gap-4">
        <a
          href="/dashboard/settings"
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Go to Settings
        </a>
        <a
          href="/dashboard/documents/receipt"
          className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
        >
          Create Receipt (Test Template)
        </a>
      </div>
    </div>
  )
}
