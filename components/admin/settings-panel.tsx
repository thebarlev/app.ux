"use client"

import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Loader2, Save, Percent, FileText, Receipt } from "lucide-react"
import type { GlobalSetting } from "@/lib/types/admin"

interface SettingsPanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: GlobalSetting[]
}

export function SettingsPanel({ open, onOpenChange, settings }: SettingsPanelProps) {
  const [isSaving, setIsSaving] = useState(false)
  const [vatRate, setVatRate] = useState(
    settings.find((s) => s.setting_key === "default_vat_rate")?.setting_value || "18",
  )
  const [footerLine1, setFooterLine1] = useState(
    settings.find((s) => s.setting_key === "document_footer_line_1")?.setting_value || "",
  )
  const [footerLine2, setFooterLine2] = useState(
    settings.find((s) => s.setting_key === "document_footer_line_2")?.setting_value || "",
  )
  const [footerLine3, setFooterLine3] = useState(
    settings.find((s) => s.setting_key === "document_footer_line_3")?.setting_value || "",
  )
  const [receiptFooterText, setReceiptFooterText] = useState(
    settings.find((s) => s.setting_key === "receipt_footer_text")?.setting_value || "",
  )

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const supabase = createClient()

      const updates = [
        { setting_key: "default_vat_rate", setting_value: vatRate },
        { setting_key: "document_footer_line_1", setting_value: footerLine1 },
        { setting_key: "document_footer_line_2", setting_value: footerLine2 },
        { setting_key: "document_footer_line_3", setting_value: footerLine3 },
        { setting_key: "receipt_footer_text", setting_value: receiptFooterText },
      ]

      for (const update of updates) {
        await supabase
          .from("global_settings")
          .update({ setting_value: update.setting_value, updated_at: new Date().toISOString() })
          .eq("setting_key", update.setting_key)
      }

      onOpenChange(false)
    } catch (error) {
      console.error("Failed to save settings:", error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="pb-6">
          <SheetTitle className="text-xl">Global Settings</SheetTitle>
          <SheetDescription>Configure system-wide defaults for all companies</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Percent className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold">VAT Configuration</h3>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="vat-rate">Default VAT Rate (%)</Label>
              <Input
                id="vat-rate"
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">This rate applies to all new documents by default</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold">Document Footer</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Configure the footer text that appears on all official documents (PDF & HTML views)
            </p>

            <div className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="footer-1">Footer Line 1</Label>
                <Textarea
                  id="footer-1"
                  placeholder="Company details, legal text..."
                  value={footerLine1}
                  onChange={(e) => setFooterLine1(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="footer-2">Footer Line 2</Label>
                <Textarea
                  id="footer-2"
                  placeholder="Additional information..."
                  value={footerLine2}
                  onChange={(e) => setFooterLine2(e.target.value)}
                  rows={2}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="footer-3">Footer Line 3</Label>
                <Textarea
                  id="footer-3"
                  placeholder="Contact details..."
                  value={footerLine3}
                  onChange={(e) => setFooterLine3(e.target.value)}
                  rows={2}
                />
              </div>
            </div>

            <div className="rounded-lg bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Dynamic fields (auto-filled by system):</p>
              <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                <li>Issue date/time</li>
                <li>Page X of Y</li>
              </ul>
            </div>
          </div>

          <Separator />

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Receipt className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold">טקסט פוטר לקובץ קבלה</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              טקסט זה יופיע בתחתית כל דף יצירת קבלה חדשה. ניתן להשתמש בשדה זה להוראות, פרטים משפטיים, או הנחיות לעובדים.
            </p>

            <div className="grid gap-2">
              <Label htmlFor="receipt-footer">טקסט פוטר</Label>
              <Textarea
                id="receipt-footer"
                placeholder="לדוגמה: ודא שכל השדות מולאו לפני שליחת הקבלה ללקוח..."
                value={receiptFooterText}
                onChange={(e) => setReceiptFooterText(e.target.value)}
                rows={4}
                className="text-right"
                dir="rtl"
              />
              <p className="text-xs text-muted-foreground">
                השאר ריק אם אין צורך בטקסט פוטר
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Settings
              </>
            )}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
