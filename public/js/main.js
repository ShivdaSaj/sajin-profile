// Builds the page from /api/content and drives the scroll story: Lenis smooth scrolling, a stage value
// derived from real section positions, section fades, text reveals and the particle system.
import Lenis from "/vendor/lenis.mjs";
import { createParticles } from "./particles.js";
import { createRain } from "./rain.js";
import { NASA_MAPS, outlineClip } from "./shapes.js";

const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") el.className = v; else if (k === "style") el.setAttribute("style", v); else el.setAttribute(k, v === true ? "" : v); }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const svg = (tag, attrs = {}, ...kids) => { const el = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); el.append(...kids); return el; };
// Letters are grouped per word so long names and roles can wrap between words.
const chars = (text, cls = "char") => { let i = 0; return text.split(/(\s+)/).filter(Boolean).map((w) => (/^\s+$/.test(w) ? " " : h("span", { class: "w" }, [...w].map((c) => h("span", { class: cls, style: `--i:${i++}` }, c))))); };
const words = (text) => text.split(/\s+/).filter(Boolean).flatMap((w, i) => [h("span", { class: "word", style: `--i:${i}` }, w), " "]);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const safeUrl = (u) => (/^(https?:|mailto:)/i.test(u || "") ? u : null);

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const TH = window.__spTheme; // set up by /js/theme-boot.js before first paint
let theme = null; // the active theme object

// ---------- text decode ("scramble") effect for themes that use it ----------
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789#$%&*+<>";
function scramble(el, dur = 420, delay = 0) {
  if (reducedMotion) return;
  const orig = (el.dataset.orig ??= el.textContent); cancelAnimationFrame(el._scr); clearTimeout(el._scrT);
  el._scrT = setTimeout(() => { const t0 = performance.now();
    const step = (t) => { const k = Math.min((t - t0) / dur, 1); let out = "";
      for (let i = 0; i < orig.length; i++) out += /\s/.test(orig[i]) || i < k * orig.length ? orig[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      el.textContent = k < 1 ? out : orig; if (k < 1) el._scr = requestAnimationFrame(step); };
    el._scr = requestAnimationFrame(step); }, delay);
}
const scrambling = () => theme?.text === "scramble" && !reducedMotion;
const scrambleChars = (root, gap = 26) => $$(".char, .echar", root).forEach((c, i) => scramble(c, 380, i * gap));
const coarse = matchMedia("(pointer: coarse)").matches;

function render(c) {
  const name = `${c.hero.firstName} ${c.hero.lastName}`.trim();
  $("#barName").textContent = name; $("#barContact").textContent = c.contact.kicker;
  const works = c.works.items;
  const pad = (n) => String(n).padStart(2, "0");
  $("#main").replaceChildren(
    h("section", { class: "s s-hero", id: "top", "data-stage": "0" },
      h("div", { class: "sticky" },
        h("h1", { class: "hero-title" }, h("span", { class: "hero-name", "aria-label": name }, chars(name)), h("span", { class: "hero-role", "aria-label": c.hero.role }, chars(c.hero.role))),
        h("p", { class: "hint" }, h("span", { class: "hint-line" }), c.hero.scrollHint))),
    h("section", { class: "s s-statement", "data-stage": "1", "data-len": "1.3" },
      h("div", { class: "sticky" }, h("p", { class: "statement reveal-words" }, words(c.statement.text)))),
    h("section", { class: "s s-globe", "data-stage": "2", "data-len": "1.25" },
      h("div", { class: "sticky" },
        h("div", { class: "ring", "aria-hidden": "true" }, svg("svg", { viewBox: "0 0 400 400" },
          svg("defs", {}, svg("path", { id: "ringPath", d: "M200,200 m-176,0 a176,176 0 1,1 352,0 a176,176 0 1,1 -352,0" })),
          svg("text", {}, svg("textPath", { href: "#ringPath", startOffset: "57%", class: "scr" }, c.globe.ringTop)),
          svg("text", {}, svg("textPath", { href: "#ringPath", startOffset: "7%", class: "scr" }, c.globe.ringBottom)))),
        h("p", { class: "sr-only" }, `${c.globe.ringTop}. ${c.globe.ringBottom}.`),
        reducedMotion ? null : h("p", { class: "globe-hint", "aria-hidden": "true" }, "Drag to spin"))),
    h("section", { class: "s s-location s-india", "data-stage": "3", "data-len": "1.25" },
      h("div", { class: "sticky" }, mapPhoto(c, "india"), h("p", { class: `map-label from${c.location.maps.india.view !== "particles" ? " on-photo" : ""}`, id: "mapFrom" }, h("i", { class: "pin" }), h("span", { class: "scr" }, c.location.fromLabel)))),
    h("section", { class: "s s-location s-uae", "data-stage": "4", "data-len": "1.25" },
      h("div", { class: "sticky" }, mapPhoto(c, "uae"), h("p", { class: `map-label based${c.location.maps.uae.view !== "particles" ? " on-photo" : ""}`, id: "mapBased" }, h("i", { class: "pin" }), h("span", { class: "scr" }, c.location.basedLabel)))),
    h("section", { class: "s s-approach", "data-stage": "5", "data-len": "1.25" },
      h("div", { class: "sticky" }, h("p", { class: "statement small approach reveal-words" }, words(c.approach.text)))),
    h("section", { class: "s s-works", "data-stage": "6", id: "work" },
      h("div", { class: "sticky" },
        h("div", { class: "works-head" }, h("p", { class: "kicker scr" }, c.works.kicker), h("p", { class: "works-count" }, h("span", { id: "workIdx" }, "01"), ` / ${pad(works.length)}`)),
        h("ol", { class: "track", id: "track" }, works.map((w, i) => { const href = safeUrl(w.url);
          return h("li", { class: "work" }, h(href ? "a" : "div", { class: "work-link", href, target: href && !href.startsWith("mailto:") ? "_blank" : null, rel: href ? "noopener" : null },
            h("span", { class: "work-thumb" }, w.thumb ? h("img", { src: w.thumb, alt: "", loading: "lazy", decoding: "async", width: "800", height: "500" }) : h("span", { class: "work-thumb-empty" }, w.title.slice(0, 1))),
            h("span", { class: "work-idx" }, pad(i + 1)), h("span", { class: "work-title" }, w.title),
            h("span", { class: "work-meta" }, [w.role, w.year].filter(Boolean).join(" · ")),
            w.description ? h("span", { class: "work-desc" }, w.description) : null,
            w.tags.length ? h("span", { class: "work-tags" }, w.tags.map((t) => h("i", {}, t))) : null)); })))),
    h("section", { class: "s s-closing", "data-stage": "7", "data-len": "1.15" },
      h("div", { class: "sticky" }, h("p", { class: "statement closing reveal-words" }, words(c.works.closingLine)))),
    h("section", { class: "s s-contact", "data-stage": "8", id: "contact" },
      h("div", { class: "contact" }, h("p", { class: "kicker scr" }, c.contact.kicker),
        h("a", { class: "email", id: "email", href: `mailto:${c.contact.email}` }, chars(c.contact.email, "echar")),
        c.contact.links.length ? h("p", { class: "links" }, c.contact.note, " ", c.contact.links.map((l, i) => [i ? h("span", { class: "dot" }, "·") : null, h("a", { href: safeUrl(l.url), target: "_blank", rel: "noopener" }, l.label)])) : null),
      h("footer", { class: "foot" }, h("span", { class: "foot-left" }, h("span", { class: "mono", "data-tip": c.footer.tip, tabindex: "0" }, initials(name)), `${c.footer.text} — © ${new Date().getFullYear()}`),
        h("a", { class: "foot-right", href: "#top" }, "Back to top ↑"))));
}
// ---------- map pictures (NASA night imagery or a custom picture) ----------
const mapSrc = (cfg, which) => (cfg.source === "nasa" ? NASA_MAPS[which].image : cfg.source === "custom" ? cfg.image : null);
function mapPhoto(c, which) {
  const cfg = c.location.maps[which], src = mapSrc(cfg, which); if (!src) return null;
  const nasa = cfg.source === "nasa";
  return [cfg.view === "particles" ? null : h("img", { class: `map-photo${nasa && cfg.mask ? " clipped" : ""}`, id: `photo-${which}`, src, alt: "", decoding: "async", "data-op": cfg.photoOpacity,
      style: nasa && cfg.mask ? `clip-path:${outlineClip(which)}` : null }),
    nasa ? h("p", { class: "map-credit" }, "Night imagery: NASA Earth Observatory, Black Marble") : null];
}
const loadImage = (src) => new Promise((ok) => { if (!src) return ok(null); const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; setTimeout(() => ok(null), 8000); });

const initials = (n) => n.split(/\s+/).map((w) => w[0] || "").join("").slice(0, 2).toUpperCase();

// ---------- scroll model ----------
let sections = [], anchors = [], vh = innerHeight;
function measure() {
  vh = innerHeight;
  const track = $("#track"), works = $(".s-works");
  if (track && works) { const extra = Math.max(0, track.scrollWidth - innerWidth); works.style.height = `${Math.round(extra + vh * 1.35)}px`; works.dataset.extra = extra; }
  sections = $$("section.s").map((el) => { const len = parseFloat(el.dataset.len || "0"); if (len && !el.classList.contains("s-works")) el.style.height = `${len * 100}vh`;
    const top = el.offsetTop, height = el.offsetHeight; return { el, top, height, stage: +el.dataset.stage }; });
  anchors = [];
  for (const s of sections) { if (s.height > vh * 1.3) anchors.push([s.top, s.stage], [s.top + s.height - vh, s.stage]); else anchors.push([s.top + (s.height - vh) / 2, s.stage]); }
  anchors.sort((a, b) => a[0] - b[0]);
}
function stageAt(y) {
  if (!anchors.length) return 0; if (y <= anchors[0][0]) return anchors[0][1];
  for (let i = 1; i < anchors.length; i++) { const [y1, s1] = anchors[i]; const [y0, s0] = anchors[i - 1]; if (y <= y1) return y1 === y0 ? s1 : s0 + ((y - y0) / (y1 - y0)) * (s1 - s0); }
  return anchors[anchors.length - 1][1];
}

function update(y, gl) {
  for (const s of sections) {
    // fade each section in as it arrives and out as it leaves
    const vis = clamp(Math.min((y - (s.top - vh * 0.55)) / (vh * 0.45), (s.top + s.height - vh * 0.35 - y) / (vh * 0.45)), 0, 1);
    s.el.style.setProperty("--vis", vis.toFixed(3));
    const arrived = vis > 0.5; if (arrived !== !!s.arrived) { s.arrived = arrived; if (arrived && scrambling()) $$(".scr", s.el).forEach((e, i) => scramble(e, 520, i * 90)); }
    const prog = clamp((y - s.top) / Math.max(s.height - vh, 1), 0, 1);
    s.el.style.setProperty("--prog", prog.toFixed(4));
    if (s.el.classList.contains("s-works")) {
      const extra = +s.el.dataset.extra || 0; const t = clamp((y - s.top - vh * 0.18) / Math.max(s.height - vh * 1.35, 1), 0, 1);
      $("#track").style.transform = `translate3d(${(-extra * t).toFixed(1)}px,0,0)`;
      const items = $$(".work"); const idx = clamp(Math.round(t * (items.length - 1)), 0, items.length - 1);
      $("#workIdx").textContent = String(idx + 1).padStart(2, "0");
    }
    for (const p of $$(".reveal-words", s.el)) { const ws = $$(".word", p); const lit = vis < 0.05 ? 0 : Math.round(clamp(prog * 1.6 + 0.15, 0, 1) * ws.length);
      if (+p.dataset.lit !== lit) { p.dataset.lit = lit; ws.forEach((w, i) => { const on = i < lit || reducedMotion; if (on && !w.classList.contains("on") && scrambling()) scramble(w, 360); w.classList.toggle("on", on); }); } }
  }
  const ring = $(".ring svg"); if (ring) ring.style.transform = `rotate(${(((gl?.state.globeAngle || 0) * 180) / Math.PI + y * 0.03) % 360}deg)`;
  document.documentElement.style.setProperty("--bar", clamp((y - vh * 0.6) / (vh * 0.4), 0, 1).toFixed(3));
  const contact = $(".s-contact"); if (contact) { const inView = y + vh * 0.75 > contact.offsetTop;
    if (inView && !contact.classList.contains("in") && scrambling()) scrambleChars($("#email"), 18); contact.classList.toggle("in", inView); }
  if (gl) { gl.state.stage = stageAt(y); const e = $("#email"); if (e) gl.state.rect = e.getBoundingClientRect();
    // pin the map labels to India and the UAE as the map moves
    // anchors are viewport px; each label lives in its own section's sticky box
    const pin = (el, pt) => { if (!el || !pt) return; const top = el.parentElement.getBoundingClientRect().top;
      el.style.transform = `translate3d(${pt.x.toFixed(1)}px,${(pt.y - top).toFixed(1)}px,0)`; };
    const [ind, uae] = gl.state.anchors || []; pin($("#mapFrom"), ind); pin($("#mapBased"), uae);
    // map photos follow the particle map's position and scale
    ["india", "uae"].forEach((which, i) => { const el = document.getElementById(`photo-${which}`), rc = gl.state.mapRects?.[i]; if (!el || !rc) return;
      const top = el.parentElement.getBoundingClientRect().top, vis = +el.closest("section").style.getPropertyValue("--vis") || 0;
      el.style.transform = `translate3d(${rc.l.toFixed(1)}px,${(rc.t - top).toFixed(1)}px,0)`; el.style.width = `${rc.w.toFixed(1)}px`; el.style.height = `${rc.h.toFixed(1)}px`;
      el.style.opacity = (vis * (+el.dataset.op || 1)).toFixed(3); }); }
}

// ---------- preloader ----------
function runPreloader(gl, lenis) {
  const pre = $("#preloader"), count = $("#count"); let seen = false;
  try { seen = sessionStorage.getItem("sp-preloaded") === "1"; } catch { /* storage blocked */ }
  const finish = () => { document.body.classList.remove("is-loading"); document.body.classList.add("is-ready"); pre.remove(); lenis?.start(); if (scrambling()) scrambleChars($(".hero-title"), 30); };
  if (reducedMotion) { if (gl) { gl.state.formation = 1; gl.state.ring = 0; } finish(); return; }
  const form = (dur) => { if (!gl) return; const t0 = performance.now(); const step = (t) => { const k = Math.min((t - t0) / dur, 1); gl.state.formation = k; if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  if (seen || !gl) { if (gl) gl.state.ring = 0; form(2200); setTimeout(finish, 300); return; }
  lenis?.stop(); scrollTo(0, 0); gl.state.ring = 1; gl.state.formation = 1;
  const t0 = performance.now(), D = 2300;
  const tick = (t) => { const k = Math.min((t - t0) / D, 1), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; count.textContent = `${Math.round(e * 100)}%`;
    if (k < 1) return requestAnimationFrame(tick);
    pre.classList.add("out"); const r0 = performance.now();
    const release = (t2) => { const q = Math.min((t2 - r0) / 1800, 1); gl.state.ring = 1 - (q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2); if (q < 1) requestAnimationFrame(release); else gl.state.ring = 0; };
    requestAnimationFrame(release); setTimeout(finish, 900); try { sessionStorage.setItem("sp-preloaded", "1"); } catch { /* ignore */ } };
  requestAnimationFrame(tick);
}

// ---------- cursor ----------
function cursor() {
  const c = $("#cursor"); if (coarse || reducedMotion) { c.remove(); return; }
  let x = -100, y = -100, cx = x, cy = y;
  addEventListener("pointermove", (e) => { x = e.clientX; y = e.clientY; c.classList.toggle("on-link", !!e.target.closest?.("a,button")); }, { passive: true });
  const loop = () => { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; c.style.transform = `translate3d(${cx}px,${cy}px,0)`; requestAnimationFrame(loop); }; loop();
}

async function boot() {
  let content;
  try { content = await (await fetch("/api/content", { cache: "no-cache" })).json(); }
  catch { $("#main").replaceChildren(h("p", { class: "noscript" }, "Could not load the page content. Please refresh.")); document.body.classList.remove("is-loading"); return; }
  document.title = content.site.title;
  const T = content.site.themes; theme = TH ? TH.theme : T.list[T.default];
  render(content);
  let portrait = null;
  if (content.portrait?.enabled) portrait = await fetch("/api/portrait", { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  await document.fonts?.load?.("800 100px Inter").catch(() => {});
  const maps = {}; await Promise.all(["india", "uae"].map(async (w) => { const cfg = content.location.maps[w]; maps[w] = { cfg, img: await loadImage(mapSrc(cfg, w)) }; }));
  const gl = createParticles($("#gl"), { maps, theme, mode: TH ? TH.mode : T.mode === "auto" ? "particle" : T.mode, gas: { size: T.gasSize, flow: T.gasFlow }, galaxy: { swirl: T.galaxySwirl, waves: T.galaxyWaves, dust: T.galaxyDust }, portraitData: portrait, reducedMotion, coarse });
  if (!gl) document.body.classList.add("no-webgl");
  const rain = createRain($("#rain"), { reducedMotion }); rain.set(theme);
  TH?.on((id, t) => { theme = t; gl?.setTheme(t, true); rain.set(t);
    if (scrambling()) { scrambleChars($(".hero-title"), 14); $$(".scr").forEach((e) => scramble(e, 520)); } });
  TH?.onMode((m) => gl?.setMode(m, true));
  const lenis = reducedMotion ? null : new Lenis({ lerp: 0.13, wheelMultiplier: 1, autoRaf: false });
  window.__lenis = lenis;
  measure();
  let lastY = scrollY, lastT = performance.now();
  const raf = (t) => { lenis?.raf(t); const y = lenis ? lenis.animatedScroll : scrollY; const v = ((y - lastY) / Math.max(t - lastT, 1)) * 1000; if (gl) gl.state.velocity = v; rain.boost = Math.max(rain.boost, Math.min(Math.abs(v) / 1200, 3)); lastY = y; lastT = t; update(y, gl); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  addEventListener("resize", () => { measure(); lenis?.resize(); });
  new ResizeObserver(() => measure()).observe($("#main"));
  for (const a of $$('a[href^="#"]')) a.addEventListener("click", (e) => { const t = $(a.getAttribute("href")); if (!t) return; e.preventDefault(); lenis ? lenis.scrollTo(t, { duration: 2 }) : t.scrollIntoView(); });
  cursor();
  runPreloader(gl, lenis);
}
boot();
