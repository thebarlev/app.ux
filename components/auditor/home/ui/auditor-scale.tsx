/**
 * The type and spacing scale for the public auditor flow, as CSS custom
 * properties with a phone breakpoint.
 *
 * Why a style element and not inline styles. Every size in this flow was a
 * literal number in a style object, which cannot hold a media query, so the
 * phone got the desktop scale shrunk to fit: 12.5px findings text, 10.5px tile
 * captions, panels with 30px of side padding inside a 390px screen. Reading it
 * meant zooming. Custom properties are the smallest thing that lets one set of
 * inline styles resolve to two scales, so the numbers stay next to the markup
 * they belong to and the breakpoint lives in one place.
 *
 * Why 640px. It is where the two-column tile grid stops being two usable columns
 * rather than where any particular device sits.
 *
 * The floor on phones is 20px for anything the visitor reads as a sentence:
 * prose, messages, findings, quotes, the lede. Captions, hints and category
 * labels are not sentences and take a smaller bump — 16px and 17px — because
 * pushing a five-character tile label to 20px pushes the number beside it off
 * the row, and a caption set at message size stops reading as a caption.
 *
 * Rules, not just variables: the tile grid becomes a single column of rows on a
 * phone, laid out label-left, value-right, meter underneath. A 150px-minimum
 * grid gives a 390px screen two cramped columns, which is the squeezed-desktop
 * look rather than an app.
 */
export const AUDITOR_SCOPE = "ar-scope"

export function AuditorScaleStyles() {
  return (
    <style
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{
        __html: `
.${AUDITOR_SCOPE}{
  --ar-h1:23px; --ar-h2:17px; --ar-h3:16px; --ar-cta:20px; --ar-score:40px;
  --ar-lede:14.5px; --ar-prose:13.5px; --ar-label:13px; --ar-meta:12.5px; --ar-caption:11px; --ar-val:30px; --ar-peek:19px;
  --ar-page:22px 16px 40px; --ar-panel:22px 24px; --ar-panel-lg:26px 30px; --ar-panel-sm:15px 16px;
  --ar-btn:13px 20px; --ar-gap:16px;
}
@media (max-width:640px){
  .${AUDITOR_SCOPE}{
    --ar-h1:26px; --ar-h2:21px; --ar-h3:20px; --ar-cta:24px; --ar-score:46px;
    --ar-lede:20px; --ar-prose:20px; --ar-label:17px; --ar-meta:16px; --ar-caption:15px; --ar-val:34px; --ar-peek:24px;
    --ar-page:16px 12px 32px; --ar-panel:18px 16px; --ar-panel-lg:20px 18px; --ar-panel-sm:16px 16px;
    --ar-btn:15px 20px; --ar-gap:12px;
  }
  .${AUDITOR_SCOPE} .ar-tiles{ grid-template-columns:1fr; }
  .${AUDITOR_SCOPE} .ar-tile{
    display:grid; grid-template-columns:1fr auto; align-items:center; column-gap:12px;
  }
  .${AUDITOR_SCOPE} .ar-tile-val{ margin:0; text-align:end; }
  .${AUDITOR_SCOPE} .ar-tile-meter{ grid-column:1 / -1; margin-top:12px; }
  /* Full-width taps, stacked, instead of two half-width buttons wrapping. */
  .${AUDITOR_SCOPE} .ar-actions{ width:100%; }
  .${AUDITOR_SCOPE} .ar-actions > a{ flex:1 1 100%; justify-content:center; }
}
`.trim(),
      }}
    />
  )
}
