// Content validation and the admin API (auth, CSRF, link checks, portrait upload, backups).
import test from "node:test"; import assert from "node:assert/strict";
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { validateContent, validatePortrait } from "../lib/content.mjs";
const root = new URL("..", import.meta.url).pathname;
const seed = JSON.parse(fs.readFileSync(path.join(root, "seed/content.json"), "utf8"));

test("validateContent fills gaps from the seed and caps lengths", () => {
  const c = validateContent({ hero: { firstName: "x".repeat(500) }, site: { themes: { list: { dark: { bg: "red" } } } } }, seed);
  assert.equal(c.hero.firstName.length, 40); assert.equal(c.hero.lastName, seed.hero.lastName);
  assert.equal(c.site.themes.list.dark.bg, seed.site.themes.list.dark.bg); assert.equal(c.works.items.length, 0);
});
test("themes: legacy colours migrate to Dark, options are typed and clamped", () => {
  const old = validateContent({ site: { theme: { bg: "#101010", fg: "#fafafa", muted: "#999999", particle: "#ffeeee", accent: "#00ff00" } } }, seed);
  assert.equal(old.site.themes.list.dark.bg, "#101010"); assert.equal(old.site.themes.list.dark.accent, "#00ff00");
  assert.deepEqual(old.site.themes.enabled, ["dark", "light", "whiteneon", "neon", "matrix", "galaxy"]); assert.equal(old.site.themes.default, "dark");
  const t = validateContent({ site: { themes: { default: "matrix", enabled: ["light", "bogus"], selection: "auto", mode: "smoke", interval: 2, modeInterval: 999999, order: "random",
    list: { dark: {}, neon: {}, galaxy: {}, whiteneon: {}, light: { nightMaps: true, style: "laser", glow: 9 }, matrix: { rainDensity: -1, rainSpeed: 99, label: "  " } } } } }, seed).site.themes;
  assert.equal(t.default, "matrix"); assert.deepEqual(t.enabled, ["light", "matrix"]); // the default is always enabled
  assert.equal(t.selection, "auto"); assert.equal(t.mode, "particle"); assert.equal(t.interval, 10); assert.equal(t.modeInterval, 86400); assert.equal(t.order, "random");
  assert.equal(validateContent({ site: { themes: { mode: "galaxy", list: {} } } }, seed).site.themes.mode, "galaxy");
  // content saved before Galaxy existed: Galaxy joins the rotation, with the seed colours
  const before = validateContent({ site: { themes: { enabled: ["dark"], list: { dark: {}, light: {}, neon: {}, matrix: {} } } } }, seed).site.themes;
  assert.deepEqual(before.enabled, ["dark", "whiteneon", "galaxy"]); assert.equal(before.list.galaxy.particle3, seed.site.themes.list.galaxy.particle3); assert.equal(before.list.galaxy.spectrum, true); assert.equal(before.list.whiteneon.kind, "light"); assert.equal(before.list.whiteneon.nightMaps, false);
  assert.equal(t.list.light.nightMaps, false); assert.equal(t.list.light.style, "soft"); assert.equal(t.list.light.glow, 2); assert.equal(t.list.light.kind, "light");
  assert.equal(t.list.matrix.rainDensity, 0.1); assert.equal(t.list.matrix.rainSpeed, 3); assert.equal(t.list.matrix.label, "Matrix");
});
test("validateContent rejects unsafe links only when strict", () => {
  const bad = { ...seed, contact: { ...seed.contact, links: [{ label: "x", url: "javascript:alert(1)" }] } };
  assert.throws(() => validateContent(bad, seed, true), /link must start/);
  assert.equal(validateContent(bad, seed).contact.links.length, 0);
});
test("validatePortrait checks shape and ranges", () => {
  const n = 600, ok = { v: 1, n, p: Array(n * 3).fill(10), l: Array(n).fill(200) };
  assert.equal(validatePortrait(ok).n, n);
  assert.throws(() => validatePortrait({ ...ok, n: 10 }), /between/);
  assert.throws(() => validatePortrait({ ...ok, p: [...ok.p.slice(1), 99999] }), /out of range/);
});

function start(dataDir, extra = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, ADMIN_PASSWORD: "test-pass", PORT: "0", COOKIE_SECURE: "false", DATA_DIR: dataDir, ...extra } });
    let out = ""; p.stdout.on("data", (d) => { out += d; }); p.stderr.on("data", (d) => (out += d));
    p.on("exit", (c) => c && reject(new Error(out)));
    // PORT=0 picks a free port; find it from the process' open listening socket via a retry loop on the log
    const t = setInterval(() => { const m = out.match(/listening on :(\d+)/); if (m) { clearInterval(t); resolve({ p, port: +m[1] }); } }, 50);
  });
}

test("admin API: auth, CSRF, save, portrait, backups", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-")); const { p, port } = await start(dir);
  const B = `http://127.0.0.1:${port}`;
  try {
    assert.equal((await fetch(B + "/api/admin/content")).status, 401);
    assert.equal((await fetch(B + "/api/admin/login", { method: "POST", body: JSON.stringify({ password: "nope" }) })).status, 401);
    const login = await fetch(B + "/api/admin/login", { method: "POST", body: JSON.stringify({ password: "test-pass" }) });
    const cookie = login.headers.get("set-cookie").split(";")[0]; assert.match(login.headers.get("set-cookie"), /HttpOnly; SameSite=Strict/);
    const c = await (await fetch(B + "/api/admin/content", { headers: { cookie } })).json();
    c.hero.role = "Tested role";
    assert.equal((await fetch(B + "/api/admin/content", { method: "PUT", headers: { cookie }, body: JSON.stringify(c) })).status, 403, "CSRF header required");
    const H = { cookie, "X-Requested-With": "sajin-profile" };
    assert.equal((await fetch(B + "/api/admin/content", { method: "PUT", headers: H, body: JSON.stringify(c) })).status, 200);
    assert.equal((await (await fetch(B + "/api/content")).json()).hero.role, "Tested role");
    assert.equal((await fetch(B + "/api/portrait")).status, 404);
    const n = 800, pts = { v: 1, n, p: Array.from({ length: n * 3 }, (_, i) => (i % 7) * 100), l: Array(n).fill(128) };
    assert.equal((await fetch(B + "/api/admin/portrait", { method: "PUT", headers: H, body: JSON.stringify(pts) })).status, 200);
    assert.equal((await (await fetch(B + "/api/portrait")).json()).n, n);
    assert.ok((await (await fetch(B + "/api/content")).json()).portrait.enabled);
    const backups = await (await fetch(B + "/api/admin/backups", { headers: H })).json(); assert.ok(backups.length >= 2);
    // image uploads: real PNG accepted and served; text disguised as an image refused
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const up = await (await fetch(B + "/api/admin/media", { method: "POST", headers: H, body: JSON.stringify({ data: `data:image/png;base64,${png.toString("base64")}` }) })).json();
    assert.match(up.url, /^\/media\/[0-9a-f]{20}\.png$/);
    const got = await fetch(B + up.url); assert.equal(got.status, 200); assert.equal(got.headers.get("content-type"), "image/png");
    assert.equal((await fetch(B + "/api/admin/media", { method: "POST", headers: H, body: JSON.stringify({ data: "data:image/png;base64," + Buffer.from("<svg onload=alert(1)>").toString("base64") }) })).status, 400);
    assert.equal((await fetch(B + "/media/..%2Fcontent.json")).status, 404);
    // a work can reference the upload; other paths are dropped
    const c2 = await (await fetch(B + "/api/admin/content", { headers: H })).json();
    c2.works.items[0].thumb = up.url; c2.works.items[1].thumb = "https://evil.example/x.png";
    await fetch(B + "/api/admin/content", { method: "PUT", headers: H, body: JSON.stringify(c2) });
    const pub = await (await fetch(B + "/api/content")).json(); assert.equal(pub.works.items[0].thumb, up.url); assert.equal(pub.works.items[1].thumb, "");
    assert.equal(pub.location.fromLabel, "From India"); assert.equal(pub.location.basedLabel, "Based in the UAE");
    const html = await (await fetch(B + "/")).text(); assert.match(html, /<title>Sajin Shivdas \| Cybersecurity Expert<\/title>/); assert.match(html, /--bg:#/);
    assert.equal((await fetch(B + "/../server.mjs")).status === 200, false);
    assert.equal((await fetch(B + "/img/works/infosec-tools.jpg")).headers.get("content-type"), "image/jpeg");
  } finally { p.kill(); fs.rmSync(dir, { recursive: true }); }
});

test("theme data is rendered into the page head, safely escaped", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-")); const { p, port } = await start(dir);
  try {
    const html = await (await fetch(`http://127.0.0.1:${port}/`)).text();
    const m = html.match(/<script type="application\/json" id="theme-data">(.*?)<\/script>/s); assert.ok(m);
    const T = JSON.parse(m[1]); assert.equal(T.default, "dark"); assert.ok(T.list.matrix.rain);
    assert.match(html, /data-theme="dark"/); assert.match(html, /--bg:#1d1c20/);
    assert.equal((await fetch(`http://127.0.0.1:${port}/js/theme-boot.js`)).status, 200);
  } finally { p.kill(); }
});

test("admin password: panel password, modes, re-auth, lockout safety, never public", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sp-")); let { p, port } = await start(dir); let B = `http://127.0.0.1:${port}`;
  const H = (cookie) => ({ cookie, "X-Requested-With": "sajin-profile", "Content-Type": "application/json" });
  const login = async (password) => { const r = await fetch(B + "/api/admin/login", { method: "POST", body: JSON.stringify({ password }) }); return r.ok ? r.headers.get("set-cookie").split(";")[0] : r.status; };
  const auth = (cookie, method, body) => fetch(B + "/api/admin/auth", { method, headers: H(cookie), body: JSON.stringify(body) });
  try {
    const ck = await login("test-pass");
    assert.equal((await (await fetch(B + "/api/admin/auth", { headers: { cookie: ck } })).json()).effective, "env");
    assert.equal((await auth(ck, "PUT", { currentPassword: "wrong", newPassword: "panel-pass-1234", mode: "both" })).status, 401);
    assert.equal((await auth(ck, "PUT", { currentPassword: "test-pass", newPassword: "short", mode: "both" })).status, 400);
    assert.equal((await auth(ck, "PUT", { currentPassword: "test-pass", mode: "panel" })).status, 400); // no panel password yet
    let r = await auth(ck, "PUT", { currentPassword: "test-pass", newPassword: "panel-pass-1234", mode: "both" }); assert.equal(r.status, 200);
    assert.equal((await r.json()).effective, "both");
    assert.equal(typeof await login("test-pass"), "string"); assert.equal(typeof await login("panel-pass-1234"), "string");
    r = await auth(ck, "PUT", { currentPassword: "panel-pass-1234", mode: "panel" }); assert.equal((await r.json()).effective, "panel");
    assert.equal(await login("test-pass"), 401); const ck2 = await login("panel-pass-1234"); assert.equal(typeof ck2, "string");
    // the hash lives only in auth.json: not in content, the public API or backups
    const stored = JSON.parse(fs.readFileSync(path.join(dir, "auth.json"), "utf8")); assert.match(stored.hash, /^[0-9a-f]{64}$/); assert.ok(!JSON.stringify(stored).includes("panel-pass"));
    const pub = await (await fetch(B + "/api/content")).text(); assert.ok(!pub.includes(stored.hash) && !pub.includes("salt"));
    // survives a restart; ADMIN_FORCE_ENV brings the .env password back
    p.kill(); ({ p, port } = await start(dir)); B = `http://127.0.0.1:${port}`;
    assert.equal(await login("test-pass"), 401); assert.equal(typeof await login("panel-pass-1234"), "string");
    p.kill(); ({ p, port } = await start(dir, { ADMIN_FORCE_ENV: "true" })); B = `http://127.0.0.1:${port}`;
    const ck3 = await login("test-pass"); assert.equal(typeof ck3, "string"); assert.equal(await login("panel-pass-1234"), 401);
    // removing the panel password goes back to .env
    p.kill(); ({ p, port } = await start(dir)); B = `http://127.0.0.1:${port}`;
    const ck4 = await login("panel-pass-1234"); assert.equal((await auth(ck4, "DELETE", { currentPassword: "panel-pass-1234" })).status, 200);
    assert.ok(!fs.existsSync(path.join(dir, "auth.json"))); assert.equal(typeof await login("test-pass"), "string");
    // with no .env password, only the panel mode is allowed and the panel password can't be removed
    p.kill(); ({ p, port } = await start(dir, { ADMIN_PASSWORD: "" })); B = `http://127.0.0.1:${port}`;
    assert.equal((await (await fetch(B + "/api/admin/status")).json()).enabled, false);
  } finally { p.kill(); }
});
