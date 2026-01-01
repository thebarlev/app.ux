"use client"

import { useState } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { FileCode, Check } from "lucide-react"
import { setSelectedTemplateAction } from "./actions"
import { toast } from "sonner"

type Template = {
  id: string
  name: string
  description: string | null
  document_type: string
  thumbnail_url: string | null
  is_default: boolean
  company_id: string | null
}

type Props = {
  initialTemplates: Template[]
  initialSelectedId: string | null
}

export default function TemplateSelectionClient({
  initialTemplates,
  initialSelectedId,
}: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    initialSelectedId
  )
  const [isUpdating, setIsUpdating] = useState(false)

  const handleSelectTemplate = async (templateId: string) => {
    setIsUpdating(true)

    const result = await setSelectedTemplateAction(templateId)

    if (result.ok) {
      setSelectedTemplateId(templateId)
      toast.success("תבנית נבחרה בהצלחה")
    } else {
      toast.error(result.message || "שגיאה בבחירת תבנית")
    }

    setIsUpdating(false)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">בחירת תבנית למסמכים</h1>
        <p className="text-muted-foreground mt-1">
          בחר תבנית אחת שתשמש עבור כל המסמכים שלך. ניתן לשנות בכל שלב.
        </p>
      </div>

      {/* Templates Grid */}
      {initialTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileCode className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">אין תבניות זמינות כרגע</p>
            <p className="text-sm text-muted-foreground mt-2">
              צור קשר עם מנהל המערכת להוספת תבניות
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {initialTemplates.map((template) => {
            const isSelected = template.id === selectedTemplateId
            const isGlobal = template.company_id === null

            return (
              <Card
                key={template.id}
                className={`overflow-hidden transition-all cursor-pointer hover:shadow-lg ${
                  isSelected ? "ring-2 ring-primary" : ""
                }`}
                onClick={() => handleSelectTemplate(template.id)}
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
                      <FileCode className="h-16 w-16 text-muted-foreground/30" />
                    </div>
                  )}

                  {/* Selected Badge */}
                  {isSelected && (
                    <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-2">
                      <Check className="h-5 w-5" />
                    </div>
                  )}

                  {/* Default Badge */}
                  {template.is_default && (
                    <div className="absolute top-3 left-3">
                      <Badge variant="secondary">ברירת מחדל</Badge>
                    </div>
                  )}
                </div>

                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription className="line-clamp-2 mt-1">
                        {template.description || "תבנית סטנדרטית"}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between">
                    <Badge variant={isGlobal ? "outline" : "default"}>
                      {isGlobal ? "תבנית מערכת" : "תבנית מותאמת"}
                    </Badge>
                    {isSelected && (
                      <span className="text-sm font-medium text-primary">
                        תבנית נוכחית
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base">מידע חשוב</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• ניתן לבחור תבנית אחת בכל פעם</p>
          <p>• התבנית הנבחרת תשמש לכל המסמכים החדשים</p>
          <p>• ניתן לשנות תבנית בכל שלב ללא השפעה על מסמכים קיימים</p>
          <p>• אין אפשרות לערוך את קוד התבניות - ניתן רק לבחור מבין התבניות הקיימות</p>
        </CardContent>
      </Card>
    </div>
  )
}
