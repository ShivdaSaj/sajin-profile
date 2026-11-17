// Point-cloud generators for each scroll stage. Every shape returns Float32Array(3 * n), roughly
// centred on the origin and about 2 units tall. Text and emblems are sampled from an offscreen canvas.
export function rng(seed = 1) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const TAU = Math.PI * 2;

// Even sphere (Fibonacci lattice).
export function globe(n, radius = 0.9) {
  const out = new Float32Array(3 * n), ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) { const y = 1 - (i / Math.max(n - 1, 1)) * 2, rr = Math.sqrt(Math.max(1 - y * y, 0)), a = ga * i;
    out[3 * i] = Math.cos(a) * rr * radius; out[3 * i + 1] = y * radius; out[3 * i + 2] = Math.sin(a) * rr * radius; }
  return out;
}

// Double helix along x with rungs between the strands.
export function helix(n, r = rng(11)) {
  const out = new Float32Array(3 * n), len = 6.0, turns = 2.2, rad = 0.42;
  for (let i = 0; i < n; i++) {
    const t = r(), x = (t - 0.5) * len, a = t * turns * TAU;
    if (r() < 0.08) { // rung
      const rung = Math.round(t * 30) / 30, ra = rung * turns * TAU, s = r() * 2 - 1;
      out[3 * i] = (rung - 0.5) * len; out[3 * i + 1] = Math.cos(ra) * rad * s; out[3 * i + 2] = Math.sin(ra) * rad * s;
    } else { const strand = r() < 0.5 ? 0 : Math.PI, j = 0.035;
      out[3 * i] = x + (r() - 0.5) * j; out[3 * i + 1] = Math.cos(a + strand) * rad + (r() - 0.5) * j; out[3 * i + 2] = Math.sin(a + strand) * rad + (r() - 0.5) * j; }
  }
  return out;
}

// Vortex: a widening spiral that collapses towards its centre.
export function spiral(n, r = rng(13)) {
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { const t = Math.pow(r(), 0.7), a = t * 5.5 * TAU + r() * 0.25, rad = 0.08 + t * 1.0, spread = 0.03 + t * 0.09;
    out[3 * i] = Math.cos(a) * rad + (r() - 0.5) * spread; out[3 * i + 1] = Math.sin(a) * rad * 0.9 + (r() - 0.5) * spread; out[3 * i + 2] = (r() - 0.5) * (0.1 + t * 0.4); }
  return out;
}

// Unit rectangle perimeter coordinates (u, v in 0..1) with a soft outward halo, mapped to the
// contact box in the shader.
export function frame(n, r = rng(17)) {
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { const t = r() * 4, side = Math.floor(t), f = t - side, halo = Math.pow(r(), 2.4) * 0.045 * (r() < 0.5 ? -0.3 : 1);
    let u, v; if (side === 0) { u = f; v = -halo; } else if (side === 1) { u = 1 + halo; v = f; } else if (side === 2) { u = 1 - f; v = 1 + halo; } else { u = -halo; v = 1 - f; }
    out[3 * i] = u; out[3 * i + 1] = v; out[3 * i + 2] = (r() - 0.5) * 2; }
  return out;
}

// Random shell used as the scattered start position.
export function scatter(n, r = rng(19)) {
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) { let x = r() * 2 - 1, y = r() * 2 - 1, z = r() * 2 - 1; const l = Math.hypot(x, y, z) || 1, d = 2 + 4.5 * r();
    out[3 * i] = (x / l) * d; out[3 * i + 1] = (y / l) * d; out[3 * i + 2] = (z / l) * d; }
  return out;
}

// Sample n points from the opaque pixels of a canvas drawing, scaled so the drawing is `height` units tall.
export function sampleCanvas(draw, n, { w = 900, h = 300, height = 1.2, depth = 0.08, r = rng(23) } = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d", { willReadFrequently: true });
  draw(ctx, w, h);
  const px = ctx.getImageData(0, 0, w, h).data, hits = [];
  for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) if (px[(y * w + x) * 4 + 3] > 128) hits.push(x, y);
  const out = new Float32Array(3 * n); if (!hits.length) return globe(n, 0.6);
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < hits.length; i += 2) { minX = Math.min(minX, hits[i]); maxX = Math.max(maxX, hits[i]); minY = Math.min(minY, hits[i + 1]); maxY = Math.max(maxY, hits[i + 1]); }
  const s = height / Math.max(maxY - minY, 1), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  for (let i = 0; i < n; i++) { const k = 2 * Math.floor(r() * (hits.length / 2));
    out[3 * i] = (hits[k] - cx + (r() - 0.5) * 2) * s; out[3 * i + 1] = -(hits[k + 1] - cy + (r() - 0.5) * 2) * s; out[3 * i + 2] = (r() - 0.5) * depth; }
  return out;
}

// Default hero until a portrait is uploaded: a head-and-shoulders silhouette, brighter towards the face,
// anchored so the shoulders sit at the bottom of the shape.
export function silhouette(n, r = rng(37)) {
  const pts = sampleCanvas((ctx, W, H) => {
    const cx = W / 2; ctx.fillStyle = "#fff"; ctx.beginPath();
    ctx.ellipse(cx, 190, 92, 118, 0, 0, Math.PI * 2); ctx.fill();                       // head
    ctx.beginPath(); ctx.moveTo(cx - 48, 280); ctx.lineTo(cx + 48, 280); ctx.lineTo(cx + 56, 360); ctx.lineTo(cx - 56, 360); ctx.fill(); // neck
    ctx.beginPath(); ctx.moveTo(cx - 60, 340); ctx.bezierCurveTo(cx - 190, 360, cx - 270, 400, cx - 290, 520); ctx.lineTo(cx + 290, 520);
    ctx.bezierCurveTo(cx + 270, 400, cx + 190, 360, cx + 60, 340); ctx.closePath(); ctx.fill(); // shoulders
    // ragged hair line
    for (let a = -2.9; a < -0.25; a += 0.05) { const rr = 118 + 18 * r(); ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 88, 190 + Math.sin(a) * rr * 0.98, 6 + 10 * r(), 0, Math.PI * 2); ctx.fill(); }
  }, n, { w: 640, h: 540, height: 2.1, depth: 0.05, r });
  const luma = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = pts[3 * i], y = pts[3 * i + 1];
    const face = Math.exp(-((x * x) / 0.12 + ((y - 0.48) * (y - 0.48)) / 0.25)); // light falls on the face
    pts[3 * i + 2] += 0.22 * face;                                              // and gives it some depth
    luma[i] = Math.min(1, 0.22 + 0.7 * face + 0.25 * r());
  }
  return { positions: pts, luma };
}

// Outline maps (approximate, lon/lat) for the "where" stage: India, the UAE and a dotted arc between them.
const INDIA = [[68.2,23.7],[68.8,24.3],[70,24.6],[71.1,24.4],[70.4,25.7],[70,26.5],[69.5,27],[70.6,27.9],[71.9,27.9],[72.8,28.9],[73.4,29.9],[74.5,30.9],[74.6,31.9],[75.3,32.3],[74.4,32.8],[73.9,33.7],[74.3,34.6],[73.8,35.1],[75.5,36.2],[77.8,35.5],[78.9,34.3],[78.8,33.5],[79.5,32.6],[78.8,31.3],[80.3,30.4],[81.1,30],[82,28.6],[83.3,27.4],[84.6,27.3],[85.8,26.6],[87.9,26.4],[88.1,27.9],[88.8,27.3],[89.7,26.7],[92,26.8],[92.6,27.8],[94,28.6],[95.4,29],[96.6,28.6],[97.4,27.9],[96.2,27.2],[95.2,26],[94.6,25],[94.2,23.9],[93.4,23],[92.6,21.9],[92.3,23.7],[91.6,24.1],[91.9,24.9],[90.2,25.2],[89.8,26],[88.6,26.2],[88.1,25.4],[88.7,24.3],[88.9,22.9],[89,21.6],[87,21.4],[86.5,20.2],[85,19.3],[84,18.2],[82.3,17],[81.3,16.3],[80.3,15.8],[80.2,13.5],[79.9,12],[79.8,10.3],[78.4,9],[77.5,8.1],[76.6,8.9],[75.8,11.4],[74.8,12.9],[74.1,14.8],[73.4,16.3],[72.8,19],[72.8,21.2],[72.5,22.2],[72.1,21.2],[70.8,20.8],[69.1,22.3],[69.6,22.9],[68.2,23.7]];
const UAE = [[51.58,24.26],[51.95,23.95],[52.55,24.2],[53.15,24.12],[53.75,24.06],[54.12,24.15],[54.55,24.45],[54.95,24.85],[55.3,25.25],[55.55,25.5],[55.85,25.72],[56.05,26.02],[56.15,25.8],[56.27,25.6],[56.35,25.3],[56.37,24.95],[56.05,24.85],[55.95,24.55],[55.82,24.25],[55.98,24.05],[55.55,23.95],[55.4,23.5],[55.2,22.7],[54,22.6],[52.58,22.94],[51.58,24.26]];
export function indiaUae(n) {
  const lon0 = 50.5, lat0 = 37, k = 13; // equirectangular, scaled for a ~1200x420 canvas
  const P = ([lon, lat]) => [(lon - lon0) * k * Math.cos((22 * Math.PI) / 180) + 30, (lat0 - lat) * k + 10];
  return sampleCanvas((ctx) => {
    ctx.fillStyle = "#fff";
    for (const poly of [INDIA, UAE]) { ctx.beginPath(); poly.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); }
    // dotted arc from the UAE (Abu Dhabi) to India (Kerala coast)
    const a = P([54.4, 24.4]), b = P([76.3, 10.0]), c = [(a[0] + b[0]) / 2, Math.min(a[1], b[1]) + 120];
    for (let t = 0.04; t < 0.97; t += 0.025) { const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1];
      ctx.beginPath(); ctx.arc(x, y, 2.6, 0, Math.PI * 2); ctx.fill(); }
  }, n, { w: 640, h: 400, height: 1.75, depth: 0.04 });
}

// Decode a portrait uploaded through the admin panel ({n, p, l}) and resample it to n points.
export function portrait(data, n, r = rng(29)) {
  const out = new Float32Array(3 * n), luma = new Float32Array(n);
  for (let i = 0; i < n; i++) { const k = i < data.n ? i : Math.floor(r() * data.n);
    out[3 * i] = data.p[3 * k] / 1000; out[3 * i + 1] = data.p[3 * k + 1] / 1000; out[3 * i + 2] = data.p[3 * k + 2] / 1000; luma[i] = data.l[k] / 255; }
  return { positions: out, luma };
}

// Turn a photo into a portrait point cloud (used by the admin panel).
// The background colour is estimated from the image border and removed (works for white studio
// backgrounds as well as dark ones); brighter parts of the subject attract more, brighter particles,
// so skin and clothes read as lit while hair and eyes stay darker. The subject is framed so its
// bounding box is two units tall and centred, with the shoulders at the bottom edge.
export function imageToPoints(img, { count = 22000, removeBackground = true, tolerance = 0.045, gamma = 1.2, depth = 0.25 } = {}, r = rng(31)) {
  const H = 320, W = Math.max(1, Math.round((img.naturalWidth || img.width) * (H / (img.naturalHeight || img.height))));
  const c = document.createElement("canvas"); c.width = W; c.height = H; const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H); const px = ctx.getImageData(0, 0, W, H).data;
  // background colour: average of the outer border (top and sides; the bottom is usually the subject's shoulders)
  let br = 0, bg = 0, bb = 0, bn = 0; const edge = Math.max(2, Math.round(W * 0.03));
  for (let y = 0; y < H * 0.85; y++) for (let x = 0; x < W; x++) if (x < edge || x >= W - edge || y < edge) { const i = 4 * (y * W + x); br += px[i]; bg += px[i + 1]; bb += px[i + 2]; bn++; }
  br /= bn; bg /= bn; bb /= bn;
  const lum = new Float32Array(W * H), mask = new Float32Array(W * H);
  let minX = W, maxX = 0, minY = H, maxY = 0;
  for (let i = 0; i < W * H; i++) {
    const R = px[4 * i], G = px[4 * i + 1], B = px[4 * i + 2], a = px[4 * i + 3] / 255;
    lum[i] = (0.2126 * R + 0.7152 * G + 0.0722 * B) / 255;
    const dist = Math.sqrt((R - br) ** 2 + (G - bg) ** 2 + (B - bb) ** 2) / 441.7;
    mask[i] = a * (removeBackground ? Math.min(1, Math.max(0, (dist - tolerance) / 0.05)) : 1);
    if (mask[i] > 0.5) { const x = i % W, y = (i / W) | 0; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX <= minX || maxY <= minY) { minX = 0; maxX = W - 1; minY = 0; maxY = H - 1; }
  const s = 2 / (maxY - minY + 1), cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const p = [], l = []; let guard = 0;
  while (l.length < count && guard++ < count * 80) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), k = y * W + x, m = mask[k], v = lum[k];
    if (m <= 0 || r() > m * (0.16 + 0.84 * Math.pow(v, gamma))) continue;
    p.push(Math.round((x - cx + r() - 0.5) * s * 1000), Math.round(-(y - cy + r() - 0.5) * s * 1000), Math.round((v - 0.5) * depth * 1000));
    l.push(Math.round((0.2 + 0.8 * v) * 255));
  }
  return { v: 1, n: l.length, p, l };
}
