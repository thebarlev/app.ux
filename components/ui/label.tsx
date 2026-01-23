'use client'

import * as React from 'react'
import * as LabelPrimitive from '@radix-ui/react-label'

import { cn } from '@/lib/utils'

function Label({
  className,
  style,
  ...props
}: React.ComponentProps<typeof LabelPrimitive.Root>) {
  const isSelectLabel = className?.includes('ui-select-label')
  const isMoneyLabel = className?.includes('ui-money-label')
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'block leading-none font-normal select-none text-right group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )}
      style={{
        marginBottom: isSelectLabel
          ? undefined
          : isMoneyLabel
          ? 'var(--field-money-label-gap)'
          : 'var(--field-label-margin-bottom)',
        marginTop: isMoneyLabel ? 'var(--field-money-label-offset-y)' : undefined,
        color: '#19183B',
        fontSize: 'var(--field-label-size)',
        ...style,
      }}
      {...props}
    />
  )
}

export { Label }
