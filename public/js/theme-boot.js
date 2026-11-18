// Runs before first paint: picks the visitor's theme (saved choice, preview link, system preference or the
// site default) and applies its colours, so the page never flashes the wrong theme.
(function () {
  var el = document.getElementById("theme-data"), T;
  try { T = JSON.parse(el.textContent); } catch (e) { return; }
  var KEY = "sp-theme", root = document.documentElement, listeners = [];
  function initial() {
    var q = null; try { q = new URLSearchParams(location.search).get("theme"); } catch (e) { /* old browser */ }
    if (q && T.list[q]) return q; // preview link from the admin panel
    var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
    if (T.switcher && saved && T.enabled.indexOf(saved) >= 0) return saved;
    if (T.followSystem && window.matchMedia) {
      var light = matchMedia("(prefers-color-scheme: light)").matches;
      if (light && T.enabled.indexOf("light") >= 0) return "light";
      if (!light && T.list[T.default].kind === "light") for (var i = 0; i < T.enabled.length; i++) if (T.list[T.enabled[i]].kind === "dark") return T.enabled[i];
    }
    return T.default;
  }
  function apply(id) {
    var t = T.list[id]; if (!t) return;
    var s = root.style;
    s.setProperty("--bg", t.bg); s.setProperty("--fg", t.fg); s.setProperty("--muted", t.muted); s.setProperty("--accent", t.accent);
    s.setProperty("--particle", t.particle); s.setProperty("--particle2", t.particle2); s.colorScheme = t.kind;
    root.setAttribute("data-theme", id); root.setAttribute("data-kind", t.kind); root.setAttribute("data-style", t.style);
    root.toggleAttribute("data-mono", !!t.mono); root.toggleAttribute("data-glow", !!t.textGlow);
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", t.bg);
  }
  var current = initial(); apply(current);
  window.__spTheme = {
    data: T,
    get id() { return current; },
    get theme() { return T.list[current]; },
    set: function (id) {
      if (!T.list[id] || id === current) return; current = id; apply(id);
      try { localStorage.setItem(KEY, id); } catch (e) { /* storage blocked */ }
      for (var i = 0; i < listeners.length; i++) listeners[i](id, T.list[id]);
    },
    on: function (fn) { listeners.push(fn); },
  };
})();
