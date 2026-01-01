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
import { Plus, Edit, Copy, Trash2, Power, Eye, FileCode } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  deleteTemplateAction,
  duplicateTemplateAction,
  toggleTemplateActiveAction,
} from "./actions"
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">ניהול תבניות מסמכים</h1>
          <p className="text-muted-foreground mt-1">
            נהל תבניות HTML/CSS למסמכים שונים
          </p>
        </div>
        <Button onClick={() => router.push("/admin/templates/new")}>
          <Plus className="h-4 w-4 ml-2" />
          תבנית חדשה
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 items-center">
        <Input
          placeholder="חיפוש תבניות..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-xs"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[180px]">
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
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="היקף" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="company">תבניות החברה</SelectItem>
            <SelectItem value="global">תבניות גלובליות</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Templates Grid */}
      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 border rounded-lg">
          <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">לא נמצאו תבניות</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => (
            <Card key={template.id} className="overflow-hidden">
              {/* Thumbnail */}
              <div className="aspect-video bg-muted relative group">
                {template.thumbnail_url ? (
                  <img
                    src={template.thumbnail_url}
                    alt={template.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <FileCode className="h-16 w-16 text-muted-foreground/30" />
                  </div>
                )}
                {/* Quick Actions Overlay */}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => router.push(`/admin/templates/${template.id}`)}
                  >
                    <Edit className="h-4 w-4 ml-2" />
                    עריכה
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDuplicate(template.id)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-lg truncate">{template.name}</CardTitle>
                    <CardDescription className="line-clamp-2">
                      {template.description || "אין תיאור"}
                    </CardDescription>
                  </div>
                  <Badge variant={template.is_active ? "default" : "outline"}>
                    {template.is_active ? "פעיל" : "מושבת"}
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">סוג:</span>
                  <Badge variant="secondary">
                    {DOCUMENT_TYPE_LABELS[template.document_type]}
                  </Badge>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">היקף:</span>
                  <Badge variant={template.company_id ? "default" : "outline"}>
                    {template.company_id ? "חברה" : "גלובלי"}
                  </Badge>
                </div>
                {template.is_default && (
                  <Badge variant="outline" className="w-full justify-center">
                    ברירת מחדל
                  </Badge>
                )}
              </CardContent>

              <CardFooter className="gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() =>
                    handleToggleActive(template.id, template.is_active)
                  }
                  disabled={template.company_id === null}
                >
                  <Power className="h-4 w-4 ml-2" />
                  {template.is_active ? "השבת" : "הפעל"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => router.push(`/admin/templates/${template.id}/preview`)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                {template.company_id && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setSelectedTemplateId(template.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>האם למחוק תבנית זו?</AlertDialogTitle>
            <AlertDialogDescription>
              פעולה זו לא ניתנת לביטול. התבנית תימחק לצמיתות.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
