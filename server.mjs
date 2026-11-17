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
const BACKUPS = path.join(DATA_DIR, "backups");
const PORT = Number(process.env.PORT || 8080);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const TRUST_PROXY = process.env.TRUST_PROXY !== "false";
const SECURE_COOKIE = process.env.COOKIE_SECURE !== "false";
const SEED = JSON.parse(fs.readFileSync(path.join(ROOT, "seed", "content.json"), "utf8"));

// ---------- content store ----------
fs.mkdirSync(BACKUPS, { recursive: true });
if (!fs.existsSync(CONTENT_FILE)) fs.writeFileSync(CONTENT_FILE, JSON.stringify(SEED, null, 1));
let content = validateContent(JSON.parse(fs.readFileSync(CONTENT_FILE, "utf8")), SEED);
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
const checkPassword = (pw) => ADMIN_PASSWORD.length > 0 && crypto.timingSafeEqual(sha(String(pw)), sha(ADMIN_PASSWORD));
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
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8" };
const esc = (s) => String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]);

async function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === "/" || rel === "/index.html") rel = "/index.html";
  else if (rel === "/admin" || rel === "/admin/") rel = "/admin/index.html";
  const file = path.normalize(path.join(PUBLIC, rel)); if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, "Forbidden");
  try {
    let data = await fsp.readFile(file);
    // Title, description and colours are rendered into the HTML so the first paint already matches the content.
    if (file.endsWith(".html")) { const t = content.site.theme;
      data = data.toString("utf8").replaceAll("{{TITLE}}", esc(content.site.title)).replaceAll("{{DESCRIPTION}}", esc(content.site.description))
        .replaceAll("{{THEME_STYLE}}", `--bg:${t.bg};--fg:${t.fg};--muted:${t.muted};--accent:${t.accent}`).replaceAll("{{BG}}", t.bg); }
    send(res, 200, data, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": file.endsWith(".html") ? "no-cache" : "public, max-age=600" });
  } catch { send(res, 404, "Not found", { "Content-Type": "text/plain" }); }
}

// ---------- routes ----------
async function handle(req, res) {
  const url = new URL(req.url, "http://localhost"); const p = url.pathname; const ip = clientIp(req);
  if (p === "/healthz") return json(res, 200, { ok: true });
  if (p === "/api/content" && req.method === "GET") return json(res, 200, content, { "Cache-Control": "no-cache" });
  if (p === "/api/portrait" && req.method === "GET") {
    if (!content.portrait.enabled) return json(res, 404, { ok: false, error: "No portrait" });
    try { return send(res, 200, await fsp.readFile(PORTRAIT_FILE), { "Content-Type": "application/json", "Cache-Control": "no-cache" }); } catch { return json(res, 404, { ok: false, error: "No portrait" }); }
  }

  if (p === "/api/admin/status") return json(res, 200, { enabled: ADMIN_PASSWORD.length > 0, authenticated: isAdmin(req) });
  if (p === "/api/admin/login" && req.method === "POST") {
    if (!ADMIN_PASSWORD) throw httpError(503, "Admin is disabled: set ADMIN_PASSWORD on the server");
    const a = attempts.get(ip); if (a && a.count >= 5 && a.until > Date.now()) throw httpError(429, "Too many failed attempts. Try again in 15 minutes.");
    const body = await readJson(req, 4096);
    if (!checkPassword(body.password)) { attempts.set(ip, { count: (a?.count || 0) + 1, until: Date.now() + 15 * 60000 }); console.warn(`[admin] failed login from ${ip}`); throw httpError(401, "Wrong password"); }
    attempts.delete(ip); const token = crypto.randomBytes(32).toString("hex"); sessions.set(token, Date.now() + SESSION_HOURS * 3600e3);
    console.log(`[admin] login from ${ip}`); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie(token, SESSION_HOURS * 3600) });
  }
  if (p === "/api/admin/logout" && req.method === "POST") { const t = cookies(req).sp_session; if (t) sessions.delete(t); return json(res, 200, { ok: true }, { "Set-Cookie": sessionCookie("", 0) }); }

  if (p.startsWith("/api/admin/")) {
    if (!isAdmin(req)) throw httpError(401, "Not signed in");
    if (req.method !== "GET" && req.headers["x-requested-with"] !== "sajin-profile") throw httpError(403, "Missing CSRF header");
    if (p === "/api/admin/content" && req.method === "GET") return json(res, 200, content);
    if (p === "/api/admin/content" && req.method === "PUT") { const next = validateContent(await readJson(req, 512 * 1024), SEED, true); next.portrait = content.portrait; await saveContent(next, ip); return json(res, 200, { ok: true, updatedAt: next.updatedAt }); }
    if (p === "/api/admin/portrait" && req.method === "PUT") {
      const pts = validatePortrait(await readJson(req, 4 * 1024 * 1024));
      await writeAtomic(PORTRAIT_FILE, JSON.stringify(pts));
      await saveContent({ ...content, portrait: { enabled: true, updatedAt: new Date().toISOString(), points: pts.n } }, ip);
      return json(res, 200, { ok: true, points: pts.n });
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
server.listen(PORT, () => console.log(`Sajin profile listening on :${server.address().port} (admin ${ADMIN_PASSWORD ? "enabled" : "DISABLED, set ADMIN_PASSWORD"}, data ${DATA_DIR})`));
process.on("SIGTERM", () => server.close(() => process.exit(0)));
