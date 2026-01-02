"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { uploadTemplateThumbnailAction, deleteTemplateThumbnailAction } from "@/app/admin/templates/actions"
import { cn } from "@/lib/utils"

type Props = {
  templateId?: string // undefined for new templates (will upload after creation)
  currentThumbnailUrl?: string | null
  onThumbnailChange?: (url: string | null) => void
  onFileSelect?: (file: File | null) => void // NEW: callback for file selection
  disabled?: boolean
}

export default function ThumbnailUpload({ 
  templateId, 
  currentThumbnailUrl, 
  onThumbnailChange,
  onFileSelect, // NEW
  disabled = false 
}: Props) {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentThumbnailUrl || null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
    if (!validTypes.includes(file.type)) {
      toast.error("פורמט קובץ לא נתמך. השתמש ב-PNG, JPG או WebP")
      return
    }

    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024
    if (file.size > maxSize) {
      toast.error("גודל הקובץ חורג מ-2MB")
      return
    }

    // Create local preview
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      setPreviewUrl(url)
      
      // Validate aspect ratio (A4 = 1:1.414, allow some tolerance)
      const img = new Image()
      img.onload = () => {
        const aspectRatio = img.width / img.height
        const a4Ratio = 1 / 1.414
        const tolerance = 0.15 // 15% tolerance
        
        if (Math.abs(aspectRatio - a4Ratio) > tolerance) {
          toast.warning(
            `התמונה לא בפרופורציות A4 (יחס מומלץ: 1:1.4). התמונה תעובד בכל מקרה.`,
            { duration: 5000 }
          )
        }
      }
      img.src = url
    }
    reader.readAsDataURL(file)

    setSelectedFile(file)
    onFileSelect?.(file) // NEW: Notify parent about file selection

    // If template already exists, upload immediately
    if (templateId) {
      setIsUploading(true)
      const result = await uploadTemplateThumbnailAction(templateId, file)
      setIsUploading(false)

      if (result.ok) {
        toast.success("תמונת תצוגה מקדימה הועלתה בהצלחה")
        setPreviewUrl(result.url)
        onThumbnailChange?.(result.url)
      } else {
        toast.error(result.message)
        setPreviewUrl(currentThumbnailUrl || null)
        setSelectedFile(null)
      }
    } else {
      // For new templates, store file temporarily
      // Will be uploaded after template creation
      onThumbnailChange?.(URL.createObjectURL(file))
    }
  }

  const handleRemove = async () => {
    if (templateId && currentThumbnailUrl) {
      const result = await deleteTemplateThumbnailAction(templateId)
      if (result.ok) {
        toast.success("תמונה נמחקה")
      } else {
        toast.error(result.message || "שגיאה במחיקת תמונה")
      }
    }

    setPreviewUrl(null)
    setSelectedFile(null)
    onThumbnailChange?.(null)
    onFileSelect?.(null) // NEW: Notify parent about removal
    
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>תמונת תצוגה מקדימה (Thumbnail)</Label>
        <div className="text-xs text-muted-foreground">
          פרופורציות A4 מומלצות • עד 2MB
        </div>
      </div>
      
      <p className="text-sm text-muted-foreground">
        תמונה קטנה שתוצג בבחירת התבניות. מומלץ פרופורציות של דף A4 (210×297 או יחס 1:1.4)
      </p>

      {previewUrl ? (
        <Card className="relative overflow-hidden">
          {/* Thumbnail Preview - Constrained Box */}
          <div 
            className="relative w-full flex items-center justify-center bg-gray-50 overflow-hidden" 
            style={{ 
              height: '260px',
              maxHeight: '260px',
              minHeight: '260px'
            }}
          >
            <img
              src={previewUrl}
              alt="Template thumbnail preview"
              className="object-contain"
              style={{ 
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto'
              }}
            />
            
            {/* Uploading Overlay */}
            {isUploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="text-center text-white">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm font-medium">מעלה תמונה...</p>
                </div>
              </div>
            )}
            
            {/* Remove Button */}
            {!isUploading && (
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 left-2 h-8 w-8 shadow-lg"
                onClick={handleRemove}
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            )}

            {/* A4 Badge */}
            <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              A4 Preview
            </div>
          </div>
        </Card>
      ) : (
        <div
          className={cn(
            "relative w-full border-2 border-dashed rounded-lg overflow-hidden transition-colors",
            disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer hover:border-primary hover:bg-accent/50"
          )}
          style={{ height: '260px', minHeight: '260px', maxHeight: '260px' }}
          onClick={() => !disabled && fileInputRef.current?.click()}
        >
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center overflow-y-auto">
            <ImageIcon className="h-10 w-10 text-muted-foreground mb-2 flex-shrink-0" />
            <p className="text-sm font-medium text-foreground mb-1">
              לחץ להעלאת תמונת תצוגה מקדימה
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              PNG, JPG, WebP עד 2MB
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
              <AlertCircle className="h-3 w-3 flex-shrink-0" />
              <span className="text-[11px]">יחס 1:1.4 (A4)</span>
            </div>
            <Button 
              variant="secondary" 
              size="sm" 
              className="mt-2 flex-shrink-0"
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation()
                fileInputRef.current?.click()
              }}
            >
              <Upload className="h-4 w-4 ml-2" />
              בחר קובץ
            </Button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg,image/webp"
        className="hidden"
        onChange={handleFileSelect}
        disabled={disabled || isUploading}
      />

      {/* Helper Text */}
      <div className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-medium">טיפים לתמונה מוצלחת:</p>
          <ul className="list-disc list-inside space-y-0.5 mr-2">
            <li>השתמש בצילום מסך של התבנית (עדיף מלמעלה)</li>
            <li>ודא שהטקסט קריא גם בגודל קטן</li>
            <li>רזולוציה מומלצת: 400×566 פיקסלים (A4 scaled)</li>
            <li>התמונה תוצג בקלפים בעמוד בחירת התבניות</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
