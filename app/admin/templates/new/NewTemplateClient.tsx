"use client"

import { useState } from "react"
import { TEMPLATE_PLACEHOLDERS } from "@/lib/types/template"
import { getDefaultReceiptTemplate } from "@/lib/default-templates"
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
import { ArrowRight, Code, Palette, Save, Copy, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { createTemplateAction, type CreateTemplatePayload } from "../actions"
import { toast } from "sonner"

export default function NewTemplateClient() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [documentType, setDocumentType] = useState<"receipt" | "invoice" | "quote" | "delivery_note">("receipt")
  const [htmlTemplate, setHtmlTemplate] = useState("")
  const [css, setCss] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Load default template
  const loadDefaultTemplate = () => {
    if (documentType === "receipt") {
      const defaultTemplate = getDefaultReceiptTemplate()
      setHtmlTemplate(defaultTemplate.html)
      setCss(defaultTemplate.css)
      toast.success("תבנית ברירת מחדל נטעnה")
    } else {
      toast.info("תבנית ברירת מחדל זמינה רק לקבלות כרגע")
    }
  }

  // Handle save
  const handleSave = async () => {
    if (!name || name.trim().length < 3) {
      toast.error("שם התבנית חייב להכיל לפחות 3 תווים")
      return
    }

    if (!htmlTemplate || htmlTemplate.trim().length < 50) {
      toast.error("תבנית HTML חייבת להכיל לפחות 50 תווים")
      return
    }

    setIsSaving(true)
    try {
      const payload: CreateTemplatePayload = {
        name,
        description,
        documentType,
        htmlTemplate,
        css,
        isDefault,
        isActive,
      }

      const result = await createTemplateAction(payload)
      if (result.ok) {
        toast.success("התבנית נוצרה בהצלחה")
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
    <div className="container mx-auto py-8 px-4 space-y-6">
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
          <h1 className="text-3xl font-bold">תבנית חדשה</h1>
          <p className="text-muted-foreground mt-1">צור תבנית מותאמת אישית למסמכים</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDefaultTemplate}>
            <Sparkles className="h-4 w-4 ml-2" />
            טען תבנית ברירת מחדל
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 ml-2" />
            {isSaving ? "שומר..." : "שמור תבנית"}
          </Button>
        </div>
      </div>

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
                  placeholder="תבנית קבלה מותאמת אישית"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">תיאור</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="תבנית עם עיצוב מינימליסטי וברנדינג של החברה"
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="documentType">סוג מסמך *</Label>
                <Select
                  value={documentType}
                  onValueChange={(value) => setDocumentType(value as any)}
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
                <div className="space-y-0.5">
                  <Label htmlFor="isDefault">הגדר כברירת מחדל</Label>
                  <p className="text-sm text-muted-foreground">
                    תבנית זו תשמש לכל המסמכים מסוג זה
                  </p>
                </div>
                <Switch
                  id="isDefault"
                  checked={isDefault}
                  onCheckedChange={setIsDefault}
                />
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="isActive">תבנית פעילה</Label>
                  <p className="text-sm text-muted-foreground">
                    רק תבניות פעילות יוצגו ברשימה
                  </p>
                </div>
                <Switch
                  id="isActive"
                  checked={isActive}
                  onCheckedChange={setIsActive}
                />
              </div>
            </CardContent>
          </Card>

          {/* Code Editor */}
          <Card>
            <CardHeader>
              <CardTitle>עורך תבנית</CardTitle>
              <CardDescription>
                השתמש ב-Handlebars placeholders להזרמת נתונים דינמיים
              </CardDescription>
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
                    placeholder="<div class='receipt'>
  <h1>{{company.name}}</h1>
  <p>קבלה מס' {{document.number}}</p>
  <p>סכום: {{formatCurrency totals.total_amount document.currency}}</p>
</div>"
                    rows={25}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </TabsContent>
                <TabsContent value="css" className="space-y-4">
                  <Textarea
                    value={css}
                    onChange={(e) => setCss(e.target.value)}
                    placeholder=".receipt {
  font-family: 'Heebo', sans-serif;
  direction: rtl;
  padding: 40px;
}

h1 {
  font-size: 24px;
  font-weight: 700;
  margin-bottom: 20px;
}"
                    rows={25}
                    className="font-mono text-sm"
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
