"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface SubscriptionRow {
  company_id: string
  plan_id: string
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  failed_attempts: number
  next_billing_date: string | null
  companies: { company_name: string; email: string } | null
}

export interface ChargeRow {
  id: string
  company_id: string
  plan_id: string
  status: string
  amount: number
  currency: string
  subscription_period_start: string
  created_at: string
  uniq_asmachta: string
  companies: { company_name: string } | null
}

export interface CheckoutRow {
  id: string
  company_id: string | null
  plan_id: string
  status: string
  amount: number
  created_at: string
  provider_low_profile_code: string | null
  link_id: string | null
  companies: { company_name: string } | null
}

const SUB_STATUS: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  past_due: "bg-orange-100 text-orange-700",
  canceled: "bg-slate-100 text-slate-500",
  blocked: "bg-red-100 text-red-700",
}

const CHARGE_STATUS: Record<string, string> = {
  succeeded: "bg-emerald-100 text-emerald-700",
  created: "bg-blue-100 text-blue-700",
  failed: "bg-red-100 text-red-700",
}

const CHECKOUT_STATUS: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-700",
  redirected: "bg-blue-100 text-blue-700",
  created: "bg-slate-100 text-slate-500",
  failed: "bg-red-100 text-red-700",
  canceled: "bg-slate-100 text-slate-500",
  expired: "bg-slate-100 text-slate-500",
}

function Badge({ value, map }: { value: string; map: Record<string, string> }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${map[value] ?? "bg-slate-100 text-slate-500"}`}>{value}</span>
  )
}

function fmt(d: string | null): string {
  if (!d) return "—"
  return new Date(d).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })
}

export function AdminAuditorBillingTable({
  subscriptions,
  charges,
  checkouts,
}: {
  subscriptions: SubscriptionRow[]
  charges: ChargeRow[]
  checkouts: CheckoutRow[]
}) {
  return (
    <Tabs defaultValue="subscriptions">
      <TabsList className="mb-4">
        <TabsTrigger value="subscriptions">Subscriptions ({subscriptions.length})</TabsTrigger>
        <TabsTrigger value="charges">Charges ({charges.length})</TabsTrigger>
        <TabsTrigger value="checkouts">Checkouts ({checkouts.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="subscriptions">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Next Billing</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Failures</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Cancel at end</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {subscriptions.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No subscriptions</td></tr>
                ) : subscriptions.map((s) => (
                  <tr key={s.company_id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{s.companies?.company_name ?? "—"}</div>
                      <div className="text-xs text-slate-400">{s.companies?.email ?? s.company_id.slice(0, 8) + "…"}</div>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-700">{s.plan_id}</td>
                    <td className="px-4 py-3"><Badge value={s.status} map={SUB_STATUS} /></td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(s.current_period_start)} → {fmt(s.current_period_end)}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(s.next_billing_date)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{s.failed_attempts}</td>
                    <td className="px-4 py-3">{s.cancel_at_period_end ? <span className="text-amber-600 text-xs font-medium">Yes</span> : <span className="text-slate-400 text-xs">No</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="charges">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Period</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Asmachta</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {charges.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No charges</td></tr>
                ) : charges.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.companies?.company_name ?? c.company_id.slice(0, 8) + "…"}</td>
                    <td className="px-4 py-3 text-slate-700">{c.plan_id}</td>
                    <td className="px-4 py-3"><Badge value={c.status} map={CHARGE_STATUS} /></td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{c.amount} {c.currency}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(c.subscription_period_start)}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{c.uniq_asmachta.slice(0, 12)}…</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(c.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="checkouts">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Company</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Plan</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Status</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Amount</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Link</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Low Profile</th>
                  <th className="px-4 py-3 text-left font-semibold text-slate-600">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {checkouts.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">No checkouts</td></tr>
                ) : checkouts.map((ch) => (
                  <tr key={ch.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{ch.companies?.company_name ?? <span className="text-slate-400">anonymous</span>}</td>
                    <td className="px-4 py-3 text-slate-700">{ch.plan_id}</td>
                    <td className="px-4 py-3"><Badge value={ch.status} map={CHECKOUT_STATUS} /></td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{ch.amount}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-500">{ch.link_id ?? "—"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{ch.provider_low_profile_code?.slice(0, 12) ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">{fmt(ch.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  )
}
