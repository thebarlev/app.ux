import { Card } from "@/components/ui/card"

interface SectionCardProps {
  title: string
  description?: string
  children: React.ReactNode
  className?: string
  error?: boolean
}

export function SectionCard({ title, description, children, className = "", error = false }: SectionCardProps) {
  return (
    <Card 
      className={`
        p-6 space-y-4 bg-white border-slate-200 shadow-sm
        ${error ? "border-red-300 bg-red-50/30" : ""}
        ${className}
      `}
    >
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {description && (
          <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
        )}
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </Card>
  )
}
