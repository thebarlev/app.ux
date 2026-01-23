"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Check, FileCode, Sparkles, Globe, Building2, Loader2 } from "lucide-react"
import { DOCUMENT_TYPE_LABELS, type DocumentType } from "@/config/documentVariables"
import {
  getTemplatesForDocumentTypeAction,
  saveTemplateSelectionAction,
  type TemplateWithSelection,
} from "@/app/dashboard/settings/template-selection-actions"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
}

export default function TemplateSelectionGrid({ className }: Props) {
  const [activeTab, setActiveTab] = useState<DocumentType>("receipt")
  const [templates, setTemplates] = useState<TemplateWithSelection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)

  // Document types to show
  const documentTypes: DocumentType[] = [
    "receipt",
    "invoice",
    "tax_invoice",
    "quote",
    "delivery_note",
    "credit_invoice",
  ]

  // Load templates for active tab
  useEffect(() => {
    loadTemplates(activeTab)
  }, [activeTab])

  async function loadTemplates(docType: DocumentType) {
    setIsLoading(true)
    const result = await getTemplatesForDocumentTypeAction(docType)

    if (result.ok) {
      setTemplates(result.templates)
      const selected = result.templates.find((t) => t.is_selected)
      setSelectedTemplateId(selected?.id || null)
    } else {
      toast.error(result.message)
      setTemplates([])
    }
    setIsLoading(false)
  }

  async function handleSelectTemplate(templateId: string) {
    if (selectedTemplateId === templateId) {
      toast.info("תבנית זו כבר נבחרה")
      return
    }

    setIsSaving(true)
    const result = await saveTemplateSelectionAction(activeTab, templateId)

    if (result.ok) {
      setSelectedTemplateId(templateId)
      setTemplates(
        templates.map((t) => ({
          ...t,
          is_selected: t.id === templateId,
        }))
      )
      toast.success("התבנית נשמרה בהצלחה")
    } else {
      toast.error(result.message || "שגיאה בשמירת התבנית")
    }
    setIsSaving(false)
  }

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          בחירת תבניות מסמכים
        </CardTitle>
        <CardDescription>
          בחר תבנית ייחודית לכל סוג מסמך. ניתן לבחור תבנית אחת בלבד לכל סוג.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DocumentType)}>
          <TabsList className="grid w-full grid-cols-3 lg:grid-cols-6 mb-6">
            {documentTypes.map((type) => (
              <TabsTrigger key={type} value={type} className="text-xs lg:text-sm">
                {DOCUMENT_TYPE_LABELS[type]}
              </TabsTrigger>
            ))}
          </TabsList>

          {documentTypes.map((type) => (
            <TabsContent key={type} value={type} className="mt-0">
              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : templates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FileCode className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-lg font-semibold text-muted-foreground">
                    אין תבניות זמינות
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    צור תבנית חדשה או פנה למנהל המערכת
                  </p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-1">
                    {templates.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        isSelected={template.is_selected || false}
                        isSaving={isSaving && selectedTemplateId === template.id}
                        onSelect={() => handleSelectTemplate(template.id)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}

// ==================== TEMPLATE CARD ====================

type TemplateCardProps = {
  template: TemplateWithSelection
  isSelected: boolean
  isSaving: boolean
  onSelect: () => void
}

function TemplateCard({ template, isSelected, isSaving, onSelect }: TemplateCardProps) {
  const isGlobal = template.company_id === null

  return (
    <div
      onClick={onSelect}
      className={cn(
        "group relative cursor-pointer rounded-lg border-2 transition-all hover:shadow-lg",
        isSelected
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border bg-card hover:border-primary/50"
      )}
    >
      {/* Selected Badge */}
      {isSelected && (
        <div className="absolute -top-2 -left-2 z-10">
          <div className="flex items-center gap-1 bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold shadow-lg">
            <Check className="h-3 w-3" />
            נבחר
          </div>
        </div>
      )}

      {/* Thumbnail */}
      <div className="relative h-40 bg-muted rounded-t-lg overflow-hidden">
        {template.thumbnail_url ? (
          <img
            src={template.thumbnail_url}
            alt={template.name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileCode className="h-16 w-16 text-muted-foreground/50" />
          </div>
        )}

        {/* Overlay on hover */}
        <div
          className={cn(
            "absolute inset-0 bg-black/60 opacity-0 transition-opacity flex items-center justify-center",
            !isSelected && "group-hover:opacity-100"
          )}
        >
          <Button variant="secondary" size="sm" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                שומר...
              </>
            ) : (
              "בחר תבנית"
            )}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-sm line-clamp-1">{template.name}</h3>
          {isGlobal ? (
            <Badge variant="secondary" className="flex-shrink-0">
              <Globe className="h-3 w-3 ml-1" />
              גלובלי
            </Badge>
          ) : (
            <Badge variant="outline" className="flex-shrink-0">
              <Building2 className="h-3 w-3 ml-1" />
              שלי
            </Badge>
          )}
        </div>

        {template.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {template.description}
          </p>
        )}

        {template.is_default && (
          <Badge variant="default" className="text-xs">
            ברירת מחדל
          </Badge>
        )}
      </div>

      {/* Selected Indicator */}
      {isSelected && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-primary ring-offset-2 pointer-events-none" />
      )}
    </div>
  )
}
