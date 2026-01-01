"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileCode, Check, Loader2 } from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"

type Template = {
  id: string
  name: string
  description: string | null
  thumbnail_url: string | null
  is_default: boolean
  company_id: string | null
}

type Props = {
  initialTemplates: Template[]
  selectedTemplateId: string | null
  onTemplateSelect: (templateId: string) => Promise<{ ok: boolean; message?: string }>
}

export default function TemplateSelector({
  initialTemplates,
  selectedTemplateId,
  onTemplateSelect,
}: Props) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [selected, setSelected] = useState<string | null>(selectedTemplateId)
  const [isUpdating, setIsUpdating] = useState(false)
  const [viewMode, setViewMode] = useState<"gallery" | "dropdown">("gallery")

  const handleSelect = async (templateId: string) => {
    if (templateId === selected) return

    setIsUpdating(true)
    const result = await onTemplateSelect(templateId)

    if (result.ok) {
      setSelected(templateId)
      toast.success("תבנית נבחרה בהצלחה")
    } else {
      toast.error(result.message || "שגיאה בבחירת תבנית")
    }

    setIsUpdating(false)
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">אין תבניות זמינות כרגע</p>
          <p className="text-sm text-muted-foreground mt-2">
            צור קשר עם מנהל המערכת להוספת תבניות
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">תבנית מסמכים</h3>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={viewMode === "gallery" ? "default" : "outline"}
            onClick={() => setViewMode("gallery")}
          >
            תצוגת גלריה
          </Button>
          <Button
            size="sm"
            variant={viewMode === "dropdown" ? "default" : "outline"}
            onClick={() => setViewMode("dropdown")}
          >
            רשימה נפתחת
          </Button>
        </div>
      </div>

      {/* Dropdown View */}
      {viewMode === "dropdown" && (
        <Select
          value={selected || undefined}
          onValueChange={handleSelect}
          disabled={isUpdating}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="בחר תבנית..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((template) => (
              <SelectItem key={template.id} value={template.id}>
                <div className="flex items-center gap-2">
                  {template.id === selected && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                  <span>{template.name}</span>
                  {template.company_id === null && (
                    <Badge variant="outline" className="mr-2">
                      מערכת
                    </Badge>
                  )}
                  {template.is_default && (
                    <Badge variant="secondary" className="mr-2">
                      ברירת מחדל
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Gallery View */}
      {viewMode === "gallery" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((template) => {
            const isSelected = template.id === selected
            const isGlobal = template.company_id === null

            return (
              <Card
                key={template.id}
                className={`overflow-hidden transition-all cursor-pointer hover:shadow-lg ${
                  isSelected ? "ring-2 ring-primary shadow-lg" : ""
                } ${isUpdating ? "opacity-50 pointer-events-none" : ""}`}
                onClick={() => handleSelect(template.id)}
              >
                {/* Thumbnail */}
                <div className="aspect-video bg-muted relative">
                  {template.thumbnail_url ? (
                    <img
                      src={template.thumbnail_url}
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <FileCode className="h-12 w-12 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/10 flex items-center justify-center">
                      <div className="bg-primary text-primary-foreground rounded-full p-3">
                        <Check className="h-6 w-6" />
                      </div>
                    </div>
                  )}

                  {/* Badges */}
                  <div className="absolute top-3 left-3 flex gap-2 flex-col items-start">
                    {template.is_default && (
                      <Badge variant="secondary">ברירת מחדל</Badge>
                    )}
                    {isGlobal && <Badge variant="outline">תבנית מערכת</Badge>}
                  </div>
                </div>

                {/* Info */}
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold truncate">{template.name}</h4>
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                        {template.description || "תבנית סטנדרטית למסמכים"}
                      </p>
                    </div>
                    {isSelected && (
                      <Badge variant="default" className="shrink-0">
                        פעיל
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Loading Overlay */}
      {isUpdating && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card p-6 rounded-lg shadow-lg flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>מעדכן תבנית...</span>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="text-sm text-muted-foreground bg-muted/50 p-4 rounded-lg">
        <p className="font-medium mb-2">💡 טיפ:</p>
        <ul className="space-y-1 mr-4">
          <li>• התבנית הנבחרת תשמש לכל המסמכים החדשים</li>
          <li>• ניתן לשנות תבנית בכל שלב</li>
          <li>• שינוי תבנית לא ישפיע על מסמכים קיימים</li>
        </ul>
      </div>
    </div>
  )
}
