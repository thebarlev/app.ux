import { getStatusBadgeForDoc, type UIStatus } from "@/lib/documents/status"

/**
 * The status pill used by the document lists and the dashboard.
 *
 * Deliberately not a client component: it renders no interactivity, so the
 * dashboard's server-rendered table can use the very same element the
 * ניהול שוטף list uses.
 */
export default function DocumentStatusBadge({
  documentType,
  status,
  title = "חיווי UI בלבד",
}: {
  documentType: string
  status: UIStatus
  title?: string
}) {
  const badge = getStatusBadgeForDoc(documentType, status)

  return (
    <span
      className="ui-badge"
      style={{
        display: "inline-block",
        padding: "2px 6px",
        borderRadius: "999px",
        fontSize: "13px",
        fontWeight: 400,
        ...badge.style,
      }}
      title={title}
    >
      {badge.label}
    </span>
  )
}
