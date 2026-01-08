"use client"

import { useState } from "react"
import type { TemplateDefinition } from "@/lib/types/template"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Plus, Edit, Copy, Trash2, Power, Eye, FileCode, Wrench } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  deleteTemplateAction,
  duplicateTemplateAction,
  toggleTemplateActiveAction,
} from "./actions"
import { fixReceiptTemplatesAction } from "./fix-template-action"
import { toast } from "sonner"

type Props = {
  initialTemplates: TemplateDefinition[]
}

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: "קבלה",
  invoice: "חשבונית",
  quote: "הצעת מחיר",
  delivery_note: "תעודת משלוח",
  credit_invoice: "חשבונית זכות",
}

export default function TemplatesClient({ initialTemplates }: Props) {
  const router = useRouter()
  const [templates, setTemplates] = useState(initialTemplates)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterType, setFilterType] = useState<string>("all")
  const [filterScope, setFilterScope] = useState<string>("all")
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // Filter templates
  const filteredTemplates = templates.filter((template) => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesType = filterType === "all" || template.document_type === filterType
    const matchesScope =
      filterScope === "all" ||
      (filterScope === "company" && template.company_id !== null) ||
      (filterScope === "global" && template.company_id === null)
    return matchesSearch && matchesType && matchesScope
  })

  // Handle delete
  const handleDelete = async () => {
    if (!selectedTemplateId) return

    const result = await deleteTemplateAction(selectedTemplateId)
    if (result.ok) {
      setTemplates(templates.filter((t) => t.id !== selectedTemplateId))
      toast.success("התבנית נמחקה בהצלחה")
    } else {
      toast.error(result.message)
    }
    setDeleteDialogOpen(false)
    setSelectedTemplateId(null)
  }

  // Handle duplicate
  const handleDuplicate = async (templateId: string) => {
    const result = await duplicateTemplateAction(templateId)
    if (result.ok) {
      toast.success("התבנית שוכפלה בהצלחה")
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  // Handle fix templates
  const handleFixTemplates = async () => {
    const result = await fixReceiptTemplatesAction()
    if (result.ok) {
      toast.success(result.message || `תוקנו ${result.fixed} תבניות`)
      router.refresh()
    } else {
      toast.error(result.message)
    }
  }

  // Handle toggle active
  const handleToggleActive = async (templateId: string, currentStatus: boolean) => {
    const result = await toggleTemplateActiveAction(templateId, !currentStatus)
    if (result.ok) {
      setTemplates(
        templates.map((t) =>
          t.id === templateId ? { ...t, is_active: !currentStatus } : t
        )
      )
      toast.success(!currentStatus ? "התבנית הופעלה" : "התבנית הושבתה")
    } else {
      toast.error(result.message)
    }
  }

  return (
    <div style={{ paddingBottom: '50px' }}>
      {/* Header */}
      <div className="ui-page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' }}>
          <div>
            <h1 className="ui-page-title" style={{ fontSize: '36px', fontWeight: 700, color: '#19183B', marginBottom: '8px' }}>
              ניהול תבניות מסמכים
            </h1>
            <p style={{ fontSize: '18px', color: '#19183B', opacity: 0.7 }}>
              נהל תבניות HTML/CSS למסמכים שונים
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button 
              variant="secondary" 
              onClick={handleFixTemplates}
              style={{ background: '#EDF1F5', color: '#19183B', border: '1px solid #d1d5db' }}
            >
              <Wrench className="h-4 w-4 ml-2" />
              תיקון תבניות קבלה
            </Button>
            <Button onClick={() => router.push("/admin/templates/new")}>
              <Plus className="h-4 w-4 ml-2" />
              תבנית חדשה
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: '1', minWidth: '250px', maxWidth: '400px' }}>
            <Input
              placeholder="חיפוש תבניות..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger style={{ width: '180px' }}>
              <SelectValue placeholder="סוג מסמך" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              <SelectItem value="receipt">קבלה</SelectItem>
              <SelectItem value="invoice">חשבונית</SelectItem>
              <SelectItem value="quote">הצעת מחיר</SelectItem>
              <SelectItem value="delivery_note">תעודת משלוח</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterScope} onValueChange={setFilterScope}>
            <SelectTrigger style={{ width: '180px' }}>
              <SelectValue placeholder="היקף" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">הכל</SelectItem>
              <SelectItem value="company">תבניות החברה</SelectItem>
              <SelectItem value="global">תבניות גלובליות</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Templates Table */}
      {filteredTemplates.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #e5e7eb'
        }}>
          <FileCode style={{ height: '48px', width: '48px', margin: '0 auto 16px', color: '#708993' }} />
          <p style={{ fontSize: '18px', color: '#19183B', fontWeight: 500 }}>לא נמצאו תבניות</p>
        </div>
      ) : (
        <div style={{
          background: '#FFFFFF',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th className="table-cell" style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: '#19183B', fontSize: '14px' }}>
                  שם תבנית
                </th>
                <th className="table-cell" style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: '#19183B', fontSize: '14px' }}>
                  סוג מסמך
                </th>
                <th className="table-cell" style={{ padding: '16px', textAlign: 'right', fontWeight: 600, color: '#19183B', fontSize: '14px' }}>
                  היקף
                </th>
                <th className="table-cell" style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#19183B', fontSize: '14px' }}>
                  סטטוס
                </th>
                <th className="table-cell" style={{ padding: '16px', textAlign: 'center', fontWeight: 600, color: '#19183B', fontSize: '14px' }}>
                  פעולות
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredTemplates.map((template, idx) => (
                <tr
                  key={template.id}
                  style={{
                    borderBottom: idx < filteredTemplates.length - 1 ? '1px solid #e5e7eb' : 'none',
                    background: idx % 2 === 0 ? '#FFFFFF' : '#f9fafb',
                    transition: 'background-color 0.15s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#f3f4f6'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = idx % 2 === 0 ? '#FFFFFF' : '#f9fafb'
                  }}
                >
                  <td className="table-cell" style={{ padding: '16px', color: '#19183B', fontSize: '16px' }}>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: '4px' }}>{template.name}</div>
                      {template.description && (
                        <div style={{ fontSize: '14px', color: '#19183B', opacity: 0.7 }}>
                          {template.description}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="table-cell" style={{ padding: '16px', color: '#19183B', fontSize: '16px' }}>
                    <Badge
                      variant="secondary"
                      style={{
                        background: '#EDF1F5',
                        color: '#19183B',
                        border: '1px solid #d1d5db',
                        fontSize: '14px',
                        fontWeight: 500
                      }}
                    >
                      {DOCUMENT_TYPE_LABELS[template.document_type]}
                    </Badge>
                  </td>
                  <td className="table-cell" style={{ padding: '16px', color: '#19183B', fontSize: '16px' }}>
                    <Badge
                      variant={template.company_id ? "default" : "outline"}
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        ...(template.company_id ? {
                          background: '#1D868F',
                          color: '#FFFFFF',
                          border: 'none'
                        } : {
                          background: 'transparent',
                          color: '#19183B',
                          border: '1px solid #d1d5db'
                        })
                      }}
                    >
                      {template.company_id ? "חברה" : "גלובלי"}
                    </Badge>
                    {template.is_default && (
                      <Badge
                        variant="outline"
                        style={{
                          marginRight: '8px',
                          fontSize: '14px',
                          fontWeight: 500,
                          background: '#fef3c7',
                          color: '#92400e',
                          border: '1px solid #fbbf24'
                        }}
                      >
                        ברירת מחדל
                      </Badge>
                    )}
                  </td>
                  <td className="table-cell" style={{ padding: '16px', textAlign: 'center' }}>
                    <Badge
                      variant={template.is_active ? "default" : "outline"}
                      style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        ...(template.is_active ? {
                          background: '#1D868F',
                          color: '#FFFFFF',
                          border: 'none'
                        } : {
                          background: '#f3f4f6',
                          color: '#6b7280',
                          border: '1px solid #d1d5db'
                        })
                      }}
                    >
                      {template.is_active ? "פעיל" : "מושבת"}
                    </Badge>
                  </td>
                  <td className="table-cell" style={{ padding: '16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', alignItems: 'center' }}>
                      <button
                        onClick={() => router.push(`/admin/templates/${template.id}`)}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '5px',
                          color: '#19183B',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6'
                          e.currentTarget.style.borderColor = '#9ca3af'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                      >
                        <Edit style={{ height: '16px', width: '16px' }} />
                        עריכה
                      </button>
                      <button
                        onClick={() => handleDuplicate(template.id)}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '5px',
                          color: '#19183B',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6'
                          e.currentTarget.style.borderColor = '#9ca3af'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                      >
                        <Copy style={{ height: '16px', width: '16px' }} />
                      </button>
                      <button
                        onClick={() => window.open(`/admin/templates/${template.id}/preview`, '_blank')}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '5px',
                          color: '#19183B',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6'
                          e.currentTarget.style.borderColor = '#9ca3af'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                      >
                        <Eye style={{ height: '16px', width: '16px' }} />
                      </button>
                      <button
                        onClick={() => {
                          handleToggleActive(template.id, template.is_active)
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '5px',
                          color: '#19183B',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#f3f4f6'
                          e.currentTarget.style.borderColor = '#9ca3af'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                      >
                        <Power style={{ height: '16px', width: '16px' }} />
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTemplateId(template.id)
                          setDeleteDialogOpen(true)
                        }}
                        style={{
                          padding: '6px 12px',
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          borderRadius: '5px',
                          color: '#9B0003',
                          fontSize: '14px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = '#fee2e2'
                          e.currentTarget.style.borderColor = '#9B0003'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent'
                          e.currentTarget.style.borderColor = '#d1d5db'
                        }}
                      >
                        <Trash2 style={{ height: '16px', width: '16px' }} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent style={{ background: '#FFFFFF', borderRadius: '8px' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ fontSize: '20px', fontWeight: 700, color: '#19183B' }}>
              האם למחוק תבנית זו?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ fontSize: '16px', color: '#19183B', opacity: 0.8, marginTop: '8px' }}>
              פעולה זו לא ניתנת לביטול. התבנית תימחק לצמיתות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter style={{ marginTop: '24px', gap: '12px' }}>
            <AlertDialogCancel style={{
              background: 'transparent',
              border: '1px solid #d1d5db',
              color: '#19183B',
              fontSize: '16px',
              fontWeight: 500
            }}>
              ביטול
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              style={{
                background: '#9B0003',
                color: '#FFFFFF',
                border: 'none',
                fontSize: '16px',
                fontWeight: 500
              }}
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
