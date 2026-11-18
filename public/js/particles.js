// One particle system tells the whole story: each scroll stage has its own shape, and the vertex shader
// blends between neighbouring shapes with a per-particle stagger, turbulence and pointer glow.
import * as THREE from "/vendor/three.module.min.js";
import * as S from "./shapes.js";

const vertexShader = /* glsl */ `
  attribute vec3 aGlobe; attribute vec3 aIndia; attribute vec3 aUae; attribute vec3 aHelix; attribute vec3 aSpiral; attribute vec3 aFrame; attribute vec3 aOrigin;
  attribute vec4 aRand; // x delay, y size, z phase, w luma
  attribute vec2 aCity; // night-view light on the India (x) and UAE (y) maps
  uniform float uTime, uStage, uFormation, uRing, uTurb, uSize, uPixelRatio, uGlow, uAspect, uHelixSpin;
  uniform float uNight, uFall, uPulse, uStyleSize, uGas, uGasSize, uGasFlow, uGalaxy, uSwirl, uWaves, uDust;
  uniform vec2 uPointer; uniform vec4 uRect; uniform vec2 uMapHide;
  varying float vAlpha; varying float vGlow; varying float vLight; varying float vNightW; varying float vGrad; varying float vGlyph; varying float vFlick; varying float vKeep; varying float vDust; varying vec3 vPos;

  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  float weight(float k, float i, float f) { return (1.0 - f) * step(abs(k - i), 0.5) + f * step(abs(k - i - 1.0), 0.5); }

  void main() {
    float i = floor(uStage);
    float f = smoothstep(0.0, 1.0, clamp((fract(uStage) - aRand.x * 0.16) / 0.84, 0.0, 1.0)); // lightly staggered morph
    vec3 frameP = vec3(mix(uRect.x, uRect.y, aFrame.x), mix(uRect.w, uRect.z, aFrame.y), aFrame.z * 0.03);
    vec3 helixP = rotX(aHelix, uHelixSpin);
    float wI = weight(3.0, i, f), wU = weight(4.0, i, f);
    vec3 p = position * (weight(0.0, i, f) + weight(1.0, i, f))
           + aGlobe * weight(2.0, i, f) + aIndia * wI + aUae * wU
           + helixP * (weight(5.0, i, f) + weight(6.0, i, f)) + aSpiral * weight(7.0, i, f) + frameP * weight(8.0, i, f);

    // turbulence while travelling between shapes and while scrolling fast
    float travel = sin(3.14159 * f) * step(0.001, fract(uStage));
    float amp = travel * 0.16 * (1.0 - uFall * 0.75) + uTurb * 0.06 + uPulse * 0.22;
    float t = uTime * 0.6 + aRand.z * 6.2831;
    p += amp * vec3(sin(t + p.y * 3.1), cos(t * 1.3 + p.x * 2.7), sin(t * 0.7 + p.z * 4.0));
    // "rain" transition: between shapes the particles drop like falling code, then re-form
    p.y -= uFall * travel * (0.3 + aRand.x * 1.2);
    p += 0.006 * vec3(sin(uTime * 1.7 + aRand.z * 40.0), cos(uTime * 1.3 + aRand.z * 31.0), 0.0); // idle shimmer

    // gaseous: every shape becomes slow, curling smoke; billows rise and roll with the flow
    float gt = uTime * 0.22 * uGasFlow + aRand.z * 6.2831;
    vec3 flow = vec3(sin(gt + p.y * 2.3) + 0.5 * sin(gt * 1.7 + p.z * 3.1), cos(gt * 0.8 + p.x * 1.9) + 0.4 * sin(gt * 1.3 + p.y * 2.7), sin(gt * 1.1 + p.x * 2.2));
    p += uGas * (0.045 + 0.05 * aRand.y) * flow * (0.4 + 0.6 * min(uGasFlow, 1.5));
    p.y += uGas * 0.03 * sin(uTime * 0.15 * uGasFlow + aRand.x * 6.2831);
    // galaxy: abstract 3D waves roll through every shape, particles curl in small swirls, and between pages
    // the cloud is pulled into a vortex; some particles leave as cosmic dust, a slowly turning star field
    float gT = uTime * 0.3;
    p.z += uGalaxy * uWaves * 0.13 * sin(p.x * 3.0 + gT * 2.0) * cos(p.y * 2.2 - gT);
    p.y += uGalaxy * uWaves * 0.035 * sin(p.z * 5.0 + p.x * 2.0 + gT * 1.5);
    float ca = gT * (1.0 + aRand.x) + length(p.xy) * 9.0 + aRand.z * 6.2831;
    p.xy += uGalaxy * uSwirl * 0.028 * vec2(cos(ca), sin(ca));
    float vort = uGalaxy * uSwirl * travel * (1.4 + aRand.x * 2.2) * (1.0 - 0.6 * min(length(p.xy), 1.0));
    p.xy = mat2(cos(vort), sin(vort), -sin(vort), cos(vort)) * p.xy;
    vDust = uGalaxy * step(1.0 - uDust, fract(aRand.z * 13.7 + aRand.y * 5.1));
    vec3 dust = aOrigin * 0.8; float da = uTime * 0.025 * (0.4 + aRand.x);
    dust.xz = mat2(cos(da), sin(da), -sin(da), cos(da)) * dust.xz;
    p = mix(p, dust, vDust);
    vPos = p;
    // first appearance: from a scattered shell into the shape, each particle on its own delay
    float form = smoothstep(aRand.x * 0.55, aRand.x * 0.55 + 0.45, uFormation);
    // with the rain transition the particles first fall in from above the view, in columns
    vec3 origin = mix(aOrigin, vec3(p.x + (aRand.z - 0.5) * 0.04, p.y + 2.6 + aRand.x * 3.2, p.z), uFall);
    p = mix(origin, p, form);
    // preloader: particles held on a slowly turning ring
    float ra = aRand.z * 6.2831 + uTime * 0.15;
    vec3 ring = vec3(cos(ra), sin(ra) + 0.12, 0.0) * (0.62 + (aRand.x - 0.5) * 0.05);
    p = mix(p, ring, uRing);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float d = distance(ndc * vec2(uAspect, 1.0), uPointer * vec2(uAspect, 1.0));
    vGlow = uGlow * exp(-d * d * 9.0);
    vLight = aCity.x * wI + aCity.y * wU; vNightW = uNight * (wI + wU);
    vGrad = 0.5 + 0.5 * sin(ndc.x * 2.2 - ndc.y * 1.4 + uTime * 0.25 + aRand.z * 0.8);
    vGlyph = mod(floor(aRand.z * 64.0) + floor(uTime * aRand.x * 3.0), 64.0);
    vFlick = 0.72 + 0.28 * sin(uTime * (3.0 + aRand.x * 9.0) + aRand.z * 30.0);
    float night = mix(1.0, mix(0.95, 2.1, vLight), vNightW); // lit cities are drawn larger on the night maps
    // gaseous mode draws a third of the particles as large, faint, overlapping puffs (the rest fade out)
    vKeep = 1.0 - uGas * step(0.34, fract(aRand.z * 7.31 + aRand.x * 3.7));
    float puff = mix(uStyleSize, 6.5 * uGasSize * (0.6 + 0.8 * aRand.x), uGas);
    puff *= mix(1.0, 0.5, vDust);
    gl_PointSize = vKeep < 0.01 ? 0.0 : uSize * puff * night * (0.55 + aRand.y) * uPixelRatio * (1.0 + vGlow * 1.2) / -mv.z;
    vAlpha = (0.32 + 0.68 * aRand.w) * mix(0.5, 1.0, form) * (1.0 - wI * uMapHide.x - wU * uMapHide.y); // "photo only" map pages hide their particles
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor, uColor2, uColor3, uCity, uLand; uniform float uExposure, uGradient, uStyle, uGlowAmt, uGas, uTime, uSpectrum, uGalaxy; uniform sampler2D uGlyphs;
  varying float vAlpha; varying float vGlow; varying float vLight; varying float vNightW; varying float vGrad; varying float vGlyph; varying float vFlick; varying float vKeep; varying float vDust; varying vec3 vPos;
  void main() {
    vec2 pc = gl_PointCoord; float d = length(pc - 0.5), a;
    if (uStyle < 0.5) a = smoothstep(0.5, 0.05, d);                                       // soft dot
    else if (uStyle < 1.5) a = smoothstep(0.5, 0.0, d) * 0.35 * uGlowAmt + exp(-d * d * 22.0); // neon: hot core and a halo
    else { vec2 cell = vec2(mod(vGlyph, 8.0), floor(vGlyph / 8.0)); a = texture2D(uGlyphs, (cell + pc) / 8.0).a * vFlick; } // code glyph
    // smoke puff: a soft gaussian broken up by a slowly turning wisp pattern
    float ang = vGlyph * 0.7 + uTime * 0.05; vec2 q = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * (pc - 0.5);
    float wisp = 0.55 + 0.45 * sin(q.x * 9.0 + sin(q.y * 7.0 + vGlyph) * 2.0);
    float gas = exp(-d * d * 11.0) * wisp * 0.16;
    a = mix(a, gas, uGas) * vKeep;
    a = mix(a, smoothstep(0.5, 0.0, d) * (0.45 + 0.55 * sin(uTime * 2.0 + vGlyph * 3.0)), vDust); // twinkling dust
    a *= vAlpha * uExposure * (1.0 + 0.35 * uGalaxy);
    vec3 col = mix(uColor, uColor2, vGrad * uGradient);
    // spectrum: three colours flowing through space like a nebula
    float h1 = 0.5 + 0.5 * sin(vPos.x * 1.8 + vPos.z * 0.9 + uTime * 0.15), h2 = 0.5 + 0.5 * sin(vPos.y * 2.4 - vPos.z * 1.2 - uTime * 0.11 + 2.0);
    col = mix(col, mix(mix(uColor, uColor2, h1), uColor3, h2 * 0.85), max(uSpectrum, uGalaxy));
    // night maps: dim land, warm city lights
    col = mix(col, mix(uLand, uCity, smoothstep(0.08, 0.6, vLight)), vNightW);
    a *= mix(1.0, mix(0.6, 1.8, vLight), vNightW);
    if (a < 0.003) discard;
    gl_FragColor = vec4(col * (1.0 + vGlow * 0.8 * uGlowAmt), a);
  }`;

// 8x8 atlas of code glyphs (half-width katakana, digits, symbols), drawn mirrored, for the "glyph" particle style.
function glyphAtlas() {
  const c = document.createElement("canvas"); c.width = c.height = 512; const x = c.getContext("2d");
  const chars = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z:=*+<>|";
  x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = '600 50px ui-monospace, "MS Gothic", "Noto Sans Mono CJK JP", monospace';
  for (let i = 0; i < 64; i++) { x.save(); x.translate((i % 8) * 64 + 32, Math.floor(i / 8) * 64 + 34); x.scale(-1, 1); x.fillText(chars[i % chars.length], 0, 0); x.restore(); }
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
const STYLES = { soft: 0, glow: 1, glyph: 2 }, STYLE_SIZE = { soft: 1, glow: 1.35, glyph: 2.1 };

// Per-stage pose of the whole cloud: x/y offset (fraction of view width/height), scale, rotations.
const POSES = [
  { x: 0, y: -0.13, s: 1.05, rx: 0, ry: 0, rz: 0 },       // 0 hero: portrait cropped at the shoulders
  { x: 0, y: -0.13, s: 1.1, rx: 0, ry: -0.6, rz: 0 },     // 1 statement: portrait turns away
  { x: 0, y: 0, s: 0.82, rx: 0.2, ry: 0, rz: -0.15 },     // 2 globe
  { x: 0, y: 0.02, s: 1.0, rx: 0, ry: 0, rz: 0, ms: 0.6 },   // 3 India ("From India")
  { x: 0, y: 0.03, s: 1.0, rx: 0, ry: 0, rz: 0, ms: 0.56 },  // 4 UAE, zoomed in ("Based in the UAE")
  { x: 0, y: 0.06, s: 1.0, rx: 0, ry: 0.25, rz: 0.38 },   // 5 how I work: diagonal ribbon
  { x: 0, y: -0.04, s: 1.05, rx: 0, ry: 0.4, rz: 0.22 },  // 6 selected works
  { x: 0.16, y: 0, s: 0.95, rx: -0.5, ry: 0, rz: 0 },     // 7 closing spiral
  { x: 0, y: 0, s: 1.0, rx: 0, ry: 0, rz: 0 },            // 8 frame (positions are already in view space)
];

const body = document.body;
export function createParticles(container, { theme, mode = "particle", gas = {}, galaxy = {}, maps = {}, portraitData, reducedMotion, coarse }) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" }); }
  catch (e) { console.warn("WebGL unavailable:", e); return null; }
  const n = coarse ? 9000 : 22000;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100); camera.position.z = 3.2;

  const hero = portraitData ? S.portrait(portraitData, n) : S.silhouette(n);
  const g = new THREE.BufferGeometry();
  const rand = new Float32Array(4 * n), r = S.rng(41);
  for (let i = 0; i < n; i++) { rand[4 * i] = r(); rand[4 * i + 1] = Math.pow(r(), 3) * 1.4 + 0.35 * hero.luma[i]; rand[4 * i + 2] = r(); rand[4 * i + 3] = hero.luma[i]; }
  g.setAttribute("position", new THREE.BufferAttribute(hero.positions, 3));
  g.setAttribute("aGlobe", new THREE.BufferAttribute(S.globe(n), 3));
  // map pages: the drawn outline, or particles sampled from NASA night imagery or a custom picture
  const mapShape = (which, outline) => { const m = maps[which];
    if (m?.img && m.cfg.source !== "outline") { try { return S.mapFromImage(n, m.img, which, m.cfg); } catch (e) { console.warn(`map ${which}:`, e.message); } }
    return outline(n); };
  const indiaShape = mapShape("india", S.india), uaeShape = mapShape("uae", S.uae);
  const mapRects = [indiaShape.rect, uaeShape.rect];
  g.setAttribute("aIndia", new THREE.BufferAttribute(indiaShape, 3)); g.setAttribute("aUae", new THREE.BufferAttribute(uaeShape, 3));
  const city = new Float32Array(2 * n); for (let i = 0; i < n; i++) { city[2 * i] = indiaShape.lights[i]; city[2 * i + 1] = uaeShape.lights[i]; }
  g.setAttribute("aCity", new THREE.BufferAttribute(city, 2));
  const anchor = (shape) => new THREE.Vector3(...(shape.anchors?.[0] || [0, 0, 0])), tmp = new THREE.Vector3();
  const mapAnchors = [anchor(indiaShape), anchor(uaeShape)];
  g.setAttribute("aHelix", new THREE.BufferAttribute(S.helix(n), 3));
  g.setAttribute("aSpiral", new THREE.BufferAttribute(S.spiral(n), 3));
  g.setAttribute("aFrame", new THREE.BufferAttribute(S.frame(n), 3));
  g.setAttribute("aOrigin", new THREE.BufferAttribute(S.scatter(n), 3));
  g.setAttribute("aRand", new THREE.BufferAttribute(rand, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50); // shapes move in the shader

  const u = {
    uTime: { value: 0 }, uStage: { value: 0 }, uFormation: { value: reducedMotion ? 1 : 0 }, uRing: { value: 0 }, uTurb: { value: 0 },
    uSize: { value: 4 }, uPixelRatio: { value: renderer.getPixelRatio() }, uGlow: { value: 0 }, uAspect: { value: 1 }, uHelixSpin: { value: 0 },
    uPointer: { value: new THREE.Vector2(0, 0) }, uMapHide: { value: new THREE.Vector2(maps.india?.cfg.view === "photo" && maps.india.img ? 1 : 0, maps.uae?.cfg.view === "photo" && maps.uae.img ? 1 : 0) }, uRect: { value: new THREE.Vector4(-1, 1, -0.3, 0.3) },
    uNight: { value: 0 }, uFall: { value: 0 }, uPulse: { value: 0 }, uStyleSize: { value: 1 }, uStyle: { value: 0 }, uGradient: { value: 0 }, uGlowAmt: { value: 1 },
    uColor: { value: new THREE.Color() }, uColor2: { value: new THREE.Color() }, uCity: { value: new THREE.Color() }, uLand: { value: new THREE.Color() },
    uExposure: { value: 0.55 }, uGlyphs: { value: null },
    uGalaxy: { value: mode === "galaxy" ? 1 : 0 }, uSwirl: { value: reducedMotion ? 0 : galaxy.swirl ?? 1 }, uWaves: { value: reducedMotion ? 0 : galaxy.waves ?? 1 }, uDust: { value: galaxy.dust ?? 0.16 },
    uSpectrum: { value: 0 }, uColor3: { value: new THREE.Color() },
    uGas: { value: mode === "gaseous" ? 1 : 0 }, uGasSize: { value: gas.size ?? 1 }, uGasFlow: { value: reducedMotion ? 0 : gas.flow ?? 1 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });

  // ---- themes: colours and numbers ease towards the new theme; the particle style swaps mid-burst ----
  const base = coarse ? 0.75 : 0.55;
  const goal = { spectrum: 0, color3: new THREE.Color(), color: new THREE.Color(), color2: new THREE.Color(), city: new THREE.Color(), land: new THREE.Color(), night: 0, fall: 0, gradient: 0, glow: 1, exposure: base, size: 1 };
  let swapTimer = 0;
  function setTheme(t, animate = true) {
    goal.color.set(t.particle); goal.color2.set(t.particle2); goal.color3.set(t.particle3); goal.spectrum = t.spectrum ? 1 : 0; goal.city.set(t.cityLight); goal.land.set(t.muted).lerp(goal.color, 0.25); // dim land under the night lights
    goal.night = t.nightMaps ? 1 : 0; goal.fall = t.transition === "rain" && !reducedMotion ? 1 : 0; goal.gradient = t.gradient ? 1 : 0; goal.glow = t.glow;
    goal.exposure = base * (t.kind === "light" ? 1.6 : t.style === "glow" ? 1.25 : t.style === "glyph" ? 2 : 1); goal.size = STYLE_SIZE[t.style] || 1;
    const swap = () => {
      if (t.style === "glyph" && !u.uGlyphs.value) u.uGlyphs.value = glyphAtlas();
      u.uStyle.value = STYLES[t.style] || 0;
      const blend = t.kind === "light" ? THREE.NormalBlending : THREE.AdditiveBlending; if (mat.blending !== blend) { mat.blending = blend; mat.needsUpdate = true; }
    };
    clearTimeout(swapTimer);
    if (animate && !reducedMotion) { u.uPulse.value = 1; swapTimer = setTimeout(swap, 180); }
    else { swap(); u.uColor.value.copy(goal.color); u.uColor2.value.copy(goal.color2); u.uColor3.value.copy(goal.color3); u.uSpectrum.value = goal.spectrum; u.uCity.value.copy(goal.city); u.uLand.value.copy(goal.land);
      u.uNight.value = goal.night; u.uFall.value = goal.fall; u.uGradient.value = goal.gradient; u.uGlowAmt.value = goal.glow; u.uExposure.value = goal.exposure; u.uStyleSize.value = goal.size; }
  }
  setTheme(theme, false);
  // display mode: particle (0) or gaseous (1); eases over about a second and a half, with a burst
  let gasGoal = u.uGas.value, galGoal = u.uGalaxy.value;
  function setMode(m, animate = true) { gasGoal = m === "gaseous" ? 1 : 0; galGoal = m === "galaxy" ? 1 : 0;
    if (!animate || reducedMotion) { u.uGas.value = gasGoal; u.uGalaxy.value = galGoal; } else u.uPulse.value = 1; }
  const points = new THREE.Points(g, mat), group = new THREE.Group(); group.add(points); scene.add(group);

  let viewW = 1, viewH = 1, W = 1, H = 1;
  function resize() {
    W = container.clientWidth || innerWidth; H = container.clientHeight || innerHeight;
    renderer.setSize(W, H, false); camera.aspect = W / H; camera.updateProjectionMatrix();
    viewH = 2 * Math.tan((camera.fov * Math.PI) / 360) * camera.position.z; viewW = viewH * camera.aspect;
    u.uAspect.value = W / H; u.uSize.value = THREE.MathUtils.clamp((H / 900) * 5.2, 2.6, 6.5);
  }
  resize(); addEventListener("resize", resize);

  // pointer: smoothed position and presence (for the hero head-turn and glow)
  const target = new THREE.Vector2(), ptr = new THREE.Vector2(); let present = 0, presence = 0;
  if (!reducedMotion) {
    addEventListener("pointermove", (e) => { target.set((e.clientX / innerWidth) * 2 - 1, -((e.clientY / innerHeight) * 2 - 1)); present = 1; }, { passive: true });
    document.addEventListener("pointerleave", () => (present = 0));
  }

  const state = { stage: 0, velocity: 0, ring: 0, formation: reducedMotion ? 1 : 0, rect: null, mobile: W < 760, anchors: [] };
  let shown = 0; // the stage actually drawn eases towards the scroll stage, so fast scrolls stay smooth
  const lerp = THREE.MathUtils.lerp;
  let last = performance.now(), spin = 0, running = true;
  let dragging = false, dragX = 0, dragV = 0, dragAdd = 0;
  const globeActive = () => Math.abs(state.stage - 2) < 0.45;
  if (!reducedMotion) {
    addEventListener("pointerdown", (e) => { if (!globeActive() || e.button > 0 || e.target.closest?.("a,button,input,textarea")) return; dragging = true; dragX = e.clientX; dragV = 0; document.body.classList.add("is-dragging"); });
    addEventListener("pointermove", (e) => { if (!dragging) return; const dx = e.clientX - dragX; dragX = e.clientX; const d = (dx / Math.min(innerWidth, 900)) * Math.PI; dragAdd += d; dragV = d; }, { passive: true });
    const end = () => { if (dragging) { dragging = false; document.body.classList.remove("is-dragging"); } };
    addEventListener("pointerup", end); addEventListener("pointercancel", end);
  }
  function frame(now) {
    if (!running) return;
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!reducedMotion) u.uTime.value += dt;
    shown = reducedMotion ? state.stage : shown + (state.stage - shown) * (1 - Math.exp(-dt / 0.11));
    if (Math.abs(state.stage - shown) < 1e-4) shown = state.stage;
    const s = shown; u.uStage.value = s; u.uRing.value = state.ring; u.uFormation.value = state.formation;
    u.uTurb.value += (Math.min(Math.abs(state.velocity) / 2400, 1) - u.uTurb.value) * (1 - Math.exp(-dt / 0.15));
    const tk = 1 - Math.exp(-dt / 0.28), ease = (key, v) => (u[key].value += (v - u[key].value) * tk);
    u.uColor.value.lerp(goal.color, tk); u.uColor2.value.lerp(goal.color2, tk); u.uCity.value.lerp(goal.city, tk); u.uLand.value.lerp(goal.land, tk);
    ease("uNight", goal.night); ease("uFall", goal.fall); ease("uGradient", goal.gradient); ease("uGlowAmt", goal.glow); ease("uExposure", goal.exposure); ease("uStyleSize", goal.size);
    u.uPulse.value *= Math.exp(-dt / 0.45);
    u.uGas.value += (gasGoal - u.uGas.value) * (1 - Math.exp(-dt / 0.5));
    u.uGalaxy.value += (galGoal - u.uGalaxy.value) * (1 - Math.exp(-dt / 0.6));
    u.uColor3.value.lerp(goal.color3, tk); ease("uSpectrum", goal.spectrum);
    // pose: blend the two neighbouring stage poses
    const i = Math.min(Math.floor(s), POSES.length - 1), f = THREE.MathUtils.smoothstep(s - i, 0, 1), a = POSES[i], b = POSES[Math.min(i + 1, POSES.length - 1)];
    const mob = W < 760, k = (key) => lerp(a[key], b[key], f);
    const sc = lerp(a.s * (mob ? a.ms ?? 0.62 : 1), b.s * (mob ? b.ms ?? 0.62 : 1), f) * Math.min(1, viewH / 2.3);
    group.scale.setScalar(sc);
    group.position.set(k("x") * viewW * (mob ? 0.15 : 1), k("y") * viewH - (mob && s < 1 ? 0.12 * viewH : 0), 0);
    // hero: turn towards the pointer and glow near it; globe spins; helix rolls
    ptr.lerp(target, 1 - Math.exp(-dt / 0.35)); presence += (present - presence) * (1 - Math.exp(-dt / (present ? 0.35 : 1.1)));
    const heroW = 1 - THREE.MathUtils.clamp(s, 0, 1);
    const idle = reducedMotion ? 0 : Math.sin(u.uTime.value * 0.17) * 0.12;
    const globeW = Math.max(0, 1 - Math.abs(s - 2));
    if (!dragging) { dragAdd += dragV; dragV *= Math.exp(-dt / 0.35); } // momentum after release
    spin = (spin + dt * 0.35 * globeW + dragAdd) % (Math.PI * 2); dragAdd = 0;
    state.globeAngle = spin; state.globeActive = globeActive(); body.classList.toggle("can-drag", state.globeActive && !reducedMotion);
    group.rotation.set(k("rx") + heroW * -ptr.y * 0.22 * presence, k("ry") + heroW * lerp(idle, ptr.x * 0.35, presence) + spin * globeW, k("rz"));
    u.uHelixSpin.value = reducedMotion ? 0 : u.uTime.value * 0.35;
    u.uPointer.value.copy(ptr); u.uGlow.value = 1.6 * presence * heroW;
    // contact frame: map the email box (CSS pixels) into the group's local space
    if (state.rect && s > 7) {
      const R = state.rect, pad = Math.min(R.height * 0.8, 48), vpad = Math.min(R.height * 0.28, 14);
      const toX = (px) => (px / W - 0.5) * viewW, toY = (py) => -(py / H - 0.5) * viewH;
      const gp = group.position, gs = group.scale.x;
      // undo the group transform so the frame lands on the box (rotation is ~0 at this stage)
      u.uRect.value.set((toX(R.left - pad) - gp.x) / gs, (toX(R.right + pad) - gp.x) / gs, (toY(R.top - vpad) - gp.y) / gs, (toY(R.bottom + vpad) - gp.y) / gs);
    }
    renderer.render(scene, camera);
    // screen positions (CSS px) of the map anchors, for the From/Based labels
    const toScreen = (x, y) => { tmp.set(x, y, 0).applyMatrix4(group.matrixWorld).project(camera); return { x: (tmp.x * 0.5 + 0.5) * W, y: (0.5 - tmp.y * 0.5) * H }; };
    state.anchors = mapAnchors.map((a) => toScreen(a.x, a.y));
    // screen rectangles of the map pictures, for the photo layer
    state.mapRects = mapRects.map((rc) => { if (!rc) return null; const a = toScreen(rc[0], rc[1]), b = toScreen(rc[2], rc[3]); return { l: a.x, t: a.y, w: b.x - a.x, h: b.y - a.y }; });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { state, resize, setTheme, setMode, dispose() { running = false; renderer.dispose(); g.dispose(); mat.dispose(); renderer.domElement.remove(); } };
}
