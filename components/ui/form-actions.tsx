import * as React from 'react'
import { Button } from './button'
import { cn } from '@/lib/utils'

interface FormActionsProps extends React.HTMLAttributes<HTMLDivElement> {
  primaryLabel: string
  secondaryLabel?: string
  onPrimaryClick?: () => void
  onSecondaryClick?: () => void
  primaryLoading?: boolean
  secondaryLoading?: boolean
  primaryDisabled?: boolean
  secondaryDisabled?: boolean
  primaryIcon?: React.ReactNode
  secondaryIcon?: React.ReactNode
  primaryType?: "button" | "submit" | "reset"
}

/**
 * FormActions Component
 * 
 * Action buttons area for forms:
 * - Buttons aligned to left (RTL)
 * - Primary button on top
 * - Secondary button below (stacked)
 * - Both buttons 50px height
 * - 5px border radius
 * 
 * Usage:
 * <FormActions
 *   primaryLabel="שמירה"
 *   secondaryLabel="ביטול"
 *   onPrimaryClick={handleSave}
 *   onSecondaryClick={handleCancel}
 * />
 */
export function FormActions({
  primaryLabel,
  secondaryLabel,
  onPrimaryClick,
  onSecondaryClick,
  primaryLoading = false,
  secondaryLoading = false,
  primaryDisabled = false,
  secondaryDisabled = false,
  primaryIcon,
  secondaryIcon,
  primaryType = "button",
  className,
  ...props
}: FormActionsProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-3',
        className
      )}
      style={{
        marginTop: '40px',
      }}
      {...props}
    >
      <Button
        type={primaryType}
        onClick={onPrimaryClick}
        disabled={primaryDisabled}
        loading={primaryLoading}
        className=""
        style={{ fontSize: '18px', height: '50px', width: '300px' }}
      >
        {primaryIcon && <span className="ml-2">{primaryIcon}</span>}
        {primaryLabel}
      </Button>
      
      {secondaryLabel && (
        <Button
          type="button"
          variant="secondary"
          onClick={onSecondaryClick}
          disabled={secondaryDisabled}
          loading={secondaryLoading}
          className=""
          style={{ borderColor: '#1A8299', color: '#1A8299', height: '50px', fontSize: '18px', width: '300px' }}
        >
          {secondaryIcon && <span className="ml-2">{secondaryIcon}</span>}
          {secondaryLabel}
        </Button>
      )}
    </div>
  )
}
