import { fetchTextBounded } from "@/lib/auditor/fetch"

type Rule = { kind: "allow" | "disallow"; path: string }
type Group = { userAgents: string[]; rules: Rule[] }

export type RobotsDecision = {
  allowed: boolean
  reason?: string
}

function parseRobots(robotsText: string): Group[] {
  const groups: Group[] = []
  let current: Group | null = null

  const lines = String(robotsText || "").split(/\r?\n/g)
  for (const rawLine of lines) {
    const line = rawLine.replace(/#.*$/, "").trim()
    if (!line) continue

    const sep = line.indexOf(":")
    if (sep <= 0) continue
    const key = line.slice(0, sep).trim().toLowerCase()
    const value = line.slice(sep + 1).trim()

    if (key === "user-agent") {
      const ua = value.toLowerCase()
      if (!current || current.rules.length > 0) {
        current = { userAgents: [ua], rules: [] }
        groups.push(current)
      } else {
        current.userAgents.push(ua)
      }
      continue
    }

    if ((key === "allow" || key === "disallow") && current) {
      current.rules.push({ kind: key, path: value || "/" })
    }
  }

  return groups
}

function matchAgent(group: Group, userAgent: string): boolean {
  const ua = userAgent.toLowerCase()
  return group.userAgents.some((token) => token === "*" || ua.includes(token))
}

function pickRule(rules: Rule[], pathname: string): Rule | null {
  const matches = rules.filter((rule) => {
    if (!rule.path) return false
    if (rule.path === "/") return true
    return pathname.startsWith(rule.path)
  })

  if (matches.length === 0) return null
  matches.sort((a, b) => b.path.length - a.path.length)
  return matches[0]
}

export async function canCrawlUrlByRobots(params: {
  pageUrl: URL
  userAgent: string
  timeoutMs?: number
}): Promise<RobotsDecision> {
  const robotsUrl = `${params.pageUrl.origin}/robots.txt`
  const res = await fetchTextBounded({
    url: robotsUrl,
    timeoutMs: params.timeoutMs ?? 1500,
    maxBytes: 150_000,
    headers: {
      "user-agent": params.userAgent,
      accept: "text/plain,*/*;q=0.1",
    },
  })

  // If robots is unavailable, keep conservative but not blocking.
  if (!res.ok || res.status < 200 || res.status >= 400) {
    return { allowed: true, reason: "robots_unavailable" }
  }

  const groups = parseRobots(res.text)
  const candidateGroups = groups.filter((g) => matchAgent(g, params.userAgent))
  if (candidateGroups.length === 0) return { allowed: true }

  const allRules = candidateGroups.flatMap((g) => g.rules)
  const picked = pickRule(allRules, params.pageUrl.pathname || "/")
  if (!picked) return { allowed: true }
  if (picked.kind === "allow") return { allowed: true }
  return { allowed: false, reason: "robots_disallow" }
}
