import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, style, ...props }: React.ComponentProps<'textarea'>) {
  const id = props.id as string | undefined;

  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'w-full min-h-[100px] rounded-[5px] px-[15px] py-3 text-[18px] text-[#19183B] placeholder:text-[#97B2BD] outline-none focus:ring-2 focus:ring-[#708993] focus:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-colors resize-y text-right',
        className,
      )}
      style={{
        border: "1px solid transparent",
        backgroundColor: "#EDF1F5",
        ...style,
      }}
      {...props}
    />
  )
}

export { Textarea }
