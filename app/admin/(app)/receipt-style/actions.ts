/**
 * Admin Receipt Style Actions
 * 
 * Re-exports from shared /lib/receipt-style module.
 * This file exists for backwards compatibility with admin UI imports.
 * 
 * All actual implementation is in /lib/receipt-style.ts
 */

"use server";

import {
  getReceiptStyleSettings,
  getReceiptStyleSettingsPublic,
  saveReceiptStyleSettings,
  resetReceiptStyleSettings,
} from "@/lib/receipt-style";

// Re-export all functions from shared module
export {
  getReceiptStyleSettings,
  getReceiptStyleSettingsPublic,
  saveReceiptStyleSettings,
  resetReceiptStyleSettings,
};
