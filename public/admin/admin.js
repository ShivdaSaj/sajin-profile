// Profile admin: edit every page of the site, upload a portrait (converted to particles), manage backups.
import { imageToPoints } from "/js/shapes.js";

const $ = (s, r = document) => r.querySelector(s);
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k === "class") el.className = v; else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v); else if (k === "value") el.value = v; else if (k === "checked") el.checked = !!v; else el.setAttribute(k, v === true ? "" : v); }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const mount = (el, ...kids) => el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
function toast(msg, err = false) { const t = $("#toast"); t.textContent = msg; t.classList.toggle("err", err); t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), err ? 4000 : 2200); }
const api = async (path, opts = {}) => { const r = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", "X-Requested-With": "sajin-profile", ...(opts.headers || {}) } });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); return j; };

let c = null, dirty = false, section = "hero";
addEventListener("beforeunload", (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } });
const markDirty = () => { dirty = true; drawTop(); };

// ---------- fields ----------
const field = (label, input, help, full) => h("label", { class: `field${full ? " full" : ""}` }, h("span", { class: "fl" }, label), input, help ? h("small", {}, help) : null);
const text = (obj, key, opts = {}) => h(opts.area ? "textarea" : "input", { type: opts.type || "text", rows: opts.area ? opts.rows || 4 : null, maxlength: opts.max, placeholder: opts.placeholder,
  value: opts.area ? null : obj[key] ?? "", oninput: (e) => { obj[key] = e.target.value; markDirty(); opts.on?.(); } }, opts.area ? obj[key] ?? "" : null);
const color = (obj, key) => { const hex = h("input", { type: "text", value: obj[key], maxlength: 7, class: "hex", oninput: (e) => { if (/^#[0-9a-f]{6}$/i.test(e.target.value)) { obj[key] = e.target.value; pick.value = e.target.value; markDirty(); } } });
  const pick = h("input", { type: "color", value: obj[key], oninput: (e) => { obj[key] = e.target.value; hex.value = e.target.value; markDirty(); } }); return h("span", { class: "color" }, pick, hex); };
const check = (obj, key, label, on) => h("label", { class: "check" }, h("input", { type: "checkbox", checked: !!obj[key], onchange: (e) => { obj[key] = e.target.checked; markDirty(); on?.(); } }), label);
const select = (obj, key, options) => h("select", { onchange: (e) => { obj[key] = e.target.value; markDirty(); } }, options.map(([v, l]) => { const o = h("option", { value: v }, l); o.selected = obj[key] === v; return o; }));
const range = (obj, key, min, max, step) => { const out = h("output", {}, String(obj[key]));
  return h("span", { class: "range" }, h("input", { type: "range", min, max, step, value: obj[key], oninput: (e) => { obj[key] = +e.target.value; out.textContent = e.target.value; markDirty(); } }), out); };
const panel = (title, intro, ...body) => h("section", { class: "panel" }, h("h2", {}, title), intro ? h("p", { class: "intro" }, intro) : null, ...body);
const grid = (...k) => h("div", { class: "grid" }, ...k);

// A reorderable list editor for works and links.
function listEditor(arr, make, render, label) {
  const box = h("div", { class: "list" });
  const draw = () => mount(box, arr.map((item, i) => h("div", { class: "item" },
    h("div", { class: "item-head" }, h("b", {}, `${i + 1}. ${item.title || item.label || "(untitled)"}`), h("span", { class: "spacer" }),
      h("button", { type: "button", class: "ib", "aria-label": "Move up", disabled: !i, onclick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); draw(); } }, "↑"),
      h("button", { type: "button", class: "ib", "aria-label": "Move down", disabled: i === arr.length - 1, onclick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); draw(); } }, "↓"),
      h("button", { type: "button", class: "ib danger", "aria-label": "Remove", onclick: () => { if (confirm("Remove this entry?")) { arr.splice(i, 1); markDirty(); draw(); } } }, "✕")),
    render(item, draw))), h("button", { type: "button", class: "btn", onclick: () => { arr.push(make()); markDirty(); draw(); } }, `+ Add ${label}`));
  draw(); return box;
}

// Thumbnail: resized and re-encoded to an 800x500 JPEG in the browser, then uploaded.
function thumbEditor(w) {
  const box = h("div", { class: "thumb-edit" });
  const draw = () => mount(box, w.thumb ? h("img", { src: w.thumb, alt: "", class: "thumb-prev" }) : h("div", { class: "thumb-prev empty" }, "No thumbnail"),
    h("div", { class: "actions" }, h("label", { class: "btn sm" }, w.thumb ? "Replace…" : "Upload…", h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", hidden: true, onchange: async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { const img = new Image(); const u = URL.createObjectURL(f); img.src = u; await img.decode(); URL.revokeObjectURL(u);
          const cv = document.createElement("canvas"); cv.width = 800; cv.height = 500; const x = cv.getContext("2d");
          const sc = Math.max(800 / img.naturalWidth, 500 / img.naturalHeight), dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
          x.drawImage(img, (800 - dw) / 2, 0, dw, dh); // cover, anchored to the top like a page screenshot
          const r = await api("/api/admin/media", { method: "POST", body: JSON.stringify({ data: cv.toDataURL("image/jpeg", 0.84) }) });
          w.thumb = r.url; markDirty(); draw(); toast("Thumbnail uploaded. Save to publish it.");
        } catch (x) { toast(`Upload failed: ${x.message}`, true); } } })),
      w.thumb ? h("button", { type: "button", class: "btn sm", onclick: () => { w.thumb = ""; markDirty(); draw(); } }, "Remove") : null));
  draw(); return box;
}

// ---------- sections ----------
const SECTIONS = [
  ["hero", "1 · Hero"], ["portrait", "Portrait particles"], ["statement", "2 · Statement"], ["globe", "3 · Globe"], ["location", "4 & 5 · Maps"],
  ["approach", "6 · How I work"], ["works", "7 · Selected works"], ["contact", "8 · Contact & footer"], ["themes", "Themes & effects"], ["site", "Site"], ["security", "Admin password"], ["backups", "Backups"],
];
function draw() {
  drawTop();
  mount($("#side"), SECTIONS.map(([id, label]) => h("button", { type: "button", class: section === id ? "on" : "", onclick: () => { section = id; draw(); scrollTo(0, 0); } }, label)));
  const m = $("#main");
  const views = {
    hero: () => panel("Hero", "The first screen: your name on the left and your role on the right, over the particle portrait.",
      grid(field("First name", text(c.hero, "firstName", { max: 40 })), field("Last name", text(c.hero, "lastName", { max: 40 })),
        field("Role", text(c.hero, "role", { max: 80 })), field("Scroll hint", text(c.hero, "scrollHint", { max: 60 })))),
    portrait: drawPortrait,
    statement: () => panel("Statement", "Revealed word by word while the portrait turns away.", field("Text", text(c.statement, "text", { area: true, max: 600 }), null, true)),
    globe: () => panel("Globe", "Two captions ride a ring around the spinning globe.", grid(field("Top caption", text(c.globe, "ringTop", { max: 60 })), field("Bottom caption", text(c.globe, "ringBottom", { max: 60 })))),
    location: () => panel("Maps", "Two pages: page 4 draws India, page 5 a zoomed-in map of the UAE. Each label is pinned to its map (the UAE label sits on Abu Dhabi).",
      grid(field("Page 4 label (on India)", text(c.location, "fromLabel", { max: 60 })), field("Page 5 label (on the UAE)", text(c.location, "basedLabel", { max: 60 })))),
    approach: () => panel("How I work", "Shown beside the diagonal particle ribbon, revealed word by word.", field("Text", text(c.approach, "text", { area: true, max: 600 }), null, true)),
    works: () => panel("Selected works", "These slide along the ribbon as visitors scroll. Hovering shows the description and tags.",
      grid(field("Heading", text(c.works, "kicker", { max: 60 })), field("Closing line (shown with the spiral)", text(c.works, "closingLine", { max: 140 }))),
      listEditor(c.works.items, () => ({ title: "New project", year: String(new Date().getFullYear()), role: "", description: "", url: "", tags: [] }),
        (w, redraw) => grid(field("Title", text(w, "title", { max: 80, on: () => {} })), field("Year", text(w, "year", { max: 12 })), field("Role", text(w, "role", { max: 60 })),
          field("Link", text(w, "url", { type: "url", max: 500, placeholder: "https://…" })),
          field("Thumbnail", thumbEditor(w), "Shown above the title. 16:10 works best; images are resized to 800×500.", true),
          field("Description", text(w, "description", { area: true, rows: 3, max: 400 }), null, true),
          field("Tags (comma separated)", h("input", { type: "text", value: (w.tags || []).join(", "), oninput: (e) => { w.tags = e.target.value.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 6); markDirty(); } }), null, true)), "project")),
    contact: () => [panel("Contact", "The particles draw a frame around your email.",
      grid(field("Heading", text(c.contact, "kicker", { max: 60 })), field("Email", text(c.contact, "email", { type: "email", max: 120 })), field("Text before links", text(c.contact, "note", { max: 80 }))),
      listEditor(c.contact.links, () => ({ label: "New link", url: "https://" }), (l) => grid(field("Label", text(l, "label", { max: 30 })), field("URL", text(l, "url", { type: "url", max: 500 }))), "link")),
      panel("Footer", null, grid(field("Footer text", text(c.footer, "text", { max: 120 })), field("Tooltip on the monogram", text(c.footer, "tip", { max: 40 }))))],
    site: () => panel("Site", "Browser title and search description. Colours live under Themes & effects.",
      grid(field("Title", text(c.site, "title", { max: 120 }), null, true), field("Description", text(c.site, "description", { area: true, rows: 2, max: 300 }), null, true))),
    themes: drawThemes,
    security: drawSecurity,
    backups: drawBackups,
  };
  const v = views[section](); mount(m, v instanceof Promise ? h("p", {}, "Loading…") : v);
  if (v instanceof Promise) v.then((x) => mount(m, x));
}

// Portrait: the image is converted to points in the browser; only the points are uploaded.
function drawPortrait() {
  const opts = { count: 22000, removeBackground: true, tolerance: 0.045, gamma: 1.2 }; let img = null, pts = null;
  const cv = h("canvas", { width: 420, height: 420, class: "preview", "aria-label": "Particle preview" });
  const info = h("p", { class: "intro" }, c.portrait.enabled ? `A portrait is active (${c.portrait.points?.toLocaleString() || "?"} points, updated ${String(c.portrait.updatedAt || "").slice(0, 10)}).` : "No portrait yet: the hero shows a generic silhouette.");
  const paint = () => { const x = cv.getContext("2d"); x.fillStyle = c.site.themes.list.dark.bg; x.fillRect(0, 0, cv.width, cv.height); if (!pts) return;
    x.fillStyle = c.site.themes.list.dark.particle; for (let i = 0; i < pts.n; i++) { x.globalAlpha = 0.25 + 0.75 * (pts.l[i] / 255); x.fillRect(210 + pts.p[3 * i] / 1000 * 190, 210 - pts.p[3 * i + 1] / 1000 * 190, 1.2, 1.2); } x.globalAlpha = 1; };
  const regen = () => { if (!img) return; pts = imageToPoints(img, opts); paint(); stat.textContent = `${pts.n.toLocaleString()} points`; };
  const stat = h("small", {});
  const file = h("input", { type: "file", accept: "image/*", onchange: (e) => { const f = e.target.files[0]; if (!f) return; const u = URL.createObjectURL(f); img = new Image(); img.onload = () => { regen(); URL.revokeObjectURL(u); }; img.src = u; } });
  const range = (key, label, min, max, step) => field(`${label}`, h("input", { type: "range", min, max, step, value: opts[key], oninput: (e) => { opts[key] = +e.target.value; regen(); } }));
  paint();
  return panel("Portrait particles", "Upload a head-and-shoulders photo on a plain background (white or dark both work). It is turned into particles in your browser and only the points are stored. Raise the background tolerance if bits of background remain; lower it if your shirt or face start to disappear.",
    info, h("div", { class: "portrait" }, cv, h("div", { class: "pcontrols" }, field("Photo", file), stat,
      range("tolerance", "Background tolerance", 0.01, 0.3, 0.005), range("gamma", "Contrast", 0.5, 3, 0.1), range("count", "Particles", 6000, 30000, 1000),
      h("label", { class: "check" }, h("input", { type: "checkbox", checked: true, onchange: (e) => { opts.removeBackground = e.target.checked; regen(); } }), "Remove background (colour detected from the photo's edges)"),
      h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: async () => { if (!pts) return toast("Choose a photo first", true); if (pts.n < 500) return toast("Too few points: lower the cut-off", true);
          try { const r = await api("/api/admin/portrait", { method: "PUT", body: JSON.stringify(pts) }); c.portrait = { enabled: true, points: r.points, updatedAt: new Date().toISOString() }; toast("Portrait saved. It's live now."); draw(); } catch (e) { toast(e.message, true); } } }, "Use this portrait"),
        c.portrait.enabled ? h("button", { type: "button", class: "btn", onclick: async () => { if (!confirm("Remove the portrait and go back to the silhouette?")) return; try { await api("/api/admin/portrait", { method: "DELETE" }); c.portrait = { enabled: false }; toast("Portrait removed"); draw(); } catch (e) { toast(e.message, true); } } }, "Remove portrait") : null))));
}

// Themes: which ones visitors can pick, the default, and every colour and effect of each theme.
const THEME_HELP = { dark: "The original look.", light: "Dark particles on a light page.", neon: "Black page, glowing cyan and magenta particles, glowing text.", matrix: "Code rain behind the page, particles drawn as code glyphs that rain between pages, text that decodes itself." };
function drawThemes() {
  const T = c.site.themes, ids = Object.keys(T.list);
  const box = h("div", { class: "list" });
  const redraw = () => mount(box, ids.map((id) => themeCard(id)));
  function themeCard(id) {
    const t = T.list[id], dark = t.kind === "dark", isDefault = T.default === id, enabled = T.enabled.includes(id);
    const toggle = h("label", { class: "check" }, h("input", { type: "checkbox", checked: enabled, disabled: isDefault, onchange: (e) => {
      T.enabled = e.target.checked ? ids.filter((x) => x === id || T.enabled.includes(x)) : T.enabled.filter((x) => x !== id); markDirty(); redraw(); } }), isDefault ? "Enabled (default)" : "Visitors can pick it");
    return h("div", { class: `item theme-card${enabled ? "" : " off"}` },
      h("div", { class: "item-head" }, h("i", { class: "swatch", style: `--a:${t.bg};--b:${t.particle};--c:${t.particle2}` }), h("b", {}, t.label), h("small", { class: "kind" }, t.kind), h("span", { class: "spacer" }), toggle,
        h("a", { class: "btn sm", href: `/?theme=${id}`, target: "_blank", rel: "noopener", title: "Shows the saved version of this theme" }, "Preview ↗")),
      h("p", { class: "intro" }, THEME_HELP[id]),
      h("h3", {}, "Colours"),
      grid(field("Name in the switcher", text(t, "label", { max: 30 })), field("Background", color(t, "bg")), field("Text", color(t, "fg")), field("Muted text", color(t, "muted")),
        field("Particles", color(t, "particle")), field("Second particle colour", color(t, "particle2"), "Used by the gradient, glyph heads and rain heads"), field("Accent", color(t, "accent")),
        dark ? field("City lights (night maps)", color(t, "cityLight")) : null),
      h("h3", {}, "Particles"),
      grid(field("Particle style", select(t, "style", [["soft", "Soft dots"], ["glow", "Neon glow"], ["glyph", "Code glyphs"]])),
        field("Glow strength", range(t, "glow", 0, 2, 0.1), "Pointer glow on the portrait, and the neon halo"),
        field("Transition between pages", select(t, "transition", [["morph", "Morph (particles drift into the next shape)"], ["rain", "Code rain (particles fall, then re-form)"]])),
        h("div", { class: "checks" }, check(t, "gradient", "Colour gradient across the particles"), dark ? check(t, "nightMaps", "Night-view maps: India and the UAE drawn as city lights at night") : null)),
      h("h3", {}, "Page effects"),
      grid(field("Text effect", select(t, "text", [["fade", "Fade in"], ["scramble", "Decode (letters scramble into place)"]])),
        h("div", { class: "checks" }, check(t, "textGlow", "Glowing text"), check(t, "mono", "Monospace font"), check(t, "rain", "Digital rain in the background")),
        field("Rain density", range(t, "rainDensity", 0.1, 1, 0.05)), field("Rain speed", range(t, "rainSpeed", 0.2, 3, 0.1))));
  }
  redraw();
  const def = h("select", { onchange: (e) => { T.default = e.target.value; if (!T.enabled.includes(T.default)) T.enabled = ids.filter((x) => x === T.default || T.enabled.includes(x)); markDirty(); redraw(); } },
    ids.map((id) => { const o = h("option", { value: id }, T.list[id].label); o.selected = T.default === id; return o; }));
  return [panel("Themes & effects", "Visitors see the default theme first and can switch with the button at the top right of the page; their choice is remembered on their device. Previews show the last saved version, so save first.",
    grid(field("Default theme", def), h("div", { class: "checks" }, check(T, "switcher", "Show the theme switcher to visitors"), check(T, "followSystem", "Follow the visitor's light/dark system setting until they pick a theme")))),
    panel("Themes", null, box)];
}

// Admin password: the .env ADMIN_PASSWORD, a password set here, or both.
async function drawSecurity() {
  let info = await api("/api/admin/auth");
  const cur = h("input", { type: "password", autocomplete: "current-password", placeholder: "Current password" });
  const pw1 = h("input", { type: "password", autocomplete: "new-password", placeholder: "At least 12 characters", minlength: 12, maxlength: 200 });
  const pw2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "Repeat the new password" });
  const show = h("label", { class: "check" }, h("input", { type: "checkbox", onchange: (e) => { for (const i of [pw1, pw2]) i.type = e.target.checked ? "text" : "password"; } }), "Show");
  const gen = h("button", { type: "button", class: "btn sm", onclick: () => { const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!@#%+="; const b = crypto.getRandomValues(new Uint32Array(24));
    pw1.value = pw2.value = Array.from(b, (x) => A[x % A.length]).join(""); for (const i of [pw1, pw2]) i.type = "text"; show.querySelector("input").checked = true; toast("Generated. Copy it somewhere safe before saving."); } }, "Generate strong password");
  let mode = info.mode;
  const modes = [["env", "Only the .env password", "ADMIN_PASSWORD from the server environment."], ["panel", "Only the panel password", "Overrides the .env password, which stops working."], ["both", "Either password", "The .env password and the panel password both sign in."]];
  const radios = h("div", { class: "modes" }, modes.map(([v, l, d]) => h("label", { class: "mode" }, h("input", { type: "radio", name: "mode", value: v, checked: mode === v, disabled: (v !== "panel" && !info.envPassword), onchange: () => (mode = v) }), h("span", {}, h("b", {}, l), h("small", {}, d)))));
  const err = h("p", { class: "err", role: "alert" });
  const status = () => h("ul", { class: "facts" },
    h("li", {}, "In use now: ", h("b", {}, { env: ".env password only", panel: "panel password only", both: ".env or panel password" }[info.effective])),
    h("li", {}, ".env ADMIN_PASSWORD: ", h("b", {}, info.envPassword ? "set" : "not set")),
    h("li", {}, "Panel password: ", h("b", {}, info.panelPassword ? `set${info.updatedAt ? ` (changed ${info.updatedAt.slice(0, 10)})` : ""}` : "not set")),
    info.forcedEnv ? h("li", { class: "warn" }, "ADMIN_FORCE_ENV=true is set on the server, so only the .env password works until it is removed.") : null);
  const facts = h("div", {}, status());
  async function submit(method) {
    err.textContent = "";
    if (!cur.value) { err.textContent = "Enter your current password"; cur.focus(); return; }
    const body = { currentPassword: cur.value };
    if (method === "PUT") { if (pw1.value || pw2.value) { if (pw1.value !== pw2.value) { err.textContent = "The new passwords don't match"; return; } body.newPassword = pw1.value; } body.mode = mode; }
    try { info = await api("/api/admin/auth", { method, body: JSON.stringify(body) }); cur.value = pw1.value = pw2.value = ""; mount(facts, status()); toast(method === "DELETE" ? "Panel password removed: the .env password is used again." : "Password settings saved. Other sessions were signed out."); }
    catch (x) { err.textContent = x.message; }
  }
  return panel("Admin password", "Choose which password signs in to this panel. A password set here is stored as a salted scrypt hash in the data volume, never in the site content or backups. If you ever get locked out, set ADMIN_FORCE_ENV=true on the server and redeploy to sign in with the .env password.",
    facts, h("h3", {}, "Sign-in mode"), radios,
    h("h3", {}, "Set or change the panel password"), h("p", { class: "intro" }, "Leave empty to keep the current panel password and only change the mode."),
    grid(field("New panel password", pw1), field("Repeat", pw2)), h("div", { class: "actions" }, gen, show),
    h("h3", {}, "Confirm"), grid(field("Current password (either one that works now)", cur)), err,
    h("div", { class: "actions" }, h("button", { type: "button", class: "btn primary", onclick: () => submit("PUT") }, "Save password settings"),
      info.panelPassword && info.envPassword ? h("button", { type: "button", class: "btn danger", onclick: () => confirm("Remove the panel password and use only the .env password?") && submit("DELETE") }, "Remove panel password") : null));
}

async function drawBackups() {
  const files = await api("/api/admin/backups").catch(() => []);
  const fileIn = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async (e) => { const f = e.target.files[0]; if (!f) return; try { const j = JSON.parse(await f.text()); if (!j.hero) throw new Error("not a content file"); c = { ...j, portrait: c.portrait }; markDirty(); toast("Imported. Review, then Save."); section = "hero"; draw(); } catch (x) { toast(`Import failed: ${x.message}`, true); } } });
  return panel("Backups", "Every save keeps a backup (latest 50). Restoring or resetting also backs up first.",
    h("div", { class: "actions" },
      h("button", { type: "button", class: "btn", onclick: () => { const u = URL.createObjectURL(new Blob([JSON.stringify(c, null, 2)], { type: "application/json" })); const a = h("a", { href: u, download: `profile-content-${new Date().toISOString().slice(0, 10)}.json` }); document.body.append(a); a.click(); a.remove(); } }, "Export JSON"),
      h("button", { type: "button", class: "btn", onclick: () => fileIn.click() }, "Import JSON"), fileIn,
      h("button", { type: "button", class: "btn danger", onclick: async () => { if (!confirm("Reset all text to the original content? The current version is backed up.")) return; await api("/api/admin/reset", { method: "POST" }); c = await api("/api/admin/content"); dirty = false; toast("Reset done"); draw(); } }, "Reset to original")),
    h("ul", { class: "backups" }, files.length ? files.map((f) => h("li", {}, h("code", {}, f.replace(/^content-|\.json$/g, "")), h("button", { type: "button", class: "btn sm", onclick: async () => { if (dirty && !confirm("Discard unsaved changes?")) return; await api("/api/admin/restore", { method: "POST", body: JSON.stringify({ file: f }) }); c = await api("/api/admin/content"); dirty = false; toast("Restored"); draw(); } }, "Restore"))) : h("li", {}, "No backups yet.")));
}

// ---------- chrome, auth ----------
function drawTop() {
  mount($("#topActions"), c ? [h("span", { class: `state${dirty ? " dirty" : ""}` }, dirty ? "Unsaved changes" : "All saved"),
    h("a", { class: "btn sm", href: "/", target: "_blank", rel: "noopener" }, "View site ↗"),
    h("button", { type: "button", class: "btn sm primary", disabled: !dirty, onclick: save, title: "Save (Ctrl+S)" }, "Save"),
    h("button", { type: "button", class: "btn sm", onclick: logout }, "Sign out")] : []);
}
async function save() {
  if (!dirty) return;
  try { await api("/api/admin/content", { method: "PUT", body: JSON.stringify(c) }); c = await api("/api/admin/content"); dirty = false; toast("Saved. The site is updated."); draw(); }
  catch (e) { toast(e.message, true); }
}
async function logout() { if (dirty && !confirm("Discard unsaved changes?")) return; await api("/api/admin/logout", { method: "POST" }).catch(() => {}); dirty = false; c = null; login(); }
document.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && c) { e.preventDefault(); save(); } });

function login() {
  drawTop(); mount($("#side"));
  const pw = h("input", { type: "password", autocomplete: "current-password", placeholder: "Password", "aria-label": "Admin password", required: true });
  const err = h("p", { class: "err", role: "alert" });
  mount($("#main"), h("form", { class: "panel login", onsubmit: async (e) => { e.preventDefault(); err.textContent = "";
      try { await api("/api/admin/login", { method: "POST", body: JSON.stringify({ password: pw.value }) }); await boot(); } catch (x) { err.textContent = x.message; pw.select(); } } },
    h("h2", {}, "Sign in"), h("p", { class: "intro" }, "Edit every page of your profile."), pw, err, h("button", { type: "submit", class: "btn primary" }, "Sign in")));
  pw.focus();
}
async function boot() {
  const st = await api("/api/admin/status");
  if (!st.enabled) return mount($("#main"), panel("Admin is disabled", "Set ADMIN_PASSWORD on the server and restart it."));
  if (!st.authenticated) return login();
  c = await api("/api/admin/content"); dirty = false; draw();
}
boot().catch((e) => mount($("#main"), panel("Could not load the admin panel", e.message)));
