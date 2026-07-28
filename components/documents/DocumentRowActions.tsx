"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { Eye, Download, X, XCircle } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"

/**
 * The per-row action icons shared by the document lists and the dashboard's
 * "מסמכים אחרונים" table, so both render the same icons at the same size with
 * the same spacing instead of one showing icons and the other text links.
 *
 * Each action takes either an href or a handler: the documents list drives them
 * from client state (download helper, cancel dialog), while the dashboard is
 * server-rendered and can only hand over links. Actions with neither are simply
 * not rendered, which is how the dashboard omits cancel and close.
 *
 * The chain action is passed in as a slot rather than built here, because both
 * callers already wrap it in ChainNewDocumentDialog with their own picker
 * handler.
 */
export type DocumentRowActionsProps = {
  viewHref?: string | null
  onView?: () => void
  downloadHref?: string | null
  onDownload?: () => void
  /** Rendered between download and cancel; already includes its own trigger. */
  chainSlot?: ReactNode
  onCancel?: () => void
  onClose?: () => void
  className?: string
}

function IconButton({
  label,
  href,
  onClick,
  children,
}: {
  label: string
  href?: string | null
  onClick?: () => void
  children: ReactNode
}) {
  // Button renders a <button> and has no asChild, so the link case borrows its
  // classes instead — same ghost icon styling, correct anchor semantics.
  if (href) {
    return (
      <Link href={href} aria-label={label} className={buttonVariants({ variant: "ghost", size: "icon" })}>
        {children}
      </Link>
    )
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label={label} onClick={onClick}>
      {children}
    </Button>
  )
}

export default function DocumentRowActions({
  viewHref,
  onView,
  downloadHref,
  onDownload,
  chainSlot,
  onCancel,
  onClose,
  className,
}: DocumentRowActionsProps) {
  return (
    <div className={className}>
      {(viewHref || onView) && (
        <IconButton label="צפייה" href={viewHref} onClick={onView}>
          <Eye className="h-5 w-5" />
        </IconButton>
      )}

      {(downloadHref || onDownload) && (
        <IconButton label="הורדה" href={downloadHref} onClick={onDownload}>
          <Download className="h-5 w-5" />
        </IconButton>
      )}

      {chainSlot}

      {onCancel && (
        <Button type="button" variant="ghost" size="icon" aria-label="ביטול מסמך" onClick={onCancel}>
          <X className="h-5 w-5" />
        </Button>
      )}

      {onClose && (
        <Button type="button" variant="ghost" size="icon" aria-label="סגירת מסמך" onClick={onClose}>
          <XCircle className="h-5 w-5" />
        </Button>
      )}
    </div>
  )
}
