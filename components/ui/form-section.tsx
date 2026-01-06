import * as React from 'react'
import { cn } from '@/lib/utils'

interface FormSectionProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string
  description?: string
  children: React.ReactNode
}

/**
 * FormSection Component
 * 
 * A section container for forms with:
 * - Background: #1A8299
 * - Border radius: 20px
 * - Padding: 50px right, 30px left, 30px top (RTL)
 * - Title aligned to right with consistent spacing
 * 
 * Usage:
 * <FormSection title="פרטי לקוח" description="מידע בסיסי">
 *   <div className="ui-form-grid">
 *     form fields here
 *   </div>
 * </FormSection>
 */
export function FormSection({
  title,
  description,
  children,
  className,
  ...props
}: FormSectionProps) {
  return (
    <div
      className={cn(className)}
      style={{
        /* Background and border radius */
        backgroundColor: '#1A8299',
        borderRadius: '20px',
        /* 50px padding מכל הצדדים למעט top/bottom שזה 30px */
        paddingTop: '30px',
        paddingRight: '50px',
        paddingBottom: '30px',
        paddingLeft: '50px',
      }}
      {...props}
    >
      {/* Title - aligned to right, 30px from top, 50px from right edge */}
      <h2 
        className="text-right text-2xl font-semibold text-white"
        style={{ marginBottom: '30px' }}
      >
        {title}
      </h2>
      {description && (
        <p className="text-sm text-white/80 text-right mb-[30px]">{description}</p>
      )}
      
      {/* Content - grid with fields */}
      {children}
    </div>
  )
}
