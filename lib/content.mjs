// Content validation: every field is typed, length-capped and merged over the seed defaults,
// so a partial or hand-edited document can never break the page.
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const str = (v, max, d = "") => (typeof v === "string" ? v.slice(0, max) : d);
const COLOR = /^#[0-9a-f]{6}$/i;
const color = (v, d) => (COLOR.test(v || "") ? v : d);

// Links must be http(s) or mailto. In strict mode (admin saves) a bad link is an error; otherwise it is dropped.
function url(v, where, strict) {
  const s = str(v, 500).trim(); if (!s) return "";
  if (/^(https?:\/\/[^\s<>"]+|mailto:[^\s<>"]+)$/i.test(s)) return s;
  if (strict) throw bad(`${where}: link must start with https://, http:// or mailto:`);
  return "";
}
// Thumbnails are site images (/img/...) or admin uploads (/media/...); anything else is dropped.
const thumb = (v) => (/^\/(img\/works|media)\/[\w.-]+\.(jpe?g|png|webp)$/i.test(v || "") ? v : "");
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const num = (v, min, max, d) => (typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const oneOf = (v, opts, d) => (opts.includes(v) ? v : d);

// Four fixed themes; "kind" decides the blending of the particles and which options apply (night maps are dark-only).
export const THEME_KINDS = { dark: "dark", light: "light", whiteneon: "light", neon: "dark", matrix: "dark", galaxy: "dark" };
const THEME_IDS = Object.keys(THEME_KINDS);
const COLOR_KEYS = ["bg", "fg", "muted", "particle", "particle2", "particle3", "accent", "cityLight"];
function validateThemes(t, legacy, S) {
  const g = (o, k) => (o && typeof o[k] === "object" && o[k] ? o[k] : {});
  const fresh = !t || typeof t !== "object" || !t.list; t = fresh ? {} : t;
  // selection "fixed" shows the default theme; "auto" rotates through the enabled themes every `interval` seconds.
  // mode "particle" | "gaseous" | "auto" (alternates every `modeInterval` seconds). Visitors can't change either.
  const out = { default: oneOf(t.default, THEME_IDS, S.default), selection: oneOf(t.selection, ["fixed", "auto"], S.selection), mode: oneOf(t.mode, ["particle", "gaseous", "galaxy", "auto"], S.mode),
    interval: Math.round(num(t.interval, 10, 86400, S.interval)), order: oneOf(t.order, ["sequence", "random"], S.order), modeInterval: Math.round(num(t.modeInterval, 10, 86400, S.modeInterval)),
    gasSize: num(t.gasSize, 0.5, 2, S.gasSize), gasFlow: num(t.gasFlow, 0, 3, S.gasFlow), galaxySwirl: num(t.galaxySwirl, 0, 2, S.galaxySwirl), galaxyWaves: num(t.galaxyWaves, 0, 2, S.galaxyWaves), galaxyDust: num(t.galaxyDust, 0, 0.4, S.galaxyDust), followSystem: bool(t.followSystem, S.followSystem), enabled: [], list: {} };
  for (const id of THEME_IDS) {
    const d = S.list[id], x = { ...g(t.list, id) };
    // content saved before themes existed: its single colour set becomes the Dark theme
    if (fresh && id === "dark" && legacy && typeof legacy === "object") for (const k of ["bg", "fg", "muted", "particle", "accent"]) if (COLOR.test(legacy[k] || "")) x[k] = legacy[k];
    const kind = THEME_KINDS[id], o = { kind, label: str(x.label, 30).trim() || d.label };
    for (const k of COLOR_KEYS) o[k] = color(x[k], d[k]);
    Object.assign(o, { style: oneOf(x.style, ["soft", "glow", "glyph"], d.style), gradient: bool(x.gradient, d.gradient), spectrum: bool(x.spectrum, d.spectrum), glow: num(x.glow, 0, 2, d.glow),
      nightMaps: kind === "dark" && bool(x.nightMaps, d.nightMaps), rain: bool(x.rain, d.rain), rainDensity: num(x.rainDensity, 0.1, 1, d.rainDensity),
      rainSpeed: num(x.rainSpeed, 0.2, 3, d.rainSpeed), transition: oneOf(x.transition, ["morph", "rain"], d.transition), text: oneOf(x.text, ["fade", "scramble"], d.text),
      textGlow: bool(x.textGlow, d.textGlow), mono: bool(x.mono, d.mono) });
    out.list[id] = o;
  }
  // themes added after the content was saved join the rotation
  const added = THEME_IDS.filter((id) => !fresh && !(t.list && t.list[id]));
  out.enabled = THEME_IDS.filter((id) => (Array.isArray(t.enabled) ? [...t.enabled, ...added] : S.enabled).includes(id));
  if (!out.enabled.includes(out.default)) out.enabled.unshift(out.default);
  out.enabled = THEME_IDS.filter((id) => out.enabled.includes(id));
  return out;
}

// Each map page: the drawn outline, NASA night imagery or an uploaded picture, shown as particles, a photo or both.
const mapImage = (v) => (/^\/media\/[\w.-]+\.(jpe?g|png|webp)$/i.test(v || "") ? v : "");
function mapCfg(m, d) {
  const image = mapImage(m.image); let source = oneOf(m.source, ["outline", "nasa", "custom"], d.source);
  if (source === "custom" && !image) source = d.source === "custom" ? "nasa" : d.source; // a custom map needs its picture
  return { source, view: oneOf(m.view, ["particles", "photo", "both"], d.view), mask: bool(m.mask, d.mask), invert: bool(m.invert, d.invert), image,
    pinX: num(m.pinX, 0, 1, d.pinX), pinY: num(m.pinY, 0, 1, d.pinY), photoOpacity: num(m.photoOpacity, 0.1, 1, d.photoOpacity) };
}

export function validateContent(c, seed, strict = false) {
  if (!c || typeof c !== "object") throw bad("Content must be an object");
  const g = (o, k) => (o && typeof o[k] === "object" && o[k] ? o[k] : {});
  const S = seed;
  const site = g(c, "site"), hero = g(c, "hero"), st = g(c, "statement"), globe = g(c, "globe"), loc = g(c, "location");
  const appr = g(c, "approach"), works = g(c, "works"), contact = g(c, "contact"), footer = g(c, "footer"), portrait = g(c, "portrait");
  const email = str(contact.email, 120, S.contact.email).trim();
  if (strict && email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw bad("Contact email doesn't look like an email address");
  return {
    version: 1,
    updatedAt: str(c.updatedAt, 40) || null,
    site: { title: str(site.title, 120, S.site.title), description: str(site.description, 300, S.site.description), themes: validateThemes(site.themes, site.theme, S.site.themes) },
    hero: { firstName: str(hero.firstName, 40, S.hero.firstName), lastName: str(hero.lastName, 40, S.hero.lastName), role: str(hero.role, 80, S.hero.role), scrollHint: str(hero.scrollHint, 60, S.hero.scrollHint) },
    statement: { text: str(st.text, 600, S.statement.text) },
    globe: { ringTop: str(globe.ringTop, 60, S.globe.ringTop), ringBottom: str(globe.ringBottom, 60, S.globe.ringBottom) },
    location: { fromLabel: str(loc.fromLabel, 60, S.location.fromLabel), basedLabel: str(loc.basedLabel, 60, S.location.basedLabel),
      maps: { india: mapCfg(g(g(loc, "maps"), "india"), S.location.maps.india), uae: mapCfg(g(g(loc, "maps"), "uae"), S.location.maps.uae) } },
    approach: { text: str(appr.text, 600, S.approach.text) },
    works: { kicker: str(works.kicker, 60, S.works.kicker), closingLine: str(works.closingLine, 140, S.works.closingLine),
      items: list(works.items, 24).map((x, i) => ({ title: str(x?.title, 80).trim(), year: str(x?.year, 12), role: str(x?.role, 60), description: str(x?.description, 400),
        url: url(x?.url, `Work "${str(x?.title, 80)}"`, strict), tags: list(x?.tags, 6).map((t) => str(String(t), 24)).filter(Boolean), thumb: thumb(x?.thumb) })).filter((x) => x.title) },
    contact: { kicker: str(contact.kicker, 60, S.contact.kicker), email, note: str(contact.note, 80, S.contact.note),
      links: list(contact.links, 8).map((x) => ({ label: str(x?.label, 30).trim(), url: url(x?.url, `Link "${str(x?.label, 30)}"`, strict) })).filter((x) => x.label && x.url) },
    footer: { text: str(footer.text, 120, S.footer.text), tip: str(footer.tip, 40, S.footer.tip) },
    portrait: { enabled: portrait.enabled === true, updatedAt: str(portrait.updatedAt, 40) || null, points: Number.isInteger(portrait.points) ? portrait.points : undefined },
  };
}

// Portrait point cloud produced by the admin panel: {v:1, n, p:[x,y,z ints, scaled x1000], l:[0..255]}.
export function validatePortrait(o) {
  if (!o || o.v !== 1) throw bad("Unsupported portrait format");
  const n = o.n;
  if (!Number.isInteger(n) || n < 500 || n > 40000) throw bad("Portrait must have between 500 and 40,000 points");
  if (!Array.isArray(o.p) || o.p.length !== n * 3 || !Array.isArray(o.l) || o.l.length !== n) throw bad("Portrait arrays don't match the point count");
  for (const x of o.p) if (!Number.isInteger(x) || x < -3000 || x > 3000) throw bad("Portrait coordinates out of range");
  for (const x of o.l) if (!Number.isInteger(x) || x < 0 || x > 255) throw bad("Portrait brightness out of range");
  return { v: 1, n, p: o.p, l: o.l };
}
