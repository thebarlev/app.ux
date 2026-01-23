"use client"

export default function CopyEnvVarNamesButton() {
  const handleCopy = async () => {
    const names = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ].join("\n")

    try {
      await navigator.clipboard.writeText(names)
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-xl px-3 py-2 text-sm border border-sidebar-border bg-white hover:bg-sidebar-hover transition text-right"
    >
      העתק שמות משתנים
    </button>
  )
}

