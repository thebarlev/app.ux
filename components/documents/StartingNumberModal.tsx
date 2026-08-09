"use client";

import { useState, useEffect, useRef } from "react";
import { getSequenceInfoAction, lockStartingNumberAction } from "@/app/dashboard/documents/actions";
import { resolveStartingNumberOutcome } from "@/lib/documents/starting-number-outcome";
import { lockBodyScroll, unlockBodyScroll } from "@/lib/ui/scroll-lock";

type Props = {
  documentType: string;
  onClose: () => void;
  onSuccess: () => void;
};

/**
 * Starting-number modal.
 *
 * Built to design-mockups/number-modal.html: close button on its own row above the
 * title, two rows of quick options (1·100·1000 / 2000·3000·4000) grouped tightly
 * with an "או" divider, and a full-width input aligned to the button row.
 *
 * Styles are scoped under `snm-` in a local <style> rather than using the shared
 * design-system components, because those carry their own paddings and could not
 * hit the mockup's tighter spacing (and cn() has no tailwind-merge, so overriding
 * their sizes is unreliable).
 */

const QUICK_ROWS = [
  [1, 100, 1000],
  [2000, 3000, 4000],
];

export default function StartingNumberModal({
  documentType,
  onClose,
  onSuccess,
}: Props) {
  const [startingNumber, setStartingNumber] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    closeButtonRef.current?.focus();
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [loading, onClose]);

  // Freeze the page behind the modal; the dialog itself scrolls only if it has to.
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  async function onConfirm() {
    if (startingNumber < 1) {
      setError("מספר התחלתי חייב להיות 1 לפחות");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await lockStartingNumberAction({
        documentType,
        startingNumber,
        prefix: null,
      });

      /*
       * An already-locked sequence used to be treated as a success: onSuccess()
       * and the dialog closed, so the number the user typed was discarded without
       * a word. It is now told to them, with the number that is actually in force
       * read back from the sequence.
       */
      let inForce: { currentNumber: number | null; nextNumber: number | null } | null = null;
      if (!res.ok && res.message?.includes("sequence_already_locked")) {
        try {
          const info = await getSequenceInfoAction({ documentType });
          inForce = { currentNumber: info.currentNumber, nextNumber: info.nextNumber };
        } catch {
          // Leave it null; the message says the number could not be read rather
          // than inventing one.
        }
      }

      const outcome = resolveStartingNumberOutcome({
        result: res,
        attempted: startingNumber,
        inForce,
      });

      if (outcome.kind === "success") {
        onSuccess();
        return;
      }

      setError(outcome.message);
    } catch (e) {
      setError("אירעה שגיאה. נסה שוב.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="snm-overlay" role="presentation" dir="rtl">
      <style>{SNM_CSS}</style>
      <div
        className="snm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="snm-title"
        aria-describedby="snm-desc"
      >
        {/* close on its own row, above the title */}
        <div className="snm-top">
          <button
            ref={closeButtonRef}
            type="button"
            className="snm-close"
            onClick={onClose}
            disabled={loading}
            aria-label="סגור חלון"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
        </div>

        <div className="snm-head">
          <div className="snm-ic" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="4" x2="20" y1="9" y2="9" />
              <line x1="4" x2="20" y1="15" y2="15" />
              <line x1="10" x2="8" y1="3" y2="21" />
              <line x1="16" x2="14" y1="3" y2="21" />
            </svg>
          </div>
          <div>
            <h2 id="snm-title">בחירת מספר מסמך ראשון</h2>
            <p id="snm-desc">
              זוהי פעולה חד־פעמית. לאחר בחירת המספר הראשון, המיספור ימשיך אוטומטית ולא ניתן יהיה לשנותו.
            </p>
          </div>
        </div>

        <div className="snm-body">
          {error && (
            <div className="snm-err" role="alert" aria-live="assertive">
              {error}
            </div>
          )}

          <div className="snm-group-label" id="snm-quick-label">
            בחירה מהירה
          </div>
          <div role="group" aria-labelledby="snm-quick-label">
            {QUICK_ROWS.map((row, i) => (
              <div className="snm-quick" key={i} style={i > 0 ? { marginTop: 10 } : undefined}>
                {row.map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={startingNumber === n ? "sel" : undefined}
                    onClick={() => {
                      setStartingNumber(n);
                      setError(null);
                    }}
                    disabled={loading}
                    aria-pressed={startingNumber === n}
                  >
                    {n}
                  </button>
                ))}
              </div>
            ))}
          </div>

          <div className="snm-or" aria-hidden="true">או</div>

          <label className="snm-custom-label" htmlFor="snm-custom">
            מספר מותאם אישית <span aria-hidden="true">*</span>
          </label>
          <input
            id="snm-custom"
            className="snm-num"
            type="number"
            min={1}
            required
            value={startingNumber}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10);
              if (!isNaN(val) && val >= 1) {
                setStartingNumber(val);
                setError(null);
              }
            }}
            disabled={loading}
            aria-required="true"
            aria-invalid={!!error}
          />
        </div>

        <div className="snm-foot">
          <button
            type="button"
            className="snm-ok"
            onClick={onConfirm}
            disabled={loading || startingNumber < 1}
            aria-busy={loading}
          >
            {loading ? "שומר..." : "אישור והתחלת מיספור"}
          </button>
          <button
            type="button"
            className="snm-cancel"
            onClick={onClose}
            disabled={loading}
            aria-label="ביטול ללא שמירה"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}

const SNM_CSS = `
.snm-overlay{position:fixed;inset:0;z-index:100;display:flex;align-items:center;justify-content:center;padding:16px;
  background:rgba(20,24,45,.55);
  --snm-accent:#5389BB;--snm-accent-soft:#EAF1F8;--snm-ink:#22283A;--snm-muted:#8A90A0;--snm-line:#E9ECF2;--snm-field:#F7F9FC;
  --snm-danger:#D64545;--snm-danger-soft:#FBEBEB;
  font-family:'Assistant',system-ui,Arial,sans-serif;color:var(--snm-ink)}
.snm-modal{width:100%;max-width:460px;background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.3);
  max-height:calc(100vh - 32px);overflow-y:auto;overscroll-behavior:contain}
.snm-modal *{box-sizing:border-box}
.snm-top{display:flex;justify-content:flex-end;padding:14px 16px 0}
.snm-close{width:34px;height:34px;border-radius:9px;border:1px solid var(--snm-line);background:#fff;color:var(--snm-muted);
  display:grid;place-items:center;cursor:pointer;padding:0}
.snm-close:hover:not(:disabled){background:var(--snm-accent-soft);color:var(--snm-accent)}
.snm-close:disabled{opacity:.5;cursor:not-allowed}
.snm-close svg{width:18px;height:18px}
.snm-head{display:flex;align-items:flex-start;gap:13px;padding:6px 24px 0}
.snm-ic{width:44px;height:44px;border-radius:11px;background:var(--snm-accent-soft);color:var(--snm-accent);
  display:grid;place-items:center;flex-shrink:0}
.snm-ic svg{width:23px;height:23px}
.snm-head h2{font-size:20px;font-weight:800;line-height:1.25;margin:0;text-align:right}
.snm-head p{color:var(--snm-muted);font-size:14px;line-height:1.5;margin:5px 0 0;text-align:right}
.snm-body{padding:22px 24px 4px}
.snm-err{background:var(--snm-danger-soft);border:1px solid #F0C4C4;color:var(--snm-danger);border-radius:11px;
  padding:10px 12px;font-size:13.5px;font-weight:600;margin-bottom:14px}
.snm-group-label{font-size:13px;font-weight:700;color:var(--snm-muted);margin-bottom:10px}
.snm-quick{display:flex;gap:10px}
.snm-quick button{flex:1;height:50px;border-radius:11px;border:1px solid var(--snm-accent);background:var(--snm-accent-soft);
  color:var(--snm-ink);font-family:inherit;font-weight:700;font-size:17px;cursor:pointer;transition:.12s;padding:0}
.snm-quick button.sel{background:var(--snm-accent);color:#fff}
.snm-quick button:hover:not(.sel):not(:disabled){background:#dbe8f4}
.snm-quick button:disabled{opacity:.6;cursor:not-allowed}
.snm-or{display:flex;align-items:center;gap:12px;color:var(--snm-muted);font-size:13px;font-weight:600;margin:16px 0}
.snm-or::before,.snm-or::after{content:"";flex:1;height:1px;background:var(--snm-line)}
.snm-custom-label{display:block;font-size:14px;font-weight:600;margin-bottom:8px}
.snm-custom-label span{color:var(--snm-accent)}
.snm-num{width:100%;height:50px;border:1px solid var(--snm-line);border-radius:11px;padding:0 14px;font-size:17px;
  text-align:right;font-family:inherit;background:var(--snm-field);color:var(--snm-ink)}
.snm-num:focus{outline:none;border-color:var(--snm-accent);background:#fff;box-shadow:0 0 0 3px var(--snm-accent-soft)}
.snm-num:disabled{opacity:.6}
.snm-foot{display:flex;gap:10px;padding:22px 24px 24px}
.snm-foot button{height:50px;border-radius:11px;font-family:inherit;font-weight:700;font-size:16px;cursor:pointer;border:none;padding:0 22px}
.snm-foot button:disabled{opacity:.6;cursor:not-allowed}
.snm-ok{flex:1;background:var(--snm-accent);color:#fff}
.snm-cancel{background:#fff;color:var(--snm-ink);border:1px solid var(--snm-line)}
@media(max-width:520px){
  .snm-head,.snm-body,.snm-foot{padding-left:18px;padding-right:18px}
  .snm-foot{flex-direction:column-reverse}
  .snm-ok,.snm-cancel{width:100%}
}
`;
