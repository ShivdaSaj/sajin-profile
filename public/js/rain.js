// Digital rain behind the particles, for themes with "rain" on. Columns of glyphs fall with bright heads;
// scrolling speeds them up. Drawn at ~30 fps on a 2D canvas, and fully stopped when the theme has no rain.
const GLYPHS = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+<>|";
const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];

export function createRain(canvas, { reducedMotion }) {
  const ctx = canvas.getContext("2d");
  let on = false, raf = 0, last = 0, acc = 0, W = 0, H = 0, size = 16, cols = [];
  const opt = { density: 0.6, speed: 1, color: "#00ff66", head: "#d4ffe0" };
  const api = { boost: 0 };

  function resize() {
    W = canvas.width = innerWidth; H = canvas.height = innerHeight; size = W < 760 ? 14 : 17;
    cols = Array.from({ length: Math.ceil(W / size) }, () => ({ y: -Math.random() * (H / size), v: 0.5 + Math.random() * 0.9, live: Math.random() < opt.density, prev: "" }));
  }
  function step(dt) {
    // fade what is already there (keeps the canvas transparent instead of painting the background)
    ctx.globalCompositeOperation = "destination-out"; ctx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 4.5)})`; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = "source-over"; ctx.font = `${size}px ui-monospace, "MS Gothic", monospace`; ctx.textBaseline = "top";
    const fast = 1 + api.boost;
    cols.forEach((c, i) => {
      if (!c.live) { if (Math.random() < 0.002 * opt.density) { c.live = true; c.y = -2; } return; }
      const x = i * size, row = Math.floor(c.y);
      c.y += c.v * opt.speed * fast * dt * 16;
      const nrow = Math.floor(c.y);
      if (nrow !== row && row >= 0) { ctx.fillStyle = opt.color; ctx.fillText(c.prev || pick(), x, row * size); } // last head becomes trail
      if (nrow >= 0) { c.prev = pick(); ctx.fillStyle = opt.head; ctx.fillText(c.prev, x, nrow * size); }
      if (nrow * size > H && Math.random() < 0.04) { c.y = -Math.random() * 12; c.v = 0.5 + Math.random() * 0.9; c.live = Math.random() < opt.density; }
    });
  }
  function frame(t) {
    if (!on) return;
    const dt = Math.min((t - (last || t)) / 1000, 0.1); last = t; acc += dt;
    if (acc >= 1 / 30) { step(acc); acc = 0; }
    api.boost *= 0.92;
    raf = requestAnimationFrame(frame);
  }
  api.set = (t) => {
    Object.assign(opt, { density: t.rainDensity, speed: t.rainSpeed, color: t.particle, head: t.particle2 });
    const want = !!t.rain && !reducedMotion;
    for (const c of cols) c.live = Math.random() < opt.density;
    if (want === on) return;
    on = want; canvas.classList.toggle("on", on);
    if (on) { resize(); last = 0; raf = requestAnimationFrame(frame); }
    else { cancelAnimationFrame(raf); setTimeout(() => !on && ctx.clearRect(0, 0, W, H), 900); }
  };
  addEventListener("resize", () => on && resize());
  document.addEventListener("visibilitychange", () => { if (!on) return; cancelAnimationFrame(raf); if (!document.hidden) { last = 0; raf = requestAnimationFrame(frame); } });
  resize();
  return api;
}
