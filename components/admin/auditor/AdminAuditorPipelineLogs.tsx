"use client"

import { useRef, useEffect } from "react"

export interface LogEntry {
  ts: string
  level: string
  message: string
  data?: Record<string, unknown>
}

const LEVEL_COLORS: Record<string, string> = {
  debug: "text-slate-400",
  info: "text-emerald-400",
  warn: "text-amber-400",
  error: "text-red-400",
}

export function AdminAuditorPipelineLogs({ logs }: { logs: LogEntry[] }) {
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [logs])

  if (logs.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 text-center text-slate-500 text-sm">
        No logs available for this scan.
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 overflow-hidden shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Pipeline Logs</span>
        <span className="text-xs text-slate-500">{logs.length} entries</span>
      </div>
      <div className="h-[480px] overflow-y-auto p-4 font-mono text-xs space-y-0.5 scroll-smooth">
        {logs.map((log, i) => (
          <div key={i} className="flex items-start gap-3 leading-5">
            <span className="shrink-0 text-slate-600 tabular-nums">
              {new Date(log.ts).toLocaleTimeString("en-GB", { hour12: false })}
            </span>
            <span className={`shrink-0 w-10 uppercase font-bold ${LEVEL_COLORS[log.level] ?? "text-slate-400"}`}>
              {log.level}
            </span>
            <span className="text-slate-200 break-all">{log.message}</span>
            {log.data && Object.keys(log.data).length > 0 && (
              <details className="ml-2">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-300">data</summary>
                <pre className="mt-1 text-slate-400 text-xs">{JSON.stringify(log.data, null, 2)}</pre>
              </details>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
