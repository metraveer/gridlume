// Small things that matter on a big map: a minimap, "only problems" filter, collapsing a whole place.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'pol.filter': 'Только проблемы',
      'pol.filter.tip': 'Приглушить всё, что работает нормально, и оставить на виду только то, что требует внимания.',
      'pol.collapse': 'Свернуть или развернуть место',
      'pol.collapsed': 'узлов: {n}',
      'pol.minimap': 'Мини-карта: нажмите, чтобы перейти в это место',
    },
    en: {
      'pol.filter': 'Only problems',
      'pol.filter.tip': 'Fade everything that works fine and keep only what needs attention in view.',
      'pol.collapse': 'Collapse or expand the place',
      'pol.collapsed': 'nodes: {n}',
      'pol.minimap': 'Minimap: click to jump there',
    },
  });

  var onlyProblems = false, collapsed = {};

  function isProblem(id) { var n = A.NODES[id]; return n && (n.state === 'warn' || n.state === 'crit' || (n.flags || []).some(function (f) { return f[0] === 'warn' || f[0] === 'crit'; })); }

  // ---------- Only problems ----------
  function applyFilter() {
    if (!onlyProblems) return;
    var keep = {};
    Object.keys(A.positions()).forEach(function (id) { if (isProblem(id)) keep[id] = 1; });
    Object.keys(A.VIEWS).forEach(function (v) {
      A.VIEWS[v].edges.forEach(function (e) {
        var L = A.LINKS[e[4]];
        if (L && (L.state === 'warn' || L.state === 'crit')) { keep[e[0]] = keep[e[1]] = 1; }
      });
    });
    document.querySelectorAll('#nodes .node').forEach(function (el) { if (!keep[el.dataset.id]) el.classList.add('faded'); });
    document.querySelectorAll('#edges [data-a]').forEach(function (el) {
      var L = A.LINKS[el.dataset.lid];
      if (!L || (L.state !== 'warn' && L.state !== 'crit')) el.classList.add('faded');
    });
  }

  // ---------- Collapse a place ----------
  function applyCollapse() {
    if (A.view !== 'root') return;
    document.querySelectorAll('#groups .group[data-place]').forEach(function (g) {
      var p = g.dataset.place, c = !!collapsed[p];
      g.classList.toggle('collapsed', c);
      var count = Object.keys(A.positions()).filter(function (id) { return A.NODES[id].place === p; }).length;
      var tag = g.querySelector('.collapsed-count');
      if (c && !tag) g.insertAdjacentHTML('beforeend', '<span class="collapsed-count faint">' + t('pol.collapsed').replace('{n}', count) + '</span>');
      if (!c && tag) tag.remove();
    });
    var hidden = {};
    Object.keys(A.positions()).forEach(function (id) { if (collapsed[A.NODES[id].place]) hidden[id] = 1; });
    document.querySelectorAll('#nodes .node').forEach(function (el) { el.style.display = hidden[el.dataset.id] ? 'none' : ''; });
    document.querySelectorAll('#edges [data-a]').forEach(function (el) { el.style.display = hidden[el.dataset.a] || hidden[el.dataset.b] ? 'none' : ''; });
  }

  // ---------- Minimap ----------
  function bounds() {
    var xs = [], ys = [];
    A.VIEWS[A.view].groups.forEach(function (g) { xs.push(g.x, g.x + g.w); ys.push(g.y, g.y + g.h); });
    Object.keys(A.positions()).forEach(function (id) { var p = A.positions()[id]; xs.push(p[0], p[0] + 188); ys.push(p[1], p[1] + 52); });
    return { x: Math.min.apply(null, xs) - 40, y: Math.min.apply(null, ys) - 40, w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + 80, h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + 80 };
  }

  function drawMinimap() {
    var mm = document.getElementById('minimap');
    if (!mm) return;
    var b = bounds(), W = 180, H = 110, s = Math.min(W / b.w, H / b.h);
    var ox = (W - b.w * s) / 2, oy = (H - b.h * s) / 2;
    var X = function (x) { return (ox + (x - b.x) * s).toFixed(1); }, Y = function (y) { return (oy + (y - b.y) * s).toFixed(1); };
    var html = A.VIEWS[A.view].groups.map(function (g) {
      return '<rect class="mm-group" x="' + X(g.x) + '" y="' + Y(g.y) + '" width="' + (g.w * s).toFixed(1) + '" height="' + (g.h * s).toFixed(1) + '" rx="2"/>';
    }).join('');
    Object.keys(A.positions()).forEach(function (id) {
      var p = A.positions()[id], n = A.NODES[id];
      html += '<rect class="mm-node ' + n.state + '" x="' + X(p[0]) + '" y="' + Y(p[1]) + '" width="' + (150 * s).toFixed(1) + '" height="' + (40 * s).toFixed(1) + '" rx="1"/>';
    });
    // Viewport rectangle: what is visible on the canvas right now.
    var c = document.getElementById('canvas').getBoundingClientRect(), z = A.zoom, pan = A.pan;
    var vx = -pan[0] / z, vy = -pan[1] / z, vw = c.width / z, vh = c.height / z;
    html += '<rect class="mm-view" x="' + X(vx) + '" y="' + Y(vy) + '" width="' + (vw * s).toFixed(1) + '" height="' + (vh * s).toFixed(1) + '"/>';
    mm.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '">' + html + '</svg>';
    mm._map = { b: b, s: s, ox: ox, oy: oy };
  }

  A.HOOKS.afterRender.push(function () { applyCollapse(); applyFilter(); drawMinimap(); });
  A.HOOKS.afterEdges.push(function () { applyCollapse(); applyFilter(); });
  A.HOOKS.view.push(drawMinimap);

  A.HOOKS.ready.push(function () {
    var tools = document.querySelector('.canvas-tools');
    var f = document.createElement('button');
    f.className = 'btn btn-sm';
    f.id = 'filter-btn';
    f.setAttribute('aria-pressed', 'false');
    f.dataset.i18nTip = 'pol.filter.tip';
    f.innerHTML = glIcon('filter') + '<span data-i18n="pol.filter"></span>';
    tools.appendChild(f);
    GL.apply(tools);
    f.addEventListener('click', function () {
      onlyProblems = !onlyProblems;
      f.setAttribute('aria-pressed', onlyProblems ? 'true' : 'false');
      A.render();
    });

    var mm = document.createElement('div');
    mm.id = 'minimap';
    mm.className = 'minimap';
    mm.dataset.i18nTip = 'pol.minimap';
    document.getElementById('canvas').appendChild(mm);
    GL.apply(mm);
    mm.addEventListener('mousedown', function (e) {
      var r = mm.getBoundingClientRect(), m = mm._map;
      var x = m.b.x + (e.clientX - r.left - m.ox) / m.s, y = m.b.y + (e.clientY - r.top - m.oy) / m.s;
      A.panTo(x, y);
    });

    document.getElementById('canvas').addEventListener('mousedown', function (e) {
      var c = e.target.closest('[data-collapse]');
      if (!c) return;
      e.stopPropagation();
      collapsed[c.dataset.collapse] = !collapsed[c.dataset.collapse];
      A.render();
    }, true);
    drawMinimap();
  });
})();
