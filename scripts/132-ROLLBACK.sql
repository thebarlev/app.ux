-- ============================================================================
-- 132-ROLLBACK · deliberately does nothing
-- ============================================================================
--
-- ⛔ There is no rollback for a redaction, and there must not be one.
--
-- 132 destroyed card tokens and cardholder ID numbers that were stored in clear text.
-- The plaintext is gone. It exists in no backup column, no shadow table and no audit
-- row, because keeping a copy would have reproduced the exact problem 132 fixed.
--
-- This file exists so that "where is 132's rollback" has an answer, and so nobody
-- writes a plausible-looking one later.
--
-- If a payment genuinely needs investigating, everything required for that survived:
-- InternalDealNumber, the approval code, the card brand, the first and last digits,
-- the amount and the response codes. If a live subscription needs charging, that
-- reads the encrypted token in auditor_customer_payment_methods and never touched
-- these columns.
-- ============================================================================

do $$
begin
  raise notice '132-ROLLBACK is intentionally a no-op: redacted card tokens cannot and must not be restored.';
end
$$;

select '132-ROLLBACK.sql is a deliberate no-op' as migration;
