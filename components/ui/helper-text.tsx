import * as React from 'react'
import { cn } from '@/lib/utils'

export interface HelperTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  error?: boolean
}

export function HelperText({ 
  className, 
  error = false,
  ...props 
}: HelperTextProps) {
  return (
    <p
      className={cn(
        'text-xs mt-1',
        error ? 'text-white' : 'text-white/80',
        className
      )}
      {...props}
    />
  )
}
