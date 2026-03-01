export function dayStartUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0))
}

export function addMonthUtc(fromDayStart: Date): Date {
  const d = new Date(fromDayStart.getTime())
  d.setUTCMonth(d.getUTCMonth() + 1)
  return d
}

export function computeMonthlyPeriod(now: Date): { start: Date; end: Date; nextBillingAt: Date } {
  const start = dayStartUtc(now)
  const end = addMonthUtc(start)
  return { start, end, nextBillingAt: end }
}

export function computeNextMonthlyPeriod(prevEnd: Date): { start: Date; end: Date; nextBillingAt: Date } {
  const start = dayStartUtc(prevEnd)
  const end = addMonthUtc(start)
  return { start, end, nextBillingAt: end }
}

