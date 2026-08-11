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
 * Two floors on phones. Anything the visitor reads as a sentence is 20px:
 * prose, messages, findings, quotes, the lede. Everything else — captions,
 * hints, category labels — is 18px or 19px.
 *
 * The second floor used to be 15px and 16px, on the argument that a caption set
 * at message size stops reading as a caption. Measured on the running page that
 * argument bought very little and cost readability: the finding text, the "out
 * of 100" under the score, the testimonial source line and the gate's own
 * micro-copy were all landing at 15-16px on a phone. Nothing a visitor reads
 * goes below 18px now. Category labels take 19px rather than 20px only because
 * the tile puts the label and its number on one row.
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
  /*
    --ar-page split into its three parts.

    The hero is a full-bleed dark band, so it has to escape the horizontal
    padding that used to sit on the page root. The root now carries the vertical
    halves only and each content container carries --ar-gutter itself, which
    leaves the band free to run edge to edge while everything else stays aligned
    to the same measure. Same numbers as the shorthand above, just addressable.
  */
  --ar-page-top:22px; --ar-gutter:16px; --ar-page-bottom:40px;
  --ar-btn:13px 20px; --ar-gap:16px; --ar-check:15px; --ar-testi-top:34px;
}
/*
  Two testimonials side by side, one per column.

  The pair used to stack at every width, which left the closing block a tall
  single file on a desktop where the two quotes fit comfortably beside each
  other. Only the layout moves: the quotes, the avatars, the rule and every
  colour in the block are untouched.

  The rule follows the axis it separates. Between two columns it is a short
  vertical mark on the shared edge; stacked on a phone it turns back into the
  horizontal one. Same 64px, same colour, same "a short centred rule, not a
  full-width border" argument as the original — see AuditorTestimonials.

  Base first, phone override inside the query below, because these rules and
  the ones in there have equal specificity and the later block wins.

  align-items:start so a shorter quote does not stretch its figure to the
  height of the taller one and float its rule away from the text.
*/
.${AUDITOR_SCOPE} .ar-testi-grid{
  display:grid; grid-template-columns:1fr 1fr; column-gap:var(--ar-gap); align-items:start;
}
.${AUDITOR_SCOPE} .ar-testi-rule{
  inset-inline-start:0; top:50%; transform:translateY(-50%);
  width:1px; height:64px;
}
@media (max-width:640px){
  .${AUDITOR_SCOPE}{
    --ar-h1:26px; --ar-h2:21px; --ar-h3:20px; --ar-cta:24px; --ar-score:46px;
    --ar-lede:20px; --ar-prose:20px; --ar-label:19px; --ar-meta:18px; --ar-caption:18px; --ar-val:34px; --ar-peek:24px;
    --ar-page:16px 8px 32px; --ar-panel:18px 14px; --ar-panel-lg:20px 16px; --ar-panel-sm:16px 14px;
    --ar-page-top:16px; --ar-gutter:8px; --ar-page-bottom:32px;
    --ar-btn:15px 20px; --ar-gap:12px; --ar-check:22px; --ar-testi-top:38px;
  }
  .${AUDITOR_SCOPE} .ar-tile{
    display:grid; grid-template-columns:1fr auto; align-items:center; column-gap:12px;
  }
  .${AUDITOR_SCOPE} .ar-tile-val{ margin:0; text-align:end; justify-content:flex-end; }
  .${AUDITOR_SCOPE} .ar-tile-meter{ grid-column:1 / -1; margin-top:12px; }
  /* Full-width taps, stacked, instead of two half-width buttons wrapping. */
  .${AUDITOR_SCOPE} .ar-actions{ width:100%; }
  .${AUDITOR_SCOPE} .ar-actions > a{ flex:1 1 100%; justify-content:center; }
  /*
    Testimonials fall back to one column, and the rule between them turns back
    from a vertical edge into the short horizontal one it is on a phone. Two
    quotes side by side at 390px would be two narrow columns of broken lines,
    which is the squeezed-desktop look the rest of this breakpoint exists to
    avoid.
  */
  .${AUDITOR_SCOPE} .ar-testi-grid{ grid-template-columns:1fr; }
  .${AUDITOR_SCOPE} .ar-testi-item + .ar-testi-item{ margin-top:18px; }
  .${AUDITOR_SCOPE} .ar-testi-rule{
    inset-inline-start:50%; transform:translateX(50%);
    top:0; width:64px; height:1px;
  }
}
/*
  Underline fields, not boxes.

  A rule under the line the visitor types on is the whole affordance a text field
  needs; the rectangle around it was the last frame left in this flow after the
  panel and the fills came off. Written here rather than inline because the base
  input classes set a border, a radius and a focus ring, and a rule at
  .ar-scope .ar-field outranks a single Tailwind utility without needing
  !important on four declarations.

  Focus thickens and darkens the rule instead of drawing a ring around a shape
  that no longer exists.
*/
.${AUDITOR_SCOPE} .ar-field{
  border:0; border-bottom:1px solid #5C6473; border-radius:0;
  background:transparent; box-shadow:none; padding-inline:2px;
}
.${AUDITOR_SCOPE} .ar-field:focus,
.${AUDITOR_SCOPE} .ar-field:focus-visible{
  border-bottom:2px solid #3F76AC !important; box-shadow:none !important; outline:none;
}
@keyframes ar-reveal{ from{ opacity:0; transform:translateY(-4px) } to{ opacity:1; transform:none } }
@keyframes ar-draw{ from{ stroke-dashoffset:46 } to{ stroke-dashoffset:0 } }
/*
  The kick's pulse, carried from the spec: a dot that breathes a ring outward.
  Box-shadow rather than a transform so it cannot shift the text beside it.
*/
@keyframes ar-pulse{
  0%{ box-shadow:0 0 0 0 rgba(83,137,187,.55) }
  70%{ box-shadow:0 0 0 11px rgba(83,137,187,0) }
  100%{ box-shadow:0 0 0 0 rgba(83,137,187,0) }
}
.${AUDITOR_SCOPE} .ar-pulse{
  width:7px; height:7px; border-radius:50%; background:#5389BB; flex-shrink:0;
  animation:ar-pulse 2.4s infinite;
}
/*
  The gauge draws itself once. The target offset depends on the score, so it
  cannot be a keyframe — the arc renders empty and the offset is set after mount,
  and this transition is what makes that a sweep rather than a jump.
*/
.${AUDITOR_SCOPE} .ar-gauge-arc{ transition:stroke-dashoffset .9s ease-out }
@media (prefers-reduced-motion:reduce){
  .${AUDITOR_SCOPE} svg *{ animation:none !important }
  /* The arc's motion is a transition, not an animation, so it needs saying too. */
  .${AUDITOR_SCOPE} .ar-gauge-arc{ transition:none !important }
  .${AUDITOR_SCOPE} .ar-pulse{ animation:none !important }
}
`.trim(),
      }}
    />
  )
}
