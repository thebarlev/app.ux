import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full min-h-[100px] rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[14px] text-white placeholder:text-white/40 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-y',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
