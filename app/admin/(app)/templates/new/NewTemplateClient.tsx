"use client"

import { useState } from "react"
import { TEMPLATE_PLACEHOLDERS } from "@/lib/types/template"
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS } from "@/config/documentVariables"
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
import { createTemplateAction, type CreateTemplatePayload, uploadTemplateThumbnailAction } from "../actions"
import { toast } from "sonner"
import ThumbnailUpload from "@/components/admin/ThumbnailUpload"

export default function NewTemplateClient() {
  const router = useRouter()
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [selectedDocumentTypes, setSelectedDocumentTypes] = useState<string[]>([DOCUMENT_TYPES.RECEIPT])
  const [htmlTemplate, setHtmlTemplate] = useState("")
  const [css, setCss] = useState("")
  const [isDefault, setIsDefault] = useState(false)
  const [isActive, setIsActive] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null)
  const [useFullHtml, setUseFullHtml] = useState(false)

  // Extract CSS from <style> tags in HTML
  const extractCssFromHtml = (html: string): { cleanHtml: string; extractedCss: string } => {
    // Match all <style> tags (including multiline content)
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
    const matches = html.matchAll(styleRegex)
    
    let extractedCss = ""
    let cleanHtml = html
    
    // Extract all CSS from style tags
    for (const match of matches) {
      extractedCss += match[1].trim() + "\n\n"
    }
    
    // Remove style tags from HTML
    cleanHtml = cleanHtml.replace(styleRegex, "").trim()
    
    return {
      cleanHtml,
      extractedCss: extractedCss.trim()
    }
  }

  // Handle full HTML mode toggle
  const handleFullHtmlToggle = (checked: boolean) => {
    setUseFullHtml(checked)
    
    if (checked) {
      // Switching to full HTML mode - combine HTML + CSS
      if (css) {
        const fullHtml = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
  <meta charset="UTF-8">
  <style>
${css}
  </style>
</head>
<body>
${htmlTemplate}
</body>
</html>`
        setHtmlTemplate(fullHtml)
        toast.info("מצב HTML מלא הופעל - ה-CSS שולב ב-HTML")
      }
    } else {
      // Switching to separate mode - extract CSS from HTML
      const { cleanHtml, extractedCss } = extractCssFromHtml(htmlTemplate)
      
      if (extractedCss) {
        setHtmlTemplate(cleanHtml)
        setCss(extractedCss)
        toast.success("CSS חולץ מה-HTML בהצלחה")
      } else {
        toast.info("מצב HTML מופרד הופעל")
      }
    }
  }


  // Load default template
  const loadDefaultTemplate = () => {
    if (selectedDocumentTypes.includes(DOCUMENT_TYPES.RECEIPT)) {
      const defaultTemplate = getDefaultReceiptTemplate()
      setHtmlTemplate(defaultTemplate.html)
      setCss(defaultTemplate.css)
      toast.success("תבנית ברירת מחדל נטענה")
    } else {
      toast.info("תבנית ברירת מחדל זמינה רק לקבלות כרגע")
    }
  }

  // Toggle document type selection
  const toggleDocumentType = (type: string) => {
    setSelectedDocumentTypes(prev => {
      if (prev.includes(type)) {
        // Don't allow removing if it's the last one
        if (prev.length === 1) {
          toast.error("חייב לבחור לפחות סוג מסמך אחד")
          return prev
        }
        return prev.filter(t => t !== type)
      } else {
        return [...prev, type]
      }
    })
  }

  // Handle save
  const handleSave = async () => {
    console.log("🔵 handleSave called", { name, htmlTemplate: htmlTemplate.length, selectedDocumentTypes, useFullHtml })
    
    if (!name || name.trim().length < 3) {
      toast.error("שם התבנית חייב להכיל לפחות 3 תווים")
      return
    }

    if (!htmlTemplate || htmlTemplate.trim().length < 50) {
      toast.error("תבנית HTML חייבת להכיל לפחות 50 תווים")
      return
    }

    console.log("🟢 Validation passed, saving...")
    setIsSaving(true)
    try {
      let finalHtml = htmlTemplate
      let finalCss = css
      
      // If using full HTML mode, extract CSS before saving
      if (useFullHtml) {
        const { cleanHtml, extractedCss } = extractCssFromHtml(htmlTemplate)
        finalHtml = cleanHtml
        finalCss = extractedCss || css // Use extracted CSS or fallback to existing
        console.log("📤 Extracted CSS from full HTML:", { htmlLength: cleanHtml.length, cssLength: extractedCss.length })
      }
      
      const payload: CreateTemplatePayload = {
        name,
        description,
        documentType: selectedDocumentTypes[0] as any, // Use first type for backward compatibility
        htmlTemplate: finalHtml,
        css: finalCss,
        isDefault,
        isActive,
        thumbnailUrl, // Include thumbnail URL in creation
      }

      console.log("📦 Payload:", payload)
      const result = await createTemplateAction(payload)
      console.log("📥 Result:", result)

      if (result.ok) {
        toast.success("התבנית נשמרה בהצלחה")
        
        // Upload thumbnail if file was selected
        if (result.templateId && thumbnailFile) {
          const uploadResult = await uploadTemplateThumbnailAction(result.templateId, thumbnailFile)
          if (!uploadResult.ok) {
            toast.warning("התבנית נשמרה אך העלאת התמונה נכשלה")
          }
        }
        
        // Save additional document types to junction table
        // This will be handled by a new action
        if (selectedDocumentTypes.length > 1) {
          // TODO: Call action to save to template_document_types table
        }
        
        // Refresh to update the templates list
        router.refresh()
        
        // Navigate to templates list instead of edit page
        router.push("/admin/templates")
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      toast.error("שגיאה בשמירת התבנית")
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
          <Button 
            variant="outline" 
            onClick={(e) => {
              console.log("🔵 Load default clicked")
              loadDefaultTemplate()
            }}
          >
            <Sparkles className="h-4 w-4 ml-2" />
            טען תבנית ברירת מחדל
          </Button>
          <Button 
            onClick={(e) => {
              console.log("🖱️ Save button clicked!", { isSaving, name, htmlLength: htmlTemplate.length })
              handleSave()
            }} 
            disabled={isSaving}
          >
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

              {/* Multi-Document Type Selection */}
              <div className="space-y-3">
                <Label>סוגי מסמכים *</Label>
                <p className="text-sm text-muted-foreground">
                  בחר סוג מסמך אחד או יותר שהתבנית תתמוך בהם
                </p>
                
                {/* Select All Checkbox */}
                <div className="p-3 bg-muted/50 rounded-lg border border-border">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDocumentTypes.length === Object.keys(DOCUMENT_TYPES).length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          // Select all
                          setSelectedDocumentTypes(Object.values(DOCUMENT_TYPES))
                        } else {
                          // Deselect all (but keep at least one)
                          setSelectedDocumentTypes([DOCUMENT_TYPES.RECEIPT])
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                    <span className="font-medium text-sm">בחר הכל</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([type, label]) => (
                    <div
                      key={type}
                      className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${
                        selectedDocumentTypes.includes(type)
                          ? "bg-primary/5 border-primary"
                          : "hover:bg-muted/50"
                      }`}
                      onClick={() => toggleDocumentType(type)}
                    >
                      <div
                        className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          selectedDocumentTypes.includes(type)
                            ? "bg-primary border-primary"
                            : "border-muted-foreground/30"
                        }`}
                      >
                        {selectedDocumentTypes.includes(type) && (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="w-3 h-3 text-primary-foreground"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="text-sm font-medium">{label}</span>
                    </div>
                  ))}
                </div>
                {selectedDocumentTypes.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedDocumentTypes.map(type => (
                      <Badge key={type} variant="secondary">
                        {DOCUMENT_TYPE_LABELS[type as keyof typeof DOCUMENT_TYPE_LABELS]}
                      </Badge>
                    ))}
                  </div>
                )}
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

              {/* Thumbnail Upload */}
              <div className="pt-4 border-t">
                <ThumbnailUpload
                  onThumbnailChange={setThumbnailUrl}
                  onFileSelect={setThumbnailFile}
                  disabled={isSaving}
                />
              </div>
            </CardContent>
          </Card>

          {/* Code Editor */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>עורך תבנית</CardTitle>
                  <CardDescription>
                    השתמש ב-Handlebars placeholders להזרמת נתונים דינמיים
                  </CardDescription>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="fullHtml" className="text-sm cursor-pointer">
                      HTML מלא (כולל CSS)
                    </Label>
                    <Switch
                      id="fullHtml"
                      checked={useFullHtml}
                      onCheckedChange={handleFullHtmlToggle}
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {useFullHtml ? (
                // Full HTML mode - single textarea
                <div className="space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm text-muted-foreground">
                      HTML מלא (כולל &lt;style&gt; tags)
                    </Label>
                    <Badge variant="secondary" className="text-xs">
                      CSS יחולץ אוטומטית בשמירה
                    </Badge>
                  </div>
                  <Textarea
                    value={htmlTemplate}
                    onChange={(e) => setHtmlTemplate(e.target.value)}
                    placeholder="<!DOCTYPE html>
<html dir='rtl'>
<head>
  <meta charset='UTF-8'>
  <style>
    body { font-family: Arial; direction: rtl; }
    .total { font-size: 32px; font-weight: bold; }
  </style>
</head>
<body>
  <h1>{{companyName}}</h1>
  <div class='total'>{{formattedTotal}}</div>
</body>
</html>"
                    rows={30}
                    className="font-mono text-sm"
                    dir="ltr"
                  />
                </div>
              ) : (
                // Separate HTML/CSS mode - tabs
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
              )}
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
