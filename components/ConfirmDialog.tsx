"use client"

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { CheckCircle2, AlertTriangle } from "lucide-react"

type ConfirmDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void | Promise<void>
  destructive?: boolean
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  message,
  confirmText = "אישור",
  cancelText = "ביטול",
  onConfirm,
  destructive = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm()
    onOpenChange(false)
  }

  const Icon = destructive ? AlertTriangle : CheckCircle2

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent
        className="max-w-[420px] p-[50px] rounded-[20px] bg-modal text-modal-fg"
        style={{
          border: 'none',
          boxShadow: '0 0 13px 0 rgba(0,0,0,0.10)',
          textAlign: 'center',
        }}
        dir="rtl"
      >
        {/* Icon */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 32px auto', height: 80 }}>
          <Icon 
            size={80} 
            className="text-modal-fg"
          />
        </div>
        
        <AlertDialogHeader className="text-center">
          <AlertDialogTitle 
            className="text-[24px] font-bold text-modal-fg"
            style={{ marginBottom: 0 }}
          >
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription 
            className="text-[18px] mb-8 text-modal-fg"
            style={{ textAlign: 'center' }}
          >
            {message}
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', marginBottom: 24 }}>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={handleConfirm}
            style={{
              width: '300px',
            }}
          >
            {confirmText}
          </Button>
        </div>
        
        {/* Close as text button */}
        <div style={{ textAlign: 'center', marginTop: 0 }}>
          <button
            onClick={() => onOpenChange(false)}
            className="text-modal-fg"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 18,
              textDecoration: 'underline',
              cursor: 'pointer',
              margin: '0 auto',
              display: 'block',
              fontWeight: 500,
            }}
          >
            {cancelText}
          </button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  )
}
