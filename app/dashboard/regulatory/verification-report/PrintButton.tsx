"use client"

/**
 * The print control, as its own client component.
 *
 * window.print() needs a client boundary, and the first version of this page put an
 * onClick straight into the server component — which typechecks and then fails at the
 * server/client boundary. One button is cheaper than making the whole report a client
 * component and shipping the table to the browser twice.
 */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded border-2 border-[#2C5679] px-4 py-1.5 text-[13px] font-bold text-[#2C5679]"
    >
      הדפסה
    </button>
  )
}
