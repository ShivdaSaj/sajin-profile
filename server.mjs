// Sajin Shivdas profile: static site, public content API and a password-protected admin API.
// No npm dependencies.
import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { validateContent, validatePortrait } from "./lib/content.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(ROOT, "public");
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, "data");
const CONTENT_FILE = path.join(DATA_DIR, "content.json");
const PORTRAIT_FILE = path.join(DATA_DIR, "portrait.json");
const MEDIA = path.join(DATA_DIR, "media");
const BACKUPS = path.join(DATA_DIR, "backups");
const PORT = Number(process.env.PORT || 8080);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const AUTH_FILE = path.join(DATA_DIR, "auth.json");
// Recovery switch: ADMIN_FORCE_ENV=true makes the .env password work whatever was set in the panel.
const FORCE_ENV = process.env.ADMIN_FORCE_ENV === "true" && ADMIN_PASSWORD.length > 0;
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const TRUST_PROXY = process.env.TRUST_PROXY !== "false";
const SECURE_COOKIE = process.env.COOKIE_SECURE !== "false";
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "content.json"), "utf8"));

// ---------- content store ----------
fs.mkdirSync(BACKUPS, { recursive: true }); fs.mkdirSync(MEDIA, { recursive: true });
// Uploaded images are accepted only if their bytes really are JPEG, PNG or WebP.
const IMAGE_TYPES = [["jpg", "image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff], ["png", "image/png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", "image/webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"]];
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify(SEED, null, 1));
// Content saved before a field existed gets the seed value for it: projects that never had a "thumb"
// key pick up the seed thumbnail with the same title (an emptied thumbnail stays empty).
const raw = JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8"));
for (const w of raw.works?.items || []) if (!("thumb" in w)) { const sw = SEED.works.items.find((x) => x.title === w.title); if (sw?.thumb) w.thumb = sw.thumb; }
let content = validateContent(raw, SEED);
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
async function backup(tag = "") {
  await fsp.copyFile(CONTENT_FILE, path.join(BACKUPS, `content-${stamp()}${tag}.json`)).catch(() => {});
  const files = (await fsp.readdir(BACKUPS)).filter((f) => f.startsWith("content-")).sort();
  for (const f of files.slice(0, -50)) await fsp.unlink(path.join(BACKUPS, f)).catch(() => {});
}
async function writeAtomic(file, data) { const tmp = `${file}.tmp`; await fsp.writeFile(tmp, data); await fsp.rename(tmp, file); }
async function saveContent(next, who) {
  await backup(); next.updatedAt = new Date().toISOString();
  await writeAtomic(CONTENT_FILE, JSON.stringify(next, null, 1)); content = next;
  console.log(`[admin] content saved by ${who}`);
}

// ---------- auth ----------
const sessions = new Map(); // token -> expiry
const attempts = new Map(); // ip -> {count, until}
const sha = (s) => crypto.createHash("sha256").update(s).digest();
// Admin passwords: the .env ADMIN_PASSWORD and/or one set in the panel (scrypt hash in DATA_DIR/auth.json,
// never in content.json, which is public). Mode "env": only .env; "panel": only the panel password
// (it overrides .env); "both": either works.
const MODES = ["env", "panel", "both"];
let auth = null;
try { const a = JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")); if (MODES.includes(a.mode) && /^[0-9a-f]{32}$/.test(a.salt) && /^[0-9a-f]{64}$/.test(a.hash)) auth = a; } catch { /* none yet */ }
const scrypt = (pw, salt) => new Promise((ok, no) => crypto.scrypt(String(pw), Buffer.from(salt, "hex"), 32, { N: 16384, r: 8, p: 1 }, (e, k) => (e ? no(e) : ok(k))));
function effectiveMode() { if (FORCE_ENV || !auth) return "env"; if (!ADMIN_PASSWORD) return "panel"; return auth.mode; }
const adminEnabled = () => ADMIN_PASSWORD.length > 0 || !!auth;
async function checkPassword(pw) {
  const m = effectiveMode(); let ok = false;
  if (m !== "panel" && ADMIN_PASSWORD) ok = crypto.timingSafeEqual(sha(String(pw)), sha(ADMIN_PASSWORD));
  if (m !== "env" && auth) ok = crypto.timingSafeEqual(await scrypt(pw, auth.salt), Buffer.from(auth.hash, "hex")) || ok;
  return ok;
}
function authInfo() { return { mode: auth?.mode || "env", effective: effectiveMode(), panelPassword: !!auth, envPassword: ADMIN_PASSWORD.length > 0, forcedEnv: FORCE_ENV, updatedAt: auth?.updatedAt || null }; }
// Failed password checks (sign-in or re-entering the current password) share one lockout per IP.
function guard(ip) { const a = attempts.get(ip); if (a && a.count >= 5 && a.until > Date.now()) throw httpError(429, "Too many failed attempts. Try again in 15 minutes."); }
function fail(ip, what) { const a = attempts.get(ip); attempts.set(ip, { count: (a?.count || 0) + 1, until: Date.now() + 15 * 60000 }); console.warn(`[admin] failed ${what} from ${ip}`); }
function strongEnough(pw) {
  if (typeof pw !== "string" || pw.length < 12) return "Use at least 12 characters";
  if (pw.length > 200) return "Use at most 200 characters";
  if (new Set(pw).size < 6) return "Use more varied characters";
  return null;
}
const cookies = (req) => Object.fromEntries((req.headers.cookie || "").split(";").map((c) => c.trim().split("=")).filter((x) => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join("="))]));
function isAdmin(req) { const t = cookies(req).sp_session; const exp = t && sessions.get(t); if (!exp) return false; if (exp < Date.now()) { sessions.delete(t); return false; } return true; }
const clientIp = (req) => (TRUST_PROXY && String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()) || req.socket.remoteAddress || "?";
const sessionCookie = (token, maxAge) => `sp_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${SECURE_COOKIE ? "; Secure" : ""}`;
setInterval(() => { const now = Date.now(); for (const [k, e] of sessions) if (e < now) sessions.delete(k); for (const [k, a] of attempts) if (a.until < now) attempts.delete(k); }, 60000).unref();

// ---------- http helpers ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });
const SEC_HEADERS = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Referrer-Policy": "strict-origin-when-cross-origin", "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin", "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};
const send = (res, status, body, headers = {}) => { res.writeHead(status, { ...SEC_HEADERS, ...headers }); res.end(body); };
const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
async function readJson(req, max) { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > max) throw httpError(413, "Request too large"); chunks.push(c); } try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { throw httpError(400, "Invalid JSON body"); } }
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "/index.html") rel = "/index.html";
  else if (rel === "/admin" || rel === "/admin/") rel = "/admin/index.html";
  const file = path.normalize(path.join(PUBLIC, rel)); if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden");
  try {
    let data = await fsp.readFile(file);
    // Title, description and colours are rendered into the HTML so the first paint already matches the content.
    if (file.endsWith(".html")) { const T = content.site.themes, t = T.list[T.default], d = T.list.dark;
      const vars = (x) => `--bg:${x.bg};--fg:${x.fg};--muted:${x.muted};--accent:${x.accent};color-scheme:${x.kind}`;
      data = data.toString("utf8").replaceAll("{{TITLE}}", esc(content.site.title)).replaceAll("{{DESCRIPTION}}", esc(content.site.description))
        .replaceAll("{{THEME_STYLE}}", vars(t)).replaceAll("{{ADMIN_STYLE}}", vars(d)).replaceAll("{{THEME_ID}}", T.default).replaceAll("{{BG}}", t.bg)
        // read by /js/theme-boot.js before first paint; "<" is escaped so the JSON can't close the script element
        .replaceAll("{{THEME_DATA}}", JSON.stringify(T).replace(/</g, "\\u003c")); }
    send(res, 200, data, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=600" });
  } catch { send(res, 404, "Not found", { "Content-Type": "text/plain" }); }
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, "http://localhost"); const p = url.pathname; const ip = clientIp(req);
  if (p === "/healthz") return json(res, 200, { ok: true });
  if (p === "/api/content" && req.method === "GET") return json(res, 200, content, { "Cache-Control": "no-cache" });
  if (p.startsWith("/media/") && (req.method === "GET" || req.method === "HEAD")) {
    const name = p.slice(7); if (!/^[\w-]+\.(jpg|png|webp)$/.test(name)) return send(res, 404, "Not found", { "Content-Type": "text/plain" });
    try { const data = await fsp.readFile(path.join(MEDIA, name)); return send(res, 200, data, { "Content-Type": IMAGE_TYPES.find((t) => name.endsWith("." + t[0]))[1], "Cache-Control": "public, max-age=31536000, immutable" }); }
    catch { return send(res, 404, "Not found", { "Content-Type": "text/plain" }); }
  }
  if (p === "/api/portrait" && req.method === "GET") {
    if (!content.portrait.enabled) return json(res, 404, { ok: false, error: "No portrait" });
    try { return send(res, 200, await fsp.readFile(PORTRAIT_FILE), { "Content-Type": "application/json", "Cache-Control": "no-cache" }); } catch { return json(res, 404, { ok: false, error: "No portrait" }); }
  }

  if (p === "/api/admin/status") return json(res, 200, { enabled: adminEnabled(), authenticated: isAdmin(req) });
  if (p === "/api/admin/login" && req.method === "POST") {
    if (!adminEnabled()) throw httpError(503, "Admin is disabled: set ADMIN_PASSWORD on the server");
    guard(ip); const body = await readJson(req, 4096);
    if (!(await checkPassword(body.password))) { fail(ip, "login"); throw httpError(401, "Wrong password"); }
    attempts.delete(ip); const token = crypto.randomBytes(32).toString("hex"); sessions.set(token, Date.now() + SESSION_HOURS * 3600e3);
    console.log(`[admin] login from ${ip}`); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(token, SESSION_HOURS * 3600) });
  }
  if (p === "/api/admin/logout" && req.method === "POST") { const t = cookies(req).sp_session; if (t) sessions.delete(t); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) }); }

  if (p.startsWith("/api/admin/")) {
    if (!isAdmin(req)) throw httpError(401, "Not signed in");
    if (req.method !== "GET" && req.headers["x-requested-with"] !== "sajin-profile") throw httpError(403, "Missing CSRF header");
    if (p === "/api/admin/content" && req.method === "GET") return json(res, 200, content);
    if (p === "/api/admin/auth" && req.method === "GET") return json(res, 200, authInfo());
    if (p === "/api/admin/auth" && (req.method === "PUT" || req.method === "DELETE")) {
      guard(ip); const body = await readJson(req, 4096);
      if (!(await checkPassword(body.currentPassword))) { fail(ip, "password check"); throw httpError(401, "Current password is wrong"); }
      let next;
      if (req.method === "DELETE") { // forget the panel password and go back to the .env one
        if (!ADMIN_PASSWORD) throw httpError(400, "No .env password is set, so removing the panel password would lock you out");
        next = null;
      } else {
        const mode = body.mode ?? auth?.mode ?? "both"; if (!MODES.includes(mode)) throw httpError(400, "Mode must be env, panel or both");
        next = auth ? { ...auth } : null;
        if (body.newPassword != null && body.newPassword !== "") {
          const weak = strongEnough(body.newPassword); if (weak) throw httpError(400, weak);
          const salt = crypto.randomBytes(16).toString("hex"); next = { salt, hash: (await scrypt(body.newPassword, salt)).toString("hex") };
        }
        if (!next && mode !== "env") throw httpError(400, "Set a panel password first");
        if (!next) throw httpError(400, "Nothing to change: no panel password is set, so the .env password is already the only one");
        if (mode !== "panel" && !ADMIN_PASSWORD) throw httpError(400, "No .env password is set on the server, so only the panel password can be used");
        Object.assign(next, { mode, updatedAt: new Date().toISOString() });
      }
      if (next) { const tmp = `${AUTH_FILE}.tmp`; await fsp.writeFile(tmp, JSON.stringify(next), { mode: 0o600 }); await fsp.rename(tmp, AUTH_FILE); }
      else await fsp.unlink(AUTH_FILE).catch(() => {});
      auth = next;
      // other signed-in sessions must sign in again with the new rules
      const mine = cookies(req).sp_session; for (const k of sessions.keys()) if (k !== mine) sessions.delete(k);
      console.log(`[admin] password settings changed by ${ip} (mode ${effectiveMode()})`);
      return json(res, 200, authInfo());
    }
    if (p === "/api/admin/content" && req.method === "PUT") { const next = validateContent(await readJson(req, 512 * 1024), SEED, true); next.portrait = content.portrait; await saveContent(next, ip); return json(res, 200, { ok: true, updatedAt: next.updatedAt }); }
    if (p === "/api/admin/portrait" && req.method === "PUT") {
      const pts = validatePortrait(await readJson(req, 4 * 1024 * 1024));
      await writeAtomic(PORTRAIT_FILE, JSON.stringify(pts));
      await saveContent({ ...content, portrait: { enabled: true, updatedAt: new Date().toISOString(), points: pts.n } }, ip);
      return json(res, 200, { ok: true, points: pts.n });
    }
    if (p === "/api/admin/media" && req.method === "POST") {
      const { data } = await readJson(req, 3 * 1024 * 1024); const m = /^data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ""));
      if (!m) throw httpError(400, "Send the image as a base64 data URL");
      const buf = Buffer.from(m[1], "base64"); if (buf.length > 2 * 1024 * 1024) throw httpError(413, "Image is larger than 2 MB");
      const type = IMAGE_TYPES.find((t) => t[2](buf)); if (!type) throw httpError(400, "Only JPEG, PNG or WebP images are accepted");
      const name = `${crypto.createHash("sha256").update(buf).digest("hex").slice(0, 20)}.${type[0]}`; // content-addressed: re-uploads dedupe, URLs never go stale
      await writeAtomic(path.join(MEDIA, name), buf); console.log(`[admin] uploaded /media/${name} (${buf.length} bytes)`);
      return json(res, 200, { ok: true, url: `/media/${name}` });
    }
    if (p === "/api/admin/portrait" && req.method === "DELETE") { await saveContent({ ...content, portrait: { enabled: false, updatedAt: new Date().toISOString() } }, ip); return json(res, 200, { ok: true }); }
    if (p === "/api/admin/backups" && req.method === "GET") return json(res, 200, (await fsp.readdir(BACKUPS)).filter((f) => f.startsWith("content-")).sort().reverse());
    if (p === "/api/admin/restore" && req.method === "POST") {
      const { file } = await readJson(req, 4096); if (!/^content-[\w-]+\.json$/.test(file || "")) throw httpError(400, "Invalid backup name");
      const next = validateContent(JSON.parse(await fsp.readFile(path.join(BACKUPS, file), "utf8")), SEED); next.portrait = content.portrait; await saveContent(next, ip); return json(res, 200, { ok: true });
    }
    if (p === "/api/admin/reset" && req.method === "POST") { const next = validateContent(structuredClone(SEED), SEED); next.portrait = content.portrait; await saveContent(next, ip); return json(res, 200, { ok: true }); }
    throw httpError(404, "Unknown admin endpoint");
  }
  if (p.startsWith("/api/")) throw httpError(404, "Unknown endpoint");
  if (req.method !== "GET" && req.method !== "HEAD") throw httpError(405, "Method not allowed");
  return serveStatic(req, res, p);
}

const server = http.createServer((req, res) => { handle(req, res).catch((e) => { if (!e.status) console.error(e); if (!res.headersSent) json(res, e.status || 500, { ok: false, error: e.status ? e.message : "Internal error" }); }); });
server.headersTimeout = 20000; server.requestTimeout = 60000;
server.listen(PORT, () => console.log(`Sajin profile listening on :${server.address().port} (admin ${adminEnabled() ? `enabled, password mode ${effectiveMode()}` : "DISABLED, set ADMIN_PASSWORD"}, data ${DATA_DIR})`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
