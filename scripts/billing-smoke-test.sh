#!/usr/bin/env bash
# ============================================================
# billing-smoke-test.sh — end-to-end verification of the four
# mandatory billing tests:
#   1) Normal flow
#   2) Forced failure
#   3) Repair
#   4) Idempotency
#
# Run from the app.ux repo root, against STAGING (or a sandbox
# environment) — never against prod with real money.
# ============================================================
#
# Prereqs (set as env vars before running):
#   ISSUER_BASE_URL          e.g. https://app-staging.uxellent.com
#   ISSUER_API_KEY           UXELLENT_BILLING_API_KEY for the staging issuer
#   ISSUER_BAD_API_KEY       any non-matching string (used to force failure)
#   ISSUER_CRON_SECRET       BILLING_CRON_SECRET on the issuer (for repair endpoint)
#   ISSUER_DB_URL            postgres://… connection string with read access
#                            to public.documents and vow_billing_issued_documents
#   MIOSHY_BASE_URL          e.g. https://mioshy-staging.vercel.app
#   MIOSHY_CRON_SECRET       CARDCOM_BILLING_CRON_SECRET
#   MIOSHY_DB_URL            postgres://… connection string for mioshy
#   TEST_USER_ID             a valid auth.users.id on BOTH systems (or the
#                            same user-id mioshy passes in calls)
#   TEST_EMAIL               an email tied to that user
#
# Usage:
#   chmod +x scripts/billing-smoke-test.sh
#   ./scripts/billing-smoke-test.sh
# ============================================================

set -uo pipefail

# ── tiny output helpers ────────────────────────────────────────────────
red()    { printf "\033[31m%s\033[0m\n" "$*"; }
green()  { printf "\033[32m%s\033[0m\n" "$*"; }
yellow() { printf "\033[33m%s\033[0m\n" "$*"; }
bold()   { printf "\033[1m%s\033[0m\n" "$*"; }
hr()     { printf -- "----------------------------------------\n"; }

require_env() {
  local missing=0
  for v in "$@"; do
    if [ -z "${!v:-}" ]; then
      red "Missing env: $v"
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || { echo; yellow "Set the missing vars and re-run."; exit 1; }
}

require_env ISSUER_BASE_URL ISSUER_API_KEY ISSUER_BAD_API_KEY ISSUER_CRON_SECRET \
            ISSUER_DB_URL MIOSHY_BASE_URL MIOSHY_CRON_SECRET MIOSHY_DB_URL \
            TEST_USER_ID TEST_EMAIL

DEAL_NUMBER="$(date +%s)$$"   # unique per run
IDEMPOTENCY_KEY="mioshy:${DEAL_NUMBER}"

bold "Run id: deal_number=${DEAL_NUMBER}"
bold "       idempotency_key=${IDEMPOTENCY_KEY}"
hr

# ── helper: POST /api/billing/create-document with optional bad key ─────
call_create_document() {
  local key="$1"
  local extra_json="${2:-}"
  local body
  body=$(cat <<JSON
{
  "user_id": "${TEST_USER_ID}",
  "email":   "${TEST_EMAIL}",
  "country": "IL",
  "amount":  49.90,
  "currency": "ILS",
  "language": "he",
  "is_israeli": true,
  "idempotency_key": "${IDEMPOTENCY_KEY}"${extra_json}
}
JSON
)
  curl -sS -o /tmp/billing_response.json -w "%{http_code}" \
    -H "content-type: application/json" \
    -H "x-api-key: ${key}" \
    -H "x-source: smoke-test" \
    -H "x-idempotency-key: ${IDEMPOTENCY_KEY}" \
    -X POST "${ISSUER_BASE_URL}/api/billing/create-document" \
    --data "${body}"
}

run_sql() {
  local conn="$1"; shift
  local sql="$1"
  psql "$conn" -At -c "$sql"
}

# ════════════════════════════════════════════════════════════════════════
# TEST 1 — Normal flow
# ════════════════════════════════════════════════════════════════════════
bold "TEST 1 — Normal flow"
hr

http_code=$(call_create_document "${ISSUER_API_KEY}")
echo "HTTP ${http_code}"
cat /tmp/billing_response.json | jq .

doc_id=$(jq -r '.document_id // empty' /tmp/billing_response.json)
[ -n "${doc_id}" ] || { red "FAIL: no document_id returned"; exit 1; }

green "→ document_id=${doc_id}"

read -r status accounting paid <<< "$(run_sql "${ISSUER_DB_URL}" \
  "select document_status, accounting_status, paid_amount
   from public.documents where id = '${doc_id}';")"

echo "DB document_status=${status}  accounting_status=${accounting}  paid_amount=${paid}"

if [ "${status}" = "final" ] && [ "${accounting}" = "paid" ] && \
   [ "$(echo "${paid} > 0" | bc -l 2>/dev/null || echo 0)" = "1" ]; then
  green "✅ TEST 1 PASSED"
else
  red "❌ TEST 1 FAILED — fields not populated as expected"
  exit 1
fi
hr; echo

# ════════════════════════════════════════════════════════════════════════
# TEST 2 — Forced failure
# ════════════════════════════════════════════════════════════════════════
bold "TEST 2 — Forced failure (bad API key on issuer side)"
hr

# We exercise the FAILURE path by hitting a separate deal_number with the
# WRONG api key. Since this exercises the issuer's auth check, we use a
# distinct idempotency key so we don't pollute test 1's row.
FAIL_DEAL_NUMBER="${DEAL_NUMBER}-fail"
FAIL_IDEMPOTENCY_KEY="mioshy:${FAIL_DEAL_NUMBER}"
yellow "Using bad key + idempotency=${FAIL_IDEMPOTENCY_KEY}"

# 401 expected from issuer
http_code=$(curl -sS -o /tmp/fail_response.json -w "%{http_code}" \
  -H "content-type: application/json" \
  -H "x-api-key: ${ISSUER_BAD_API_KEY}" \
  -H "x-source: smoke-test" \
  -H "x-idempotency-key: ${FAIL_IDEMPOTENCY_KEY}" \
  -X POST "${ISSUER_BASE_URL}/api/billing/create-document" \
  --data "{\"user_id\":\"${TEST_USER_ID}\",\"email\":\"${TEST_EMAIL}\",\"country\":\"IL\",\"amount\":49.90,\"currency\":\"ILS\",\"language\":\"he\",\"is_israeli\":true,\"idempotency_key\":\"${FAIL_IDEMPOTENCY_KEY}\"}")
echo "HTTP ${http_code}"
cat /tmp/fail_response.json | jq .

# Now the mioshy retry+log path: simulate by calling mioshy's own internal
# helper. Easiest path: run a test endpoint or query the DB after a real
# failed renewal/indicator. Since smoke-test runs out-of-band, we just
# verify the issuer rejected us (HTTP 4xx) and instruct the operator to
# trigger a mioshy call manually with a broken UXELLENT_BILLING_API_KEY
# in staging env to populate mioshy_billing_failures.
if [[ "${http_code}" = "401" || "${http_code}" = "403" ]]; then
  green "✅ Issuer correctly rejected bad key (HTTP ${http_code})"
else
  red "❌ Issuer should reject bad key but returned HTTP ${http_code}"
  exit 1
fi

yellow ""
yellow "Now verify on the mioshy side: temporarily set UXELLENT_BILLING_API_KEY"
yellow "to ${ISSUER_BAD_API_KEY} on a staging deploy, run a test charge, then:"
yellow ""
yellow "   psql \$MIOSHY_DB_URL -c \\"
yellow "     \"select error_code, count(*), max(created_at)"
yellow "       from public.mioshy_billing_failures"
yellow "       where created_at > now() - interval '5 minutes'"
yellow "       group by 1 order by 2 desc;\""
yellow ""
yellow "Expect rows: 3 attempts (http_4xx) + 1 retry_exhausted."
hr; echo

# ════════════════════════════════════════════════════════════════════════
# TEST 3 — Repair (issuer side)
# ════════════════════════════════════════════════════════════════════════
bold "TEST 3 — Repair endpoint on issuer side"
hr

http_code=$(curl -sS -o /tmp/repair_response.json -w "%{http_code}" \
  -H "x-cron-secret: ${ISSUER_CRON_SECRET}" \
  -X POST "${ISSUER_BASE_URL}/api/billing/repair-missing-invoices?limit=50&dry_run=true")
echo "HTTP ${http_code} (dry_run)"
cat /tmp/repair_response.json | jq '{ok, dry_run, scanned, broken, repaired}'

http_code=$(curl -sS -o /tmp/repair_response.json -w "%{http_code}" \
  -H "x-cron-secret: ${ISSUER_CRON_SECRET}" \
  -X POST "${ISSUER_BASE_URL}/api/billing/repair-missing-invoices?limit=50")
echo "HTTP ${http_code} (live)"
cat /tmp/repair_response.json | jq '{ok, scanned, broken, repaired}'

ok=$(jq -r '.ok' /tmp/repair_response.json)
[ "${ok}" = "true" ] && green "✅ Issuer repair endpoint reachable & responsive" \
                     || { red "❌ Issuer repair endpoint failed"; exit 1; }

bold ""
bold "Now run the mioshy repair endpoint:"
hr

http_code=$(curl -sS -o /tmp/mioshy_repair.json -w "%{http_code}" \
  -H "authorization: Bearer ${MIOSHY_CRON_SECRET}" \
  -X POST "${MIOSHY_BASE_URL}/api/billing/repair-missing-invoices?limit=50")
echo "HTTP ${http_code}"
cat /tmp/mioshy_repair.json | jq '{ok, dry_run, scanned, repaired, failed}'

ok=$(jq -r '.ok' /tmp/mioshy_repair.json)
repaired=$(jq -r '.repaired // 0' /tmp/mioshy_repair.json)
[ "${ok}" = "true" ] && green "✅ mioshy repair endpoint reachable; repaired=${repaired}" \
                     || { red "❌ mioshy repair endpoint failed"; exit 1; }
hr; echo

# ════════════════════════════════════════════════════════════════════════
# TEST 4 — Idempotency (most important)
# ════════════════════════════════════════════════════════════════════════
bold "TEST 4 — Idempotency: same deal_number twice → ONE document"
hr

# We already issued one in test 1. Call the SAME endpoint a second time
# with the SAME idempotency_key, and expect:
#   - HTTP 200
#   - same document_id
#   - response includes idempotent_replay=true
yellow "Calling create-document a SECOND time with idempotency_key=${IDEMPOTENCY_KEY}"

http_code=$(call_create_document "${ISSUER_API_KEY}")
echo "HTTP ${http_code}"
cat /tmp/billing_response.json | jq .

doc_id_2=$(jq -r '.document_id // empty' /tmp/billing_response.json)
replay=$(jq -r '.idempotent_replay // false' /tmp/billing_response.json)

if [ "${doc_id_2}" = "${doc_id}" ]; then
  green "✅ Same document_id returned (${doc_id_2})"
else
  red "❌ Different document_id: first=${doc_id} second=${doc_id_2}"
  exit 1
fi

if [ "${replay}" = "true" ]; then
  green "✅ Response flagged idempotent_replay=true"
else
  yellow "⚠️  Response did NOT include idempotent_replay (cache hit may have raced with creation)"
fi

# Authoritative DB check
count=$(run_sql "${ISSUER_DB_URL}" \
  "select count(*) from public.vow_billing_issued_documents
   where idempotency_key = '${IDEMPOTENCY_KEY}';")
echo "DB rows with idempotency_key=${IDEMPOTENCY_KEY}: ${count}"

if [ "${count}" = "1" ]; then
  green "✅ TEST 4 PASSED — exactly one row in vow_billing_issued_documents"
else
  red "❌ TEST 4 FAILED — expected 1 row, found ${count}"
  exit 1
fi
hr; echo

# ════════════════════════════════════════════════════════════════════════
bold "All tests completed."
hr
green "Summary:"
green "  Test 1 (normal flow)        ✅"
green "  Test 2 (forced failure)     ✅ (issuer rejected; mioshy verification manual — see notes)"
green "  Test 3 (repair endpoints)   ✅"
green "  Test 4 (idempotency)        ✅"
