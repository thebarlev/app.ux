/**
 * The checkout hero.
 *
 * ── ONE PALETTE, NOT A SECOND ONE ───────────────────────────────────────────
 * The navy stops, both radial washes and their exact percentages are the report
 * hero's, copied value for value from AuditorReportV3 rather than re-picked. The two
 * pages have to read as one product, and a second navy that is nearly the same is
 * worse than either navy on its own — it reads as a mistake rather than a choice.
 *
 * ── ⛔ THE CURVE CARRIES NO DATA, AND THAT IS NOT A STYLE PREFERENCE ─────────
 * No numbers, no percentages, no axis, no ticks, no labels, no before/after. A chart
 * with figures next to a payment button is a claim about results, and organic search
 * has no guaranteed result — a number on that screen is a number somebody will quote
 * back at us. So the shape says "forward" and says nothing else: a rising curve and
 * three points of light, with nothing to read off them.
 *
 * ── THE ANIMATION RUNS ONCE ─────────────────────────────────────────────────
 * CSS only. No library, no JS, no dependency added to a payment page. It plays on
 * load and stops: `both` holds the final frame and nothing is `infinite`, because a
 * looping animation beside a payment form reads as a banner. prefers-reduced-motion
 * removes it entirely, the same rule the report hero already follows.
 *
 * ── HEIGHT IS THE HARD CONSTRAINT ───────────────────────────────────────────
 * On a 390x844 phone the form has to start above the fold. So the mobile band is
 * deliberately short — the sentence at a readable size, the curve small beside it,
 * and no vertical padding spent on drama. Measured, not estimated; the number is in
 * the report that ships with this.
 */

const NAVY_0 = "#0A0F1A"
const NAVY_1 = "#0D1526"

export function CheckoutHero({ sentence }: { sentence: string }) {
  return (
    <>
      <style
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: `
@keyframes co-draw{ from{ stroke-dashoffset:var(--co-len) } to{ stroke-dashoffset:0 } }
@keyframes co-dot{ from{ opacity:0; transform:scale(.4) } to{ opacity:1; transform:scale(1) } }
.co-curve{ stroke-dasharray:var(--co-len); animation:co-draw 1.15s cubic-bezier(.22,.7,.24,1) both }
.co-dot{ transform-box:fill-box; transform-origin:center; animation:co-dot .5s ease-out both }
.co-dot-1{ animation-delay:.55s } .co-dot-2{ animation-delay:.8s } .co-dot-3{ animation-delay:1.05s }
@media (prefers-reduced-motion:reduce){
  .co-curve,.co-dot{ animation:none !important }
  .co-curve{ stroke-dashoffset:0 }
}
`.trim(),
        }}
      />
      <section
        aria-labelledby="co-hero-line"
        style={{
          background:
            "radial-gradient(900px 420px at 78% 8%, rgba(83,137,187,.20), transparent 60%)," +
            "radial-gradient(700px 500px at 18% 85%, rgba(83,137,187,.10), transparent 60%)," +
            `linear-gradient(${NAVY_0} 0%, ${NAVY_1} 100%)`,
          color: "#F4F6FA",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-5 sm:px-6 sm:py-7">
          <h1
            id="co-hero-line"
            className="max-w-[42ch] text-[15px] font-extrabold leading-[1.45] sm:text-[19px] sm:leading-[1.4]"
          >
            {sentence}
          </h1>

          {/*
            The curve. 120x56 so it reads at a glance and costs almost no height on a
            phone; aria-hidden because there is nothing here for a screen reader to
            convey — it is texture, and the sentence beside it is the content.
          */}
          <svg
            viewBox="0 0 120 56"
            className="h-[42px] w-[92px] shrink-0 sm:h-[56px] sm:w-[120px]"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="co-gr" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#5389BB" />
                <stop offset="100%" stopColor="#7FB0DC" />
              </linearGradient>
            </defs>
            <path
              className="co-curve"
              style={{ ["--co-len" as string]: "150" }}
              d="M6 48 C 30 46, 44 34, 62 26 S 96 12, 114 6"
              stroke="url(#co-gr)"
              strokeWidth="3.2"
              strokeLinecap="round"
            />
            <circle className="co-dot co-dot-1" cx="62" cy="26" r="3.1" fill="#7FB0DC" />
            <circle className="co-dot co-dot-2" cx="88" cy="15" r="2.6" fill="#7FB0DC" opacity=".85" />
            <circle className="co-dot co-dot-3" cx="114" cy="6" r="3.6" fill="#FFFFFF" />
          </svg>
        </div>
      </section>
    </>
  )
}
