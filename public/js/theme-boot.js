// Runs before first paint: applies the theme and the display mode (particle or gaseous) chosen in the admin
// panel, so the page never flashes the wrong look. Visitors can't change them. With automatic rotation the
// choice is derived from the clock, so every visitor sees the same theme at the same time, and it is
// re-checked every second so the page changes live. ?theme=<id> and ?mode=<mode> are admin preview links.
(function () {
  var el = document.getElementById("theme-data"), T;
  try { T = JSON.parse(el.textContent); } catch (e) { return; }
  var root = document.documentElement, onTheme = [], onMode = [];
  var q = {}; try { var sp = new URLSearchParams(location.search); q.theme = sp.get("theme"); q.mode = sp.get("mode"); } catch (e) { /* old browser */ }
  var hash = function (n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return (n ^ (n >>> 15)) >>> 0; };

  function themeAt(now) {
    if (q.theme && T.list[q.theme]) return q.theme;
    var list = T.enabled.length ? T.enabled : [T.default];
    if (T.selection === "auto" && list.length > 1) {
      var period = Math.floor(now / 1000 / T.interval);
      if (T.order === "random") { // a random theme each period, never the same twice in a row
        var pick = function (p) { return hash(p) % list.length; }, i = pick(period);
        if (i === pick(period - 1)) i = (i + 1 + (hash(period * 7 + 3) % (list.length - 1))) % list.length;
        return list[i];
      }
      return list[period % list.length];
    }
    if (T.followSystem && window.matchMedia) {
      var light = matchMedia("(prefers-color-scheme: light)").matches;
      if (light && T.enabled.indexOf("light") >= 0) return "light";
      if (!light && T.list[T.default].kind === "light") for (var j = 0; j < T.enabled.length; j++) if (T.list[T.enabled[j]].kind === "dark") return T.enabled[j];
    }
    return T.default;
  }
  function modeAt(now) {
    var MODES = ["particle", "gaseous", "galaxy"];
    if (MODES.indexOf(q.mode) >= 0) return q.mode;
    if (T.mode === "auto") return MODES[Math.floor(now / 1000 / T.modeInterval) % 3];
    return T.mode;
  }
  function apply(id) {
    var t = T.list[id], s = root.style;
    s.setProperty("--bg", t.bg); s.setProperty("--fg", t.fg); s.setProperty("--muted", t.muted); s.setProperty("--accent", t.accent);
    s.setProperty("--particle", t.particle); s.setProperty("--particle2", t.particle2); s.setProperty("--particle3", t.particle3); s.colorScheme = t.kind;
    root.setAttribute("data-theme", id); root.setAttribute("data-kind", t.kind); root.setAttribute("data-style", t.style);
    root.toggleAttribute("data-mono", !!t.mono); root.toggleAttribute("data-glow", !!t.textGlow);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t.bg);
  }
  var current = themeAt(Date.now()), mode = modeAt(Date.now());
  apply(current); root.setAttribute("data-mode", mode);
  function tick() {
    var now = Date.now(), id = themeAt(now), md = modeAt(now), i;
    if (id !== current) { current = id; apply(id); for (i = 0; i < onTheme.length; i++) onTheme[i](id, T.list[id]); }
    if (md !== mode) { mode = md; root.setAttribute("data-mode", md); for (i = 0; i < onMode.length; i++) onMode[i](md); }
  }
  if (T.selection === "auto" || T.mode === "auto") setInterval(tick, 1000);
  window.__spTheme = {
    data: T,
    get id() { return current; },
    get theme() { return T.list[current]; },
    get mode() { return mode; },
    on: function (fn) { onTheme.push(fn); },
    onMode: function (fn) { onMode.push(fn); },
  };
})();
