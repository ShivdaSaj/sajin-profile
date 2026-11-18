// One particle system tells the whole story: each scroll stage has its own shape, and the vertex shader
// blends between neighbouring shapes with a per-particle stagger, turbulence and pointer glow.
import * as THREE from "/vendor/three.module.min.js";
import * as S from "./shapes.js";

const vertexShader = /* glsl */ `
  attribute vec3 aGlobe; attribute vec3 aIndia; attribute vec3 aUae; attribute vec3 aHelix; attribute vec3 aSpiral; attribute vec3 aFrame; attribute vec3 aOrigin;
  attribute vec4 aRand; // x delay, y size, z phase, w luma
  uniform float uTime, uStage, uFormation, uRing, uTurb, uSize, uPixelRatio, uGlow, uAspect, uHelixSpin;
  uniform vec2 uPointer; uniform vec4 uRect;
  varying float vAlpha; varying float vGlow;

  vec3 rotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, c * p.y - s * p.z, s * p.y + c * p.z); }
  float weight(float k, float i, float f) { return (1.0 - f) * step(abs(k - i), 0.5) + f * step(abs(k - i - 1.0), 0.5); }

  void main() {
    float i = floor(uStage);
    float f = smoothstep(0.0, 1.0, clamp((fract(uStage) - aRand.x * 0.16) / 0.84, 0.0, 1.0)); // lightly staggered morph
    vec3 frameP = vec3(mix(uRect.x, uRect.y, aFrame.x), mix(uRect.w, uRect.z, aFrame.y), aFrame.z * 0.03);
    vec3 helixP = rotX(aHelix, uHelixSpin);
    vec3 p = position * (weight(0.0, i, f) + weight(1.0, i, f))
           + aGlobe * weight(2.0, i, f) + aIndia * weight(3.0, i, f) + aUae * weight(4.0, i, f)
           + helixP * (weight(5.0, i, f) + weight(6.0, i, f)) + aSpiral * weight(7.0, i, f) + frameP * weight(8.0, i, f);

    // turbulence while travelling between shapes and while scrolling fast
    float travel = sin(3.14159 * f) * step(0.001, fract(uStage));
    float amp = travel * 0.16 + uTurb * 0.06;
    float t = uTime * 0.6 + aRand.z * 6.2831;
    p += amp * vec3(sin(t + p.y * 3.1), cos(t * 1.3 + p.x * 2.7), sin(t * 0.7 + p.z * 4.0));
    p += 0.006 * vec3(sin(uTime * 1.7 + aRand.z * 40.0), cos(uTime * 1.3 + aRand.z * 31.0), 0.0); // idle shimmer

    // first appearance: from a scattered shell into the shape, each particle on its own delay
    float form = smoothstep(aRand.x * 0.55, aRand.x * 0.55 + 0.45, uFormation);
    p = mix(aOrigin, p, form);
    // preloader: particles held on a slowly turning ring
    float ra = aRand.z * 6.2831 + uTime * 0.15;
    vec3 ring = vec3(cos(ra), sin(ra) + 0.12, 0.0) * (0.62 + (aRand.x - 0.5) * 0.05);
    p = mix(p, ring, uRing);

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    vec2 ndc = gl_Position.xy / gl_Position.w;
    float d = distance(ndc * vec2(uAspect, 1.0), uPointer * vec2(uAspect, 1.0));
    vGlow = uGlow * exp(-d * d * 9.0);
    gl_PointSize = uSize * (0.55 + aRand.y) * uPixelRatio * (1.0 + vGlow * 1.2) / -mv.z;
    vAlpha = (0.32 + 0.68 * aRand.w) * mix(0.5, 1.0, form);
  }`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor; uniform float uExposure; varying float vAlpha; varying float vGlow;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha * uExposure;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor * (1.0 + vGlow * 0.8), a);
  }`;

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
export function createParticles(container, { content, portraitData, reducedMotion, coarse }) {
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
  const indiaShape = S.india(n), uaeShape = S.uae(n);
  g.setAttribute("aIndia", new THREE.BufferAttribute(indiaShape, 3)); g.setAttribute("aUae", new THREE.BufferAttribute(uaeShape, 3));
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
    uPointer: { value: new THREE.Vector2(0, 0) }, uRect: { value: new THREE.Vector4(-1, 1, -0.3, 0.3) },
    uColor: { value: new THREE.Color(content.site.theme.particle) }, uExposure: { value: coarse ? 0.75 : 0.55 },
  };
  const mat = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
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
    state.anchors = mapAnchors.map((a) => { tmp.copy(a).applyMatrix4(group.matrixWorld).project(camera); return { x: (tmp.x * 0.5 + 0.5) * W, y: (0.5 - tmp.y * 0.5) * H }; });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return { state, resize, dispose() { running = false; renderer.dispose(); g.dispose(); mat.dispose(); renderer.domElement.remove(); } };
}
