# Reference analysis: ingrassiadaniel.it

This profile site borrows the *concept* of https://ingrassiadaniel.it/ (a single scroll story told by one morphing particle system). No code, text, shaders, point clouds or other assets were copied; everything here is written from scratch with Sajin Shivdas's own content.

## How it was analysed

1. The page and its 11 JavaScript / 3 CSS chunks were mirrored over HTTPS (Next.js build with Turbopack).
2. REA 6.9.0 `analyze-javascript-application` ran statically on the mirror; no target code was executed by REA.
   - Evidence `ev_fc85fffb8ddef5c0374b3d303bf37c7d246c2029bae54af1667c4270f6989f0d`
   - Application graph `jag_7d9cbda6…e6bd7e3`, semantic graph `jsrg_c71ea6c2…590b0828a0`, route inventory `jsri:4d9930c5…be4bae8f`
   - 11 files parsed, 283,014 AST nodes visited, 0 parse failures. Alias expansion hit its default budget (512), so some call paths stay unknown.
3. The live page was then observed in a headless browser at 24 scroll positions (screenshots plus DOM outline), after the preloader.

## Observations (with source)

| Area | What was observed | Source |
|---|---|---|
| Routes | `/` and `/cookie-policy` only: a single-page story | REA route inventory |
| Framework | Next.js (Turbopack chunks), React components, CSS modules | headers, bundle names |
| Smooth scroll | Lenis (virtual scroll, lerp, `scroll` events, resize observer) | REA events/listeners/timers in `1stl4ykwpf_a2.js` |
| WebGL | three.js `Points` with a custom `ShaderMaterial`, additive blending, `depthWrite: false` | same module, line 404 |
| Point data | Two binary point clouds fetched at start-up (a portrait and a country outline): per point x/y/z and a brightness value | REA `request` node; module source |
| Scroll stages | Uniforms `uMorph`…`uMorph5` driven by `scrollY / innerHeight`, eased with smoothstep: portrait → globe (Fibonacci sphere) → country → ribbon "works" strip → spiral/ring → frame around the contact email | module source; runtime screenshots |
| Section sync | The WebGL loop writes CSS variables (`--portrait-morph`, `--globe-ready`, …) that fade the HTML sections in and out | module source; computed styles at runtime |
| Pointer | The cloud turns towards the pointer and glows near it; idle sway when the pointer leaves | module source |
| Turbulence | Scroll velocity feeds a turbulence uniform | module source |
| Preloader | Percent counter, scroll locked, particles held in a ring, then released; skipped via `sessionStorage` and for reduced motion | module source (`preloader-shown`) |
| Text | Hero name split into letters; statements split into words and revealed | DOM outline |
| Look | Dark charcoal background (`#222124`), off-white text, small mono-ish labels, Inter Tight | computed styles |

## What this site does (design choices)

- Same storytelling model: one fixed WebGL canvas behind HTML sections, Lenis smooth scrolling, scroll position → stage value → shader morph, CSS variables for section visibility, a preloader, letter and word reveals, pointer-reactive hero.
- Original stages for a security professional: **fingerprint** (or an uploaded portrait) → **globe** with a circular caption → the **city name** drawn in particles → a **shield** with certifications → a **double helix** with a sliding list of selected work → **spiral** → a **frame** around the contact email.
- Stage progress comes from the real section positions rather than fixed multiples of the viewport, so sections can be added or resized from the admin panel.
- All shapes are generated in the browser (procedural geometry, or text/emblems sampled from a canvas). An uploaded portrait is converted to points in the admin panel and stored on the server as JSON.
- Accessibility: `prefers-reduced-motion` skips the preloader, disables smooth scrolling and shows final states; all text is real HTML; the canvas is `aria-hidden`.
