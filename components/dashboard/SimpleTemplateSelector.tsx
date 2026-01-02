"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { FileCode, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { TemplateDefinition } from "@/lib/types/template"

type TemplateWithDefault = TemplateDefinition & {
  isCurrentDefault?: boolean
}

type Props = {
  className?: string
}

export default function SimpleTemplateSelector({ className }: Props) {
  const [templates, setTemplates] = useState<TemplateWithDefault[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    setLoading(true)
    try {
      console.log("🔵 [SimpleTemplateSelector] Loading templates from API...")
      const response = await fetch('/api/templates/user-templates')
      if (!response.ok) throw new Error('Failed to load templates')
      
      const data = await response.json()
      console.log("🔵 [SimpleTemplateSelector] Loaded templates:", data.templates?.map((t: any) => ({
        name: t.name,
        id: t.id.substring(0, 8),
        is_default: t.is_default,
        company_id: t.company_id ? 'company' : 'global'
      })))
      setTemplates(data.templates || [])
    } catch (error) {
      toast.error("שגיאה בטעינת תבניות")
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const handleToggleDefault = async (template: TemplateWithDefault) => {
    // Always turn ON when clicked (not toggle)
    const newDefaultState = true
    
    console.log("🔵 [SimpleTemplateSelector] User clicked template:", {
      templateId: template.id,
      templateName: template.name,
      documentType: template.document_type,
      companyId: template.company_id,
      currentDefault: template.is_default,
      newDefault: newDefaultState
    })
    
    setUpdatingId(template.id)
    
    // Optimistic update: Turn ON clicked template, turn OFF all others with same document_type
    setTemplates(prev => prev.map(t => ({
      ...t,
      is_default: t.id === template.id ? true : (t.document_type === template.document_type ? false : t.is_default)
    })))

    try {
      console.log("🔵 [SimpleTemplateSelector] Calling API /api/templates/set-default...")
      
      const response = await fetch('/api/templates/set-default', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: template.id,
          isDefault: newDefaultState
        })
      })

      const result = await response.json()
      console.log("🔵 [SimpleTemplateSelector] API Response:", { status: response.status, result })

      if (!response.ok) {
        console.error("❌ [SimpleTemplateSelector] API failed:", result)
        throw new Error(result.message || 'Failed to update')
      }

      toast.success("תבנית הוגדרה כברירת מחדל ✓")
      
      // Reload to get accurate state
      console.log("🔵 [SimpleTemplateSelector] Reloading templates from server...")
      await loadTemplates()
    } catch (error) {
      // Revert optimistic update
      console.error("❌ [SimpleTemplateSelector] Error updating template:", error)
      await loadTemplates()
      toast.error("שגיאה בעדכון תבנית")
      console.error(error)
    } finally {
      setUpdatingId(null)
    }
  }

  if (loading) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </Card>
    )
  }

  if (templates.length === 0) {
    return (
      <Card className={cn("p-8", className)}>
        <div className="text-center text-muted-foreground">
          <FileCode className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>אין תבניות זמינות</p>
        </div>
      </Card>
    )
  }

  return (
    <div className={cn("space-y-3", className)}>
      {templates.map((template) => (
        <Card
          key={template.id}
          className={cn(
            "transition-all hover:shadow-md",
            !template.is_default && "cursor-pointer",
            template.is_default && "bg-green-50 ring-2 ring-green-500 shadow-lg"
          )}
          onClick={() => {
            if (updatingId || template.is_default) return
            handleToggleDefault(template)
          }}
        >
          <div className="flex items-center gap-4 p-4">
            {/* Thumbnail - Right side (RTL) */}
            <div className="flex-shrink-0 w-24 h-32 bg-muted rounded-lg overflow-hidden border">
              {template.thumbnail_url ? (
                <img
                  src={template.thumbnail_url}
                  alt={template.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <FileCode className="h-10 w-10 text-muted-foreground/50" />
                </div>
              )}
            </div>

            {/* Content - Left side (RTL) */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-lg truncate mb-1">
                    {template.name}
                  </h3>
                  
                  {template.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                      {template.description}
                    </p>
                  )}

                  {/* Badges */}
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="text-xs">
                      {getDocumentTypeLabel(template.document_type)}
                    </Badge>
                    
                    {template.company_id === null && (
                      <Badge variant="secondary" className="text-xs">
                        תבנית גלובלית
                      </Badge>
                    )}
                    
                    {template.is_default && (
                      <Badge className="text-xs bg-green-600 hover:bg-green-700">
                        ברירת מחדל ✓
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Status Indicator */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  {template.is_default ? (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-green-500 flex items-center justify-center shadow-lg">
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          viewBox="0 0 24 24" 
                          fill="white"
                          className="w-7 h-7"
                        >
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                      </div>
                      <span className="text-xs font-semibold text-green-600 mt-1">
                        פעיל
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center transition-colors">
                        <span className="text-gray-400 text-2xl font-light">○</span>
                      </div>
                      <span className="text-xs text-muted-foreground mt-1">
                        {updatingId === template.id ? "מעדכן..." : "בחר"}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}

// Helper function for document type labels
function getDocumentTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    receipt: "קבלה",
    invoice: "חשבונית",
    tax_invoice: "חשבונית מס",
    quote: "הצעת מחיר",
    delivery_note: "תעודת משלוח",
    credit_invoice: "זיכוי",
    proforma: "חשבונית פרופורמה",
    transaction_invoice: "חשבונית עסקה"
  }
  return labels[type] || type
}
