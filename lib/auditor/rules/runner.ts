import type { AuditorRuleCategory } from "../types"
import { evaluateAllRules, type AuditorRuleResult, type AuditorRulesContext } from "./definitions"

const CATEGORY_WEIGHTS: Record<AuditorRuleCategory, number> = {
  technical: 35,
  schema: 35,
  ai_readiness: 20,
  tracking: 10,
}

function scoreForStatus(status: AuditorRuleResult["status"]): number {
  if (status === "pass") return 1
  if (status === "warn") return 0.5
  return 0
}

function roundInt(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

export function runRulesAndScore(ctx: AuditorRulesContext): {
  rules: AuditorRuleResult[]
  scoreTotal: number
  scoreBreakdown: Record<string, number>
} {
  const rules = evaluateAllRules(ctx)

  const byCategory: Record<AuditorRuleCategory, AuditorRuleResult[]> = {
    technical: [],
    schema: [],
    ai_readiness: [],
    tracking: [],
  }
  for (const r of rules) byCategory[r.category].push(r)

  const breakdown: Record<string, number> = {}
  let total = 0

  for (const [cat, catWeight] of Object.entries(CATEGORY_WEIGHTS) as Array<[AuditorRuleCategory, number]>) {
    const rs = byCategory[cat]
    const denom = rs.reduce((sum, r) => sum + (r.weight || 0), 0) || 1
    const raw = rs.reduce((sum, r) => sum + scoreForStatus(r.status) * (r.weight || 0), 0) / denom
    const catScore = raw * 100
    breakdown[cat] = roundInt(catScore)
    total += (catScore / 100) * catWeight
  }

  return {
    rules,
    scoreTotal: roundInt(total),
    scoreBreakdown: breakdown,
  }
}

