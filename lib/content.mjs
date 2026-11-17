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
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

export function validateContent(c, seed, strict = false) {
  if (!c || typeof c !== "object") throw bad("Content must be an object");
  const g = (o, k) => (o && typeof o[k] === "object" && o[k] ? o[k] : {});
  const S = seed;
  const site = g(c, "site"), theme = g(site, "theme"), hero = g(c, "hero"), st = g(c, "statement"), globe = g(c, "globe"), loc = g(c, "location");
  const appr = g(c, "approach"), works = g(c, "works"), contact = g(c, "contact"), footer = g(c, "footer"), portrait = g(c, "portrait");
  const email = str(contact.email, 120, S.contact.email).trim();
  if (strict && email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) throw bad("Contact email doesn't look like an email address");
  return {
    version: 1,
    updatedAt: str(c.updatedAt, 40) || null,
    site: { title: str(site.title, 120, S.site.title), description: str(site.description, 300, S.site.description),
      theme: { bg: color(theme.bg, S.site.theme.bg), fg: color(theme.fg, S.site.theme.fg), muted: color(theme.muted, S.site.theme.muted), particle: color(theme.particle, S.site.theme.particle), accent: color(theme.accent, S.site.theme.accent) } },
    hero: { firstName: str(hero.firstName, 40, S.hero.firstName), lastName: str(hero.lastName, 40, S.hero.lastName), role: str(hero.role, 80, S.hero.role), scrollHint: str(hero.scrollHint, 60, S.hero.scrollHint) },
    statement: { text: str(st.text, 600, S.statement.text) },
    globe: { ringTop: str(globe.ringTop, 60, S.globe.ringTop), ringBottom: str(globe.ringBottom, 60, S.globe.ringBottom) },
    location: { label: str(loc.label, 80, S.location.label) },
    approach: { text: str(appr.text, 600, S.approach.text) },
    works: { kicker: str(works.kicker, 60, S.works.kicker), closingLine: str(works.closingLine, 140, S.works.closingLine),
      items: list(works.items, 24).map((x, i) => ({ title: str(x?.title, 80).trim(), year: str(x?.year, 12), role: str(x?.role, 60), description: str(x?.description, 400),
        url: url(x?.url, `Work "${str(x?.title, 80)}"`, strict), tags: list(x?.tags, 6).map((t) => str(String(t), 24)).filter(Boolean) })).filter((x) => x.title) },
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
