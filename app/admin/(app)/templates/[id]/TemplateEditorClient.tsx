"use client"

import { useState } from "react"
import type { TemplateDefinition } from "@/lib/types/template"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import { ArrowRight, Eye, Save } from "lucide-react"
import { useRouter } from "next/navigation"
import { updateTemplateAction, type UpdateTemplatePayload } from "../actions"
import { toast } from "sonner"
import ThumbnailUpload from "@/components/admin/ThumbnailUpload"

type Props = {
  template: TemplateDefinition
}

type TemplateLang = "he" | "en"

export default function TemplateEditorClient({ template }: Props) {
  const router = useRouter()
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description || "")
  const [documentType, setDocumentType] = useState(template.document_type)
  const [activeLang, setActiveLang] = useState<TemplateLang>("he")

  const [htmlHe, setHtmlHe] = useState(template.html_he || template.html_template || "")
  const [cssHe, setCssHe] = useState(template.css_he || template.css || "")
  const [htmlEn, setHtmlEn] = useState(template.html_en || "")
  const [cssEn, setCssEn] = useState(template.css_en || "")
  const [isDefault, setIsDefault] = useState(template.is_default)
  const [isActive, setIsActive] = useState(template.is_active)
  const [isSaving, setIsSaving] = useState(false)
  const [useFullHtmlByLang, setUseFullHtmlByLang] = useState<Record<TemplateLang, boolean>>({
    he: false,
    en: false,
  })

  const isGlobal = template.company_id === null

  // Extract CSS from <style> tags in HTML
  const extractCssFromHtml = (html: string): { cleanHtml: string; extractedCss: string } => {
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
    const matches = html.matchAll(styleRegex)
    
    let extractedCss = ""
    let cleanHtml = html
    
    for (const match of matches) {
      extractedCss += match[1].trim() + "\n\n"
    }
    
    cleanHtml = cleanHtml.replace(styleRegex, "").trim()
    
    return {
      cleanHtml,
      extractedCss: extractedCss.trim()
    }
  }

  const getLangMeta = (lang: TemplateLang) =>
    lang === "en" ? { dir: "ltr" as const, lang: "en" as const } : { dir: "rtl" as const, lang: "he" as const }

  const getEditorValues = (lang: TemplateLang) => (lang === "en" ? { html: htmlEn, css: cssEn } : { html: htmlHe, css: cssHe })
  const setEditorValues = (lang: TemplateLang, next: { html?: string; css?: string }) => {
    if (lang === "en") {
      if (typeof next.html === "string") setHtmlEn(next.html)
      if (typeof next.css === "string") setCssEn(next.css)
      return
    }
    if (typeof next.html === "string") setHtmlHe(next.html)
    if (typeof next.css === "string") setCssHe(next.css)
  }

  // Handle full HTML mode toggle (per language)
  const handleFullHtmlToggle = (lang: TemplateLang, checked: boolean) => {
    setUseFullHtmlByLang((prev) => ({ ...prev, [lang]: checked }))

    const { html, css } = getEditorValues(lang)
    const meta = getLangMeta(lang)

    if (checked) {
      if (!css) {
        toast.info(`מצב HTML מלא הופעל (${lang.toUpperCase()})`)
        return
      }
      const fullHtml = `<!DOCTYPE html>
<html dir="${meta.dir}" lang="${meta.lang}">
<head>
  <meta charset="UTF-8">
  <style>
${css}
  </style>
</head>
<body>
${html}
</body>
</html>`
      setEditorValues(lang, { html: fullHtml })
      toast.info(`מצב HTML מלא הופעל (${lang.toUpperCase()}) - ה-CSS שולב ב-HTML`)
      return
    }

    const { cleanHtml, extractedCss } = extractCssFromHtml(html)
    if (extractedCss) {
      setEditorValues(lang, { html: cleanHtml, css: extractedCss })
      toast.success(`CSS חולץ מה-HTML בהצלחה (${lang.toUpperCase()})`)
    } else {
      toast.info(`מצב HTML מופרד הופעל (${lang.toUpperCase()})`)
    }
  }


  // Handle save
  const handleSave = async () => {
    setIsSaving(true)
    try {
      const payload: UpdateTemplatePayload = {
        id: template.id,
        name,
        description,
        documentType: documentType as any,
        htmlHe: useFullHtmlByLang.he ? extractCssFromHtml(htmlHe).cleanHtml : htmlHe,
        cssHe: useFullHtmlByLang.he ? (extractCssFromHtml(htmlHe).extractedCss || cssHe) : cssHe,
        htmlEn: useFullHtmlByLang.en ? extractCssFromHtml(htmlEn).cleanHtml : htmlEn,
        cssEn: useFullHtmlByLang.en ? (extractCssFromHtml(htmlEn).extractedCss || cssEn) : cssEn,
        isDefault,
        isActive,
      }

      const result = await updateTemplateAction(payload)
      if (result.ok) {
        toast.success("התבנית נשמרה בהצלחה")
        router.refresh()
      } else {
        toast.error(result.message)
      }
    } finally {
      setIsSaving(false)
    }
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
            onClick={() => window.open(`/admin/templates/${template.id}/preview?lang=${activeLang}`, "_blank")}
          >
            <Eye className="h-4 w-4 ml-2" />
            תצוגה לדוגמה ({activeLang.toUpperCase()})
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            <Save className="h-4 w-4 ml-2" />
            {isSaving ? "שומר..." : "שמור שינויים"}
          </Button>
        </div>
      </div>

      {isGlobal && (
        <Card className="border-blue-500 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-blue-800">תבנית גלובלית</CardTitle>
            <CardDescription className="text-blue-700">
              זוהי תבנית גלובלית זמינה לכל המשתמשים. שינויים יחולו על כל המערכת.
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="space-y-6">
        {/* Template Settings - Flat UI Row */}
        <Card>
          <CardHeader>
            <CardTitle>הגדרות תבנית</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 4-Column Grid Layout */}
            <div className="grid gap-4 mb-6" style={{ gridTemplateColumns: '1fr 1fr 1fr 300px', maxHeight: '300px' }}>
              {/* Column 1: Template Name */}
              <div className="space-y-2">
                <Label htmlFor="name" className="text-sm font-medium">שם התבנית *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="תבנית קבלה סטנדרטית"
                  className="h-10"
                />
                <div className="mt-4 space-y-2">
                  <Label htmlFor="documentType" className="text-sm font-medium">סוג מסמך</Label>
                  <Select
                    value={documentType}
                    onValueChange={(value) => setDocumentType(value as any)}
                  >
                    <SelectTrigger className="h-10">
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
              </div>

              {/* Column 2: Description */}
              <div className="space-y-2">
                <Label htmlFor="description" className="text-sm font-medium">תיאור</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="תבנית עם פרטי חברה, לקוח, ותשלומים"
                  rows={8}
                  className="resize-none"
                />
              </div>

              {/* Column 3: Status Toggles */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">סטטוס</Label>
                  <div className="flex flex-col gap-4 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isActive" className="text-sm cursor-pointer">תבנית פעילה</Label>
                      <Switch
                        id="isActive"
                        checked={isActive}
                        onCheckedChange={setIsActive}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label htmlFor="isDefault" className="text-sm cursor-pointer">ברירת מחדל</Label>
                      <Switch
                        id="isDefault"
                        checked={isDefault}
                        onCheckedChange={setIsDefault}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Column 4: Thumbnail Preview */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">תמונת תצוגה</Label>
                <div className="rounded-lg border bg-muted/30 p-3" style={{ maxHeight: '280px' }}>
                  <ThumbnailUpload
                    templateId={template.id}
                    currentThumbnailUrl={template.thumbnail_url}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Code Editors - Side by Side */}
        <Card>
          <CardHeader>
            <CardTitle>עורך תבנית לפי שפה</CardTitle>
            <CardDescription>
              עברית (RTL) משמשת כמסמך מקור. אנגלית (LTR) משמשת להעתקים/תרגומים בלבד.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={activeLang} onValueChange={(v) => setActiveLang(v as TemplateLang)}>
              <TabsList>
                <TabsTrigger value="he">עברית</TabsTrigger>
                <TabsTrigger value="en">English</TabsTrigger>
              </TabsList>

              <TabsContent value="he" className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    מומלץ: `&lt;html lang=&quot;he&quot; dir=&quot;rtl&quot;&gt;`
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fullHtmlHe" className="text-sm">HTML מלא</Label>
                    <Switch
                      id="fullHtmlHe"
                      checked={useFullHtmlByLang.he}
                      onCheckedChange={(checked) => handleFullHtmlToggle("he", !!checked)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-0 w-full min-h-[600px]">
                  <div className="border-l min-w-0">
                    <div className="bg-muted px-4 py-2 border-b">
                      <Label className="text-sm font-semibold">HTML (HE)</Label>
                    </div>
                    <Textarea
                      value={htmlHe}
                      onChange={(e) => setHtmlHe(e.target.value)}
                      placeholder="<div>{{company_name}}</div>"
                      className="font-mono text-sm h-[calc(100%-41px)] resize-none border-0 rounded-none"
                      dir="ltr"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="bg-muted px-4 py-2 border-b">
                      <Label className="text-sm font-semibold">CSS (HE)</Label>
                    </div>
                    <Textarea
                      value={cssHe}
                      onChange={(e) => setCssHe(e.target.value)}
                      placeholder=".header { font-size: 24px; }"
                      className="font-mono text-sm h-[calc(100%-41px)] resize-none border-0 rounded-none"
                      dir="ltr"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="en" className="mt-6 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    Recommended: `&lt;html lang=&quot;en&quot; dir=&quot;ltr&quot;&gt;`
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fullHtmlEn" className="text-sm">Full HTML</Label>
                    <Switch
                      id="fullHtmlEn"
                      checked={useFullHtmlByLang.en}
                      onCheckedChange={(checked) => handleFullHtmlToggle("en", !!checked)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-0 w-full min-h-[600px]">
                  <div className="border-l min-w-0">
                    <div className="bg-muted px-4 py-2 border-b">
                      <Label className="text-sm font-semibold">HTML (EN)</Label>
                    </div>
                    <Textarea
                      value={htmlEn}
                      onChange={(e) => setHtmlEn(e.target.value)}
                      placeholder="<div>{{company_name}}</div>"
                      className="font-mono text-sm text-left h-[calc(100%-41px)] resize-none border-0 rounded-none"
                      dir="ltr"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="bg-muted px-4 py-2 border-b">
                      <Label className="text-sm font-semibold">CSS (EN)</Label>
                    </div>
                    <Textarea
                      value={cssEn}
                      onChange={(e) => setCssEn(e.target.value)}
                      placeholder=".header { font-size: 24px; }"
                      className="font-mono text-sm text-left h-[calc(100%-41px)] resize-none border-0 rounded-none"
                      dir="ltr"
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
