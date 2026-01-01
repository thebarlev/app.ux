"use client"

import { useState } from "react"
import type { TemplateDefinition } from "@/lib/types/template"
import { TEMPLATE_PLACEHOLDERS } from "@/lib/types/template"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Code, Palette, Eye, Save, Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { updateTemplateAction, type UpdateTemplatePayload } from "../actions"
import { toast } from "sonner"

type Props = {
  template: TemplateDefinition
}

export default function TemplateEditorClient({ template }: Props) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || "")
  const [documentType, setDocumentType] = useState(template.document_type)
  const [htmlTemplate, setHtmlTemplate] = useState(template.html_template)
  const [css, setCss] = useState(template.css || "")
  const [isDefault, setIsDefault] = useState(template.is_default)
  const [isActive, setIsActive] = useState(template.is_active)
  const [isSaving, setIsSaving] = useState(false)

  const isGlobal = template.company_id === null

  // Handle save
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload: UpdateTemplatePayload = {
        id: template.id,
        name,
        description,
        documentType: documentType as any,
        htmlTemplate,
        css,
        isDefault,
        isActive,
      }

      const result = await updateTemplateAction(payload)
      if (result.ok) {
        toast.success("התבנית נשמרה בהצלחה")
        router.push("/admin/templates")
      } else {
        toast.error(result.message)
      }
    } finally {
      setIsSaving(false)
    }
  }

  // Copy placeholder to clipboard
  const copyPlaceholder = (placeholder: string) => {
    navigator.clipboard.writeText(placeholder)
    toast.success("הועתק ללוח")
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button
            variant="ghost"
            onClick={() => router.push("/admin/templates")}
            className="mb-2"
          >
            <ArrowRight className="h-4 w-4 ml-2" />
            חזרה לרשימה
          </Button>
          <h1 className="text-3xl font-bold">עריכת תבנית</h1>
          <p className="text-muted-foreground mt-1">{template.name}</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(`/admin/templates/${template.id}/preview`)}
          >
            <Eye className="h-4 w-4 ml-2" />
            תצוגה מקדימה
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isGlobal}>
            <Save className="h-4 w-4 ml-2" />
            {isSaving ? "שומר..." : "שמור שינויים"}
          </Button>
        </div>
      </div>

      {isGlobal && (
        <Card className="border-yellow-500 bg-yellow-50">
          <CardHeader>
            <CardTitle className="text-yellow-800">תבנית גלובלית</CardTitle>
            <CardDescription className="text-yellow-700">
              לא ניתן לערוך תבניות גלובליות. ניתן לשכפל תבנית זו כדי ליצור גרסה מותאמת אישית.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Template Settings */}
          <Card>
            <CardHeader>
              <CardTitle>הגדרות תבנית</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">שם התבנית *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="תבנית קבלה סטנדרטית"
                  disabled={isGlobal}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">תיאור</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="תבנית עם פרטי חברה, לקוח, ותשלומים"
                  rows={2}
                  disabled={isGlobal}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentType">סוג מסמך</Label>
                <Select
                  value={documentType}
                  onValueChange={(value) => setDocumentType(value as any)}
                  disabled={isGlobal}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="receipt">קבלה</SelectItem>
                    <SelectItem value="invoice">חשבונית</SelectItem>
                    <SelectItem value="quote">הצעת מחיר</SelectItem>
                    <SelectItem value="delivery_note">תעודת משלוח</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="isDefault">הגדר כברירת מחדל</Label>
                <Switch
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                  disabled={isGlobal}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="isActive">תבנית פעילה</Label>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                  disabled={isGlobal}
                />
              </div>
            </CardContent>
          </Card>

          {/* Code Editor */}
          <Card>
            <CardHeader>
              <CardTitle>עורך תבנית</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="html">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="html">
                    <Code className="h-4 w-4 ml-2" />
                    HTML
                  </TabsTrigger>
                  <TabsTrigger value="css">
                    <Palette className="h-4 w-4 ml-2" />
                    CSS
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="html" className="space-y-4">
                  <Textarea
                    value={htmlTemplate}
                    onChange={(e) => setHtmlTemplate(e.target.value)}
                    placeholder="<div>{{company.name}}</div>"
                    rows={25}
                    className="font-mono text-sm"
                    disabled={isGlobal}
                    dir="ltr"
                  />
                </TabsContent>
                <TabsContent value="css" className="space-y-4">
                  <Textarea
                    value={css}
                    onChange={(e) => setCss(e.target.value)}
                    placeholder=".header { font-size: 24px; }"
                    rows={25}
                    className="font-mono text-sm"
                    disabled={isGlobal}
                    dir="ltr"
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Placeholders Reference Panel */}
        <div className="lg:col-span-1">
          <Card className="sticky top-4">
            <CardHeader>
              <CardTitle>Placeholders זמינים</CardTitle>
              <CardDescription>
                לחץ כדי להעתיק את ה-placeholder ללוח
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[calc(100vh-300px)]">
                <Accordion type="multiple" className="w-full">
                  {TEMPLATE_PLACEHOLDERS.map((category) => (
                    <AccordionItem key={category.category} value={category.category}>
                      <AccordionTrigger className="text-sm font-semibold">
                        {category.category}
                        <Badge variant="secondary" className="mr-auto ml-2">
                          {category.placeholders.length}
                        </Badge>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className="space-y-3">
                          {category.placeholders.map((placeholder) => (
                            <div
                              key={placeholder.name}
                              className="p-3 rounded-lg border hover:bg-accent cursor-pointer transition-colors"
                              onClick={() => copyPlaceholder(placeholder.name)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <code className="text-xs font-mono text-primary break-all">
                                    {placeholder.name}
                                  </code>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {placeholder.description}
                                  </p>
                                  {placeholder.example && (
                                    <p className="text-xs text-muted-foreground/70 mt-1 italic">
                                      דוגמה: {placeholder.example}
                                    </p>
                                  )}
                                </div>
                                <Copy className="h-3 w-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                              </div>
                            </div>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
