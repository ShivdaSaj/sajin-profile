// Content validation and the admin API (auth, CSRF, link checks, portrait upload, backups).
import test from "node:test"; import assert from "node:assert/strict";
import { spawn } from "node:child_process"; import fs from "node:fs"; import os from "node:os"; import path from "node:path";
import { validateContent, validatePortrait } from "../lib/content.mjs";
const root = new URL("..", import.meta.url).pathname;
const seed = JSON.parse(fs.readFileSync(path.join(root, "seed/content.json"), "utf8"));

test("validateContent fills gaps from the seed and caps lengths", () => {
  const c = validateContent({ hero: { firstName: "x".repeat(500) }, site: { theme: { bg: "red" } } }, seed);
  assert.equal(c.hero.firstName.length, 40); assert.equal(c.hero.lastName, seed.hero.lastName);
  assert.equal(c.site.theme.bg, seed.site.theme.bg); assert.equal(c.works.items.length, 0);
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

function start(dataDir) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ["server.mjs"], { cwd: root, env: { ...process.env, ADMIN_PASSWORD: "test-pass", PORT: "0", COOKIE_SECURE: "false", DATA_DIR: dataDir } });
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
  } finally { p.kill(); fs.rmSync(dir, { recursive: true }); }
});
