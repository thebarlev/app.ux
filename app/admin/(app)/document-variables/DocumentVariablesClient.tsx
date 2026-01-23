"use client"

import { useState } from "react"
import {
  SELECT_CATEGORIES,
  TEMPLATE_PLACEHOLDERS,
  exportCategoryValues,
  getAllPlaceholders,
  type SelectCategory,
} from "@/config/documentVariables"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { Copy, Check, Search, FileCode } from "lucide-react"
import { toast } from "sonner"

export default function DocumentVariablesClient() {
  const [searchQuery, setSearchQuery] = useState("")
  const [copiedCategory, setCopiedCategory] = useState<string | null>(null)
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null)

  // Group categories by group
  const groupedCategories = SELECT_CATEGORIES.reduce((acc, category) => {
    const group = category.group || "אחר"
    if (!acc[group]) acc[group] = []
    acc[group].push(category)
    return acc
  }, {} as Record<string, SelectCategory[]>)

  // Filter categories by search
  const filteredCategories = SELECT_CATEGORIES.filter(
    cat =>
      cat.label.includes(searchQuery) ||
      cat.id.includes(searchQuery) ||
      cat.options.some(opt => opt.label.includes(searchQuery) || opt.value.includes(searchQuery))
  )

  // Copy to clipboard
  const copyToClipboard = async (text: string, id: string, type: "category" | "placeholder") => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === "category") {
        setCopiedCategory(id)
        setTimeout(() => setCopiedCategory(null), 2000)
      } else {
        setCopiedPlaceholder(id)
        setTimeout(() => setCopiedPlaceholder(null), 2000)
      }
      toast.success("הועתק ללוח")
    } catch (err) {
      toast.error("שגיאה בהעתקה")
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">משתני מסמכים וערכי Select</h1>
        <p className="text-muted-foreground mt-2">
          מקור אמת מרכזי לכל הערכים והמשתנים במערכת המסמכים.
          השתמש בערכים אלו בתבניות HTML ובכל המסמכים החדשים.
        </p>
      </div>

      {/* Search */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חיפוש קטגוריה, ערך, או תווית..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="selects" className="w-full">
        <TabsList>
          <TabsTrigger value="selects">ערכי Select</TabsTrigger>
          <TabsTrigger value="placeholders">Placeholders לתבניות</TabsTrigger>
          <TabsTrigger value="grouped">תצוגה מקובצת</TabsTrigger>
        </TabsList>

        {/* Tab 1: All Select Categories */}
        <TabsContent value="selects" className="space-y-6">
          <div className="grid gap-6">
            {filteredCategories.map((category) => (
              <Card key={category.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <CardTitle>{category.label}</CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">
                          {category.id}
                        </Badge>
                        {category.group && (
                          <Badge variant="secondary">{category.group}</Badge>
                        )}
                        {category.dependsOn && (
                          <Badge variant="outline" className="text-xs">
                            תלוי ב-{category.dependsOn}
                          </Badge>
                        )}
                      </div>
                      <CardDescription>
                        {category.options.length} ערכים אפשריים
                      </CardDescription>
                    </div>

                    {/* Copy Buttons */}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            exportCategoryValues(category.id, "csv"),
                            category.id,
                            "category"
                          )
                        }
                      >
                        {copiedCategory === category.id ? (
                          <Check className="h-4 w-4 ml-2" />
                        ) : (
                          <Copy className="h-4 w-4 ml-2" />
                        )}
                        CSV
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          copyToClipboard(
                            exportCategoryValues(category.id, "json"),
                            category.id,
                            "category"
                          )
                        }
                      >
                        {copiedCategory === category.id ? (
                          <Check className="h-4 w-4 ml-2" />
                        ) : (
                          <Copy className="h-4 w-4 ml-2" />
                        )}
                        JSON
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-right w-[200px]">Value (ערך טכני)</TableHead>
                        <TableHead className="text-right">Label (תצוגה)</TableHead>
                        <TableHead className="text-right w-[100px]">פעולות</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {category.options.map((option) => (
                        <TableRow key={option.value}>
                          <TableCell className="font-mono text-sm">{option.value}</TableCell>
                          <TableCell>{option.label}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                copyToClipboard(option.value, option.value, "category")
                              }
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Tab 2: Template Placeholders */}
        <TabsContent value="placeholders" className="space-y-6">
          {Object.entries(TEMPLATE_PLACEHOLDERS).map(([section, placeholders]) => (
            <Card key={section}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="capitalize">{section}</CardTitle>
                    <CardDescription>
                      {Object.keys(placeholders).length} משתנים זמינים
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(
                        JSON.stringify(placeholders, null, 2),
                        section,
                        "placeholder"
                      )
                    }
                  >
                    {copiedPlaceholder === section ? (
                      <Check className="h-4 w-4 ml-2" />
                    ) : (
                      <Copy className="h-4 w-4 ml-2" />
                    )}
                    העתק JSON
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {Object.entries(placeholders).map(([key, value]) => {
                    if (typeof value !== "string") return null
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer"
                        onClick={() => copyToClipboard(value, value, "placeholder")}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-muted-foreground truncate">
                            {key}
                          </div>
                          <code className="text-xs font-mono">{value}</code>
                        </div>
                        <Copy className="h-3 w-3 text-muted-foreground shrink-0 mr-2" />
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          ))}

          {/* Quick Copy All */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-lg">העתקה מהירה - כל המשתנים</CardTitle>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() =>
                  copyToClipboard(
                    getAllPlaceholders().join("\n"),
                    "all",
                    "placeholder"
                  )
                }
              >
                <Copy className="h-4 w-4 ml-2" />
                העתק את כל ה-Placeholders (רשימה)
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab 3: Grouped View */}
        <TabsContent value="grouped" className="space-y-6">
          {Object.entries(groupedCategories).map(([group, categories]) => (
            <Card key={group}>
              <CardHeader>
                <CardTitle>{group}</CardTitle>
                <CardDescription>{categories.length} קטגוריות</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {categories.map((category) => (
                  <div key={category.id} className="border-b pb-4 last:border-0">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <FileCode className="h-4 w-4 text-muted-foreground" />
                        <span className="font-semibold">{category.label}</span>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {category.id}
                        </code>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          copyToClipboard(
                            exportCategoryValues(category.id, "csv"),
                            category.id,
                            "category"
                          )
                        }
                      >
                        {copiedCategory === category.id ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <div className="text-sm text-muted-foreground mr-6">
                      {category.options.map((opt) => opt.value).join(", ")}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            חשוב לדעת
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            • <strong>מקור אמת יחיד:</strong> כל הערכים מוגדרים ב-
            <code className="bg-blue-100 px-1 rounded">config/documentVariables.ts</code>
          </p>
          <p>
            • <strong>אחידות:</strong> כשמוסיפים מסמך חדש, יש להשתמש בערכים האלה בדיוק
          </p>
          <p>
            • <strong>אל תשכפל:</strong> אל תיצור values חדשים למושגים קיימים
          </p>
          <p>
            • <strong>תבניות HTML:</strong> השתמש ב-placeholders מהטאב השני
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
