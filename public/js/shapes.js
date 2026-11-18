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
export function sampleCanvas(draw, n, { w = 900, h = 300, height = 1.2, depth = 0.08, r = rng(23), anchors = [] } = {}) {
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
  out.anchors = anchors.map(([x, y]) => [(x - cx) * s, -(y - cy) * s, 0]); // canvas points mapped into shape space
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

// Outline maps (approximate lon/lat) for the two "where" pages: India, then a zoomed-in UAE.
const INDIA = [[68.2,23.7],[68.8,24.3],[70,24.6],[71.1,24.4],[70.4,25.7],[70,26.5],[69.5,27],[70.6,27.9],[71.9,27.9],[72.8,28.9],[73.4,29.9],[74.5,30.9],[74.6,31.9],[75.3,32.3],[74.4,32.8],[73.9,33.7],[74.3,34.6],[73.8,35.1],[75.5,36.2],[77.8,35.5],[78.9,34.3],[78.8,33.5],[79.5,32.6],[78.8,31.3],[80.3,30.4],[81.1,30],[82,28.6],[83.3,27.4],[84.6,27.3],[85.8,26.6],[87.9,26.4],[88.1,27.9],[88.8,27.3],[89.7,26.7],[92,26.8],[92.6,27.8],[94,28.6],[95.4,29],[96.6,28.6],[97.4,27.9],[96.2,27.2],[95.2,26],[94.6,25],[94.2,23.9],[93.4,23],[92.6,21.9],[92.3,23.7],[91.6,24.1],[91.9,24.9],[90.2,25.2],[89.8,26],[88.6,26.2],[88.1,25.4],[88.7,24.3],[88.9,22.9],[89,21.6],[87,21.4],[86.5,20.2],[85,19.3],[84,18.2],[82.3,17],[81.3,16.3],[80.3,15.8],[80.2,13.5],[79.9,12],[79.8,10.3],[78.4,9],[77.5,8.1],[76.6,8.9],[75.8,11.4],[74.8,12.9],[74.1,14.8],[73.4,16.3],[72.8,19],[72.8,21.2],[72.5,22.2],[72.1,21.2],[70.8,20.8],[69.1,22.3],[69.6,22.9],[68.2,23.7]];
// UAE mainland, traced more finely because it fills the screen on its own page.
const UAE = [[51.58,24.26],[51.73,24.29],[51.85,24.03],[52.05,23.97],[52.3,24.03],[52.58,24.18],[52.9,24.15],[53.2,24.1],[53.45,24.05],[53.7,24.06],[53.95,24.12],[54.12,24.17],[54.3,24.25],[54.45,24.33],[54.55,24.45],[54.68,24.6],[54.85,24.78],[55,24.92],[55.15,25.05],[55.3,25.2],[55.45,25.33],[55.55,25.45],[55.68,25.55],[55.8,25.65],[55.95,25.78],[56.05,25.95],[56.08,26.07],[56.17,25.85],[56.27,25.62],[56.33,25.4],[56.37,25.15],[56.37,24.95],[56.25,24.88],[56.05,24.85],[55.98,24.7],[55.95,24.55],[55.85,24.4],[55.82,24.25],[55.95,24.12],[55.98,24.05],[55.75,24],[55.55,23.95],[55.5,23.75],[55.4,23.5],[55.3,23.1],[55.2,22.7],[54.6,22.65],[54,22.6],[53.3,22.75],[52.58,22.94],[51.95,23.6],[51.58,24.26]];
const UAE_ISLANDS = [[52.6,24.32,7],[52.87,25.15,5],[52.3,24.5,6],[53.06,24.6,4],[53.6,24.5,4],[54.2,24.6,4],[51.9,24.75,4],[54.45,24.55,5]]; // lon, lat, radius px
const UAE_CITIES = [[54.37,24.45],[55.27,25.2],[55.4,25.35]]; // Abu Dhabi, Dubai, Sharjah

// Draw lon/lat polygons on a canvas with an equirectangular projection and sample particles from it.
function mapShape(n, polys, { lon0, lat0, k, w, h, height, anchors = [], draw = () => {} }) {
  const cosLat = Math.cos((((lat0 - h / 2 / k) * Math.PI) / 180));
  const P = ([lon, lat]) => [(lon - lon0) * k * cosLat + 20, (lat0 - lat) * k + 20];
  return sampleCanvas((ctx) => { ctx.fillStyle = "#fff";
    for (const poly of polys) { ctx.beginPath(); poly.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.fill(); }
    draw(ctx, P);
  }, n, { w, h, height, depth: 0.04, anchors: anchors.map(P) });
}

// Night view: each map particle gets a light value (0..1) from its distance to the cities and roads, so the
// dark themes can draw the maps as seen from orbit at night. Cities are [lon, lat, brightness, radius in degrees].
const INDIA_CITIES = [[77.2,28.61,1,.5],[72.88,19.08,1,.42],[88.36,22.57,.9,.4],[80.27,13.08,.85,.34],[77.59,12.97,.85,.36],[78.49,17.39,.8,.34],
  [72.57,23.02,.7,.3],[73.86,18.52,.65,.28],[75.79,26.91,.55,.26],[80.95,26.85,.55,.26],[76.27,9.93,.65,.24],[76.95,8.52,.55,.2],[80.33,26.45,.45,.22],
  [79.09,21.15,.45,.22],[85.14,25.6,.45,.22],[72.83,21.17,.5,.22],[77.41,23.26,.4,.2],[83.22,17.69,.4,.2],[91.74,26.14,.38,.2],[76.78,30.73,.42,.2],
  [76.96,11.0,.4,.2],[75.86,22.72,.4,.2],[75.78,11.25,.38,.18],[78.12,9.93,.35,.18],[82.97,25.32,.35,.18],[74.8,34.08,.3,.18],[85.82,20.3,.35,.18],
  [74.87,31.63,.35,.18],[73.02,26.24,.3,.18],[81.63,21.25,.3,.18],[86.43,23.8,.3,.16],[74.12,15.49,.3,.16]];
const UAE_LIGHTS = [[54.37,24.45,1,.1],[55.27,25.2,1,.13],[55.4,25.33,.85,.07],[55.45,25.4,.6,.045],[55.55,25.56,.4,.035],[55.95,25.79,.6,.055],
  [56.33,25.12,.5,.045],[56.35,25.34,.35,.03],[55.76,24.21,.7,.075],[52.73,24.11,.45,.04],[53.7,23.68,.3,.03],[55.06,25.0,.75,.06],[54.5,24.36,.6,.05],[54.62,24.47,.5,.04]];
const UAE_ROADS = [[[54.37,24.45],[54.62,24.47],[55.06,25.0],[55.27,25.2],[55.4,25.33],[55.95,25.79]],[[55.27,25.2],[55.76,24.21],[54.37,24.45]],
  [[54.37,24.45],[53.7,23.68]],[[54.37,24.45],[52.73,24.11]],[[55.55,25.56],[56.33,25.12]]];

function nightLights(pts, cities, perDeg, roads = [], r = rng(47)) {
  const n = pts.length / 3, out = new Float32Array(n);
  const segDist = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy); };
  for (let i = 0; i < n; i++) {
    const x = pts[3 * i], y = pts[3 * i + 1]; let L = 0;
    for (const [cx, cy, w, rad] of cities) { const s = rad * perDeg, d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (s * s); if (d2 < 9) L = Math.max(L, w * Math.exp(-d2)); }
    for (const road of roads) for (let j = 1; j < road.length; j++) { const d = segDist(x, y, road[j - 1], road[j]) / (0.018 * perDeg); if (d < 3) L = Math.max(L, 0.42 * Math.exp(-d * d) * (0.6 + 0.4 * r())); }
    if (L < 0.12 && r() < 0.045) L = 0.16 + r() * 0.3; // scattered towns
    out[i] = Math.min(1, L);
  }
  return out;
}
// Map one city list through the projection: anchors 1 and 2 are one degree of latitude apart, for scale.
function withLights(n, polys, opts, cities, roads, clusterShare, r) {
  const a0 = opts.anchors[0], cal = [[a0[0], a0[1]], [a0[0], a0[1] - 1]];
  const pts = mapShape(n, polys, { ...opts, anchors: [...opts.anchors, ...cal, ...cities.map((c) => [c[0], c[1]]), ...roads.flat()] });
  const k = opts.anchors.length, perDeg = Math.abs(pts.anchors[k][1] - pts.anchors[k + 1][1]);
  const proj = pts.anchors.slice(k + 2, k + 2 + cities.length).map((p, i) => [p[0], p[1], cities[i][2], cities[i][3]]);
  let o = k + 2 + cities.length; const roadsP = roads.map((rd) => rd.map(() => pts.anchors[o++]));
  // a share of the particles gathers on the cities (weighted by brightness), so they read as dense lights
  const total = proj.reduce((s, c) => s + c[2], 0), extra = Math.floor(n * clusterShare);
  for (let j = 0; j < extra; j++) { let pick = r() * total, c = proj[0]; for (const q of proj) { pick -= q[2]; if (pick <= 0) { c = q; break; } }
    const i = Math.floor(r() * n), s = c[3] * perDeg * 0.7, g = () => (r() + r() + r() - 1.5) * s;
    pts[3 * i] = c[0] + g(); pts[3 * i + 1] = c[1] + g(); pts[3 * i + 2] = (r() - 0.5) * 0.02; }
  pts.lights = nightLights(pts, proj, perDeg, roadsP, r);
  pts.anchors = pts.anchors.slice(0, k);
  return pts;
}

// Projection and outline of each map page (shared by the drawn outline and the NASA imagery).
const MAP_OPTS = {
  india: { polys: [INDIA], lon0: 67.5, lat0: 36.6, k: 13.5, w: 440, h: 420, height: 1.8, anchors: [[78.5, 22.5]] },
  uae: { polys: [UAE], islands: UAE_ISLANDS, lon0: 51.3, lat0: 26.3, k: 118, w: 600, h: 480, height: 1.35, anchors: UAE_CITIES },
};
// NASA Black Marble night imagery (VIIRS, 2016) shipped with the site, with the lon/lat bounds of each crop.
export const NASA_MAPS = {
  india: { image: "/img/maps/india-night.jpg", bounds: [67.5, 98.5, 6, 37] }, // west, east, south, north
  uae: { image: "/img/maps/uae-night.jpg", bounds: [51.3, 56.7, 22.4, 26.4] },
};
// Country outline as percentages of the NASA crop, for clipping the photo to the country (CSS clip-path).
export function outlineClip(which) {
  const [w, e, s, n] = NASA_MAPS[which].bounds;
  return `polygon(${MAP_OPTS[which].polys[0].map(([lon, lat]) => `${(((lon - w) / (e - w)) * 100).toFixed(2)}% ${(((n - lat) / (n - s)) * 100).toFixed(2)}%`).join(",")})`;
}

// A map made from a picture: particles gather where the picture is bright (where it is dark with `invert`),
// the land keeps a faint scatter, and each particle's brightness drives the night-light colouring.
// "nasa" pictures are placed by lon/lat with the same projection as the drawn outline (and can be clipped to
// the country); "custom" pictures fill the frame and the label pin sits at (pinX, pinY) of the picture.
export function mapFromImage(n, img, which, { source, mask = true, invert = false, pinX = 0.5, pinY = 0.5 }, r = rng(53)) {
  const o = MAP_OPTS[which], f = 3, cv = document.createElement("canvas"); let W, H, P, rect, bbox, anchors, height;
  if (source === "nasa") {
    W = o.w * f; H = o.h * f; const cosLat = Math.cos((((o.lat0 - o.h / 2 / o.k) * Math.PI) / 180));
    P = ([lon, lat]) => [((lon - o.lon0) * o.k * cosLat + 20) * f, ((o.lat0 - lat) * o.k + 20) * f];
    const [bw, be, bs, bn] = NASA_MAPS[which].bounds, [x0, y0] = P([bw, bn]), [x1, y1] = P([be, bs]);
    rect = [x0, y0, x1, y1]; anchors = o.anchors.map(P); height = o.height;
    if (mask) { const pts = o.polys.flat().map(P); bbox = [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))]; }
    else bbox = rect;
  } else {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, sc = Math.min(1200 / iw, 1200 / ih, 4);
    W = Math.round(iw * sc); H = Math.round(ih * sc); rect = bbox = [0, 0, W, H]; anchors = [[pinX * W, pinY * H]]; height = null;
  }
  cv.width = W; cv.height = H; const ctx = cv.getContext("2d", { willReadFrequently: true });
  ctx.save();
  if (source === "nasa" && mask) {
    ctx.beginPath(); for (const poly of o.polys) poly.forEach((p, i) => { const [x, y] = P(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    for (const [lon, lat, rad] of o.islands || []) { const [x, y] = P([lon, lat]); ctx.moveTo(x + rad * f * 1.6, y); ctx.arc(x, y, rad * f * 1.6, 0, Math.PI * 2); }
    ctx.clip();
  }
  ctx.drawImage(img, rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1]); ctx.restore();
  const px = ctx.getImageData(0, 0, W, H).data;
  const lumAt = (k) => (0.2126 * px[4 * k] + 0.7152 * px[4 * k + 1] + 0.0722 * px[4 * k + 2]) / 255;
  const weight = (L) => 0.045 + Math.pow(invert ? 1 - L : L, 1.35) * 2.6, wMax = 2.645;
  // scale: masked maps match the drawn outline's height; whole pictures fit a 1.9 x 2.7 box
  const bw = bbox[2] - bbox[0], bh = bbox[3] - bbox[1];
  const s = height ? height / bh : Math.min(1.9 / bh, 2.7 / bw), cx = (bbox[0] + bbox[2]) / 2, cy = (bbox[1] + bbox[3]) / 2;
  const out = new Float32Array(3 * n), lights = new Float32Array(n); let i = 0, guard = 0;
  while (i < n && guard++ < n * 400) {
    const x = Math.floor(r() * W), y = Math.floor(r() * H), k = y * W + x;
    if (px[4 * k + 3] < 128) continue;
    const L = lumAt(k); if (r() * wMax > weight(L)) continue;
    out[3 * i] = (x - cx + r() - 0.5) * s; out[3 * i + 1] = -(y - cy + r() - 0.5) * s; out[3 * i + 2] = (r() - 0.5) * 0.04;
    const v = invert ? 1 - L : L; lights[i] = Math.min(1, Math.max(0, (v - 0.07) / 0.5)); i++;
  }
  if (i < n * 0.5) throw new Error("picture has too little detail for a map");
  for (; i < n; i++) { const k = Math.floor(r() * (i - 1)); out[3 * i] = out[3 * k]; out[3 * i + 1] = out[3 * k + 1]; out[3 * i + 2] = out[3 * k + 2]; lights[i] = lights[k]; }
  const toShape = ([x, y]) => [(x - cx) * s, -(y - cy) * s, 0];
  out.anchors = anchors.map(toShape); out.lights = lights;
  out.rect = [...toShape([rect[0], rect[1]]).slice(0, 2), ...toShape([rect[2], rect[3]]).slice(0, 2)]; // left, top, right, bottom (shape space)
  return out;
}

// Page 4: India on its own; the label is pinned near the centre of the country.
export const india = (n, r = rng(45)) => withLights(n, [INDIA], { lon0: 67.5, lat0: 36.6, k: 13.5, w: 440, h: 420, height: 1.8, anchors: [[78.5, 22.5]] }, INDIA_CITIES, [], 0.05, r);

// Page 5: the UAE, zoomed in, with offshore islands; particles cluster on the cities so they glow.
// The label is pinned to Abu Dhabi (anchor 0).
export const uae = (n, r = rng(43)) => withLights(n, [UAE], { lon0: 51.3, lat0: 26.3, k: 118, w: 600, h: 480, height: 1.35, anchors: UAE_CITIES,
  draw: (ctx, P) => { for (const [lon, lat, rad] of UAE_ISLANDS) { const [x, y] = P([lon, lat]); ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); } } }, UAE_LIGHTS, UAE_ROADS, 0.07, r);

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
