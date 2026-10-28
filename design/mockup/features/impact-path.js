// "What breaks if…" (impact) and "How a visitor reaches the site" (request path).
// Both work by highlighting part of the map and fading the rest.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'impact.title': 'Если остановится',
      'impact.none': 'Ничего больше не пострадает.',
      'impact.count': 'Пострадают: {n}',
      'impact.show': 'Показать на схеме',
      'impact.hide': 'Скрыть',
      'impact.needs': 'Зависит от',
      'impact.tip': 'Кто перестанет работать, если этот узел остановится или пропадёт. Считается по связям на схеме: запросы, базы, сеть, «работает на».',
      'impact.elsewhere': 'на другом уровне',
      'path.btn': 'Путь запроса',
      'path.btn.tip': 'Показать, через что проходит посетитель, когда открывает gridman.example, и сколько занимает каждый шаг.',
      'path.title': 'Посетитель → gridman.example',
      'path.total': 'Всего',
      'path.slow': 'Самый долгий шаг — gridman-api: 35 мс. Обычно это медленный запрос к базе или нехватка процессора. Посмотрите логи API.',
      'path.s.internet': 'Посетитель в интернете',
      'path.s.dns': 'DNS: gridman.example → 203.0.113.45',
      'path.s.uplink': 'Канал Timeweb',
      'path.s.web': 'HTTPS → gridman-web',
      'path.s.api': 'HTTP → gridman-api',
      'path.s.pg': 'SQL → postgres',
      'path.outside': 'снаружи',
      'path.inside': 'внутри gridman.example',
    },
    en: {
      'impact.title': 'If it stops',
      'impact.none': 'Nothing else is affected.',
      'impact.count': 'Affected: {n}',
      'impact.show': 'Show on the map',
      'impact.hide': 'Hide',
      'impact.needs': 'Depends on',
      'impact.tip': 'Who stops working if this node stops or disappears. Computed from the links on the map: requests, databases, network, "runs on".',
      'impact.elsewhere': 'on another level',
      'path.btn': 'Request path',
      'path.btn.tip': 'Show what a visitor passes through when opening gridman.example and how long each step takes.',
      'path.title': 'Visitor → gridman.example',
      'path.total': 'Total',
      'path.slow': 'The slowest step is gridman-api: 35 ms. Usually a slow database query or not enough CPU. Check the API logs.',
      'path.s.internet': 'Visitor on the internet',
      'path.s.dns': 'DNS: gridman.example → 203.0.113.45',
      'path.s.uplink': 'Timeweb channel',
      'path.s.web': 'HTTPS → gridman-web',
      'path.s.api': 'HTTP → gridman-api',
      'path.s.pg': 'SQL → postgres',
      'path.outside': 'outside',
      'path.inside': 'inside gridman.example',
    },
  });

  // ---------- Dependency graph: needs[X] = nodes X cannot work without ----------
  var needs = {};
  function need(x, y) { (needs[x] = needs[x] || []).indexOf(y) < 0 && needs[x].push(y); }
  Object.keys(A.VIEWS).forEach(function (v) {
    A.VIEWS[v].edges.forEach(function (e) {
      var L = A.LINKS[e[4]];
      if (!L || L.state === 'planned') return;
      if (/http|db|queue|ws|dns/.test(L.kind)) need(e[0], e[1]); // caller needs the called
      else need(e[1], e[0]); // network: the device further from the internet needs the one closer to it
    });
  });
  Object.keys(A.NODES).forEach(function (id) { if (A.NODES[id].on) need(id, A.NODES[id].on); });

  function walk(start, next) {
    var seen = {}, queue = [start], out = [];
    while (queue.length) {
      var x = queue.shift();
      next(x).forEach(function (y) { if (!seen[y] && y !== start) { seen[y] = 1; out.push(y); queue.push(y); } });
    }
    return out;
  }
  function dependents(id) { return walk(id, function (x) { return Object.keys(needs).filter(function (k) { return needs[k].indexOf(x) >= 0; }); }); }
  function requirements(id) { return walk(id, function (x) { return needs[x] || []; }); }

  // ---------- Highlight engine shared by impact and path ----------
  var mode = null; // { kind: 'impact'|'path', nodes: {id: cls}, links: {id: 1} }

  function apply() {
    var pos = A.positions();
    document.querySelectorAll('#nodes .node').forEach(function (el) {
      el.classList.remove('impact', 'impact-src', 'on-path', 'faded');
      if (!mode) return;
      var c = mode.nodes[el.dataset.id];
      el.classList.add(c || 'faded');
    });
    document.querySelectorAll('#groups .group').forEach(function (g) { g.classList.toggle('faded', !!mode && mode.kind === 'path'); });
    document.querySelectorAll('#edges [data-a]').forEach(function (el) {
      el.classList.remove('faded', 'on-path');
      if (!mode) return;
      var keep = mode.kind === 'path' ? mode.links[el.dataset.lid] : (mode.nodes[el.dataset.a] && mode.nodes[el.dataset.b]);
      if (!keep) el.classList.add('faded');
      else if (mode.kind === 'path' && el.classList.contains('edge')) el.classList.add('on-path');
    });
    void pos;
  }
  A.HOOKS.afterRender.push(apply);
  A.HOOKS.afterEdges.push(apply);

  function clear() { mode = null; apply(); var card = document.getElementById('path-card'); if (card) card.remove(); syncPathBtn(); }
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && mode && !document.querySelector('.scrim.open')) clear(); });

  // ---------- Impact section in the node inspector ----------
  function row(id) {
    var n = A.NODES[id], here = !!A.positions()[id];
    return '<div class="row" data-goto="' + id + '" style="cursor:pointer"><span class="dot ' + n.state + '"></span><span class="grow">' + A.nodeName(n) + '</span>' +
      '<span class="faint">' + (here ? t(n.type) : t('impact.elsewhere')) + '</span></div>';
  }

  A.HOOKS.nodeInspector.push(function (id) {
    if (id === 'internet' || A.NODES[id].state === 'planned') return '';
    var down = dependents(id), up = requirements(id);
    var on = mode && mode.kind === 'impact' && mode.src === id;
    var html = '<div class="section"><h3 class="section-title">' + t('impact.title') + ' <span class="help" data-tip="' + A.attr(t('impact.tip')) + '">?</span></h3>';
    if (!down.length) html += '<p class="faint" style="margin:0">' + t('impact.none') + '</p>';
    else {
      html += '<div class="callout warn" style="margin-bottom:8px"><span><strong>' + t('impact.count').replace('{n}', down.length) + '</strong></span></div>' +
        down.slice(0, 6).map(row).join('') +
        '<button class="btn btn-sm" style="margin-top:8px" data-impact="' + id + '">' + glIcon('impact') + (on ? t('impact.hide') : t('impact.show')) + '</button>';
    }
    if (up.length) html += '<h3 class="section-title" style="margin-top:16px">' + t('impact.needs') + '</h3>' + up.slice(0, 5).map(row).join('');
    return html + '</div>';
  });

  document.getElementById('inspector').addEventListener('click', function (e) {
    var b = e.target.closest('[data-impact]');
    if (!b) return;
    var id = b.dataset.impact;
    if (mode && mode.kind === 'impact' && mode.src === id) { clear(); A.renderInspector(); return; }
    var nodes = {}; nodes[id] = 'impact-src';
    dependents(id).forEach(function (d) { nodes[d] = 'impact'; });
    mode = { kind: 'impact', src: id, nodes: nodes };
    apply();
    A.renderInspector();
  });

  // Changing selection drops an impact highlight that belongs to another node.
  A.HOOKS.afterRender.unshift(function () {
    if (mode && mode.kind === 'impact' && mode.src !== A.selected) { mode = null; }
  });

  // ---------- Request path ----------
  var STEPS = [
    { node: 'internet', label: 'path.s.internet', ms: 0, level: 'root' },
    { node: 'domain', link: 'dns-root', label: 'path.s.dns', ms: 12, level: 'root' },
    { node: 'tw', link: 'up-cloud', label: 'path.s.uplink', ms: 12, level: 'root' },
    { node: 'web', link: 'dns-web', label: 'path.s.web', ms: 8, level: 'in-tw' },
    { node: 'api', link: 'rq-web', label: 'path.s.api', ms: 35, level: 'in-tw', slow: true },
    { node: 'pg', link: 'rq-api', label: 'path.s.pg', ms: 4, level: 'in-tw' },
  ];

  function pathMode() {
    var nodes = {}, links = {};
    STEPS.forEach(function (s) { nodes[s.node] = 'on-path'; if (s.link) links[s.link] = 1; });
    return { kind: 'path', nodes: nodes, links: links };
  }

  function renderCard() {
    var old = document.getElementById('path-card');
    if (old) old.remove();
    var total = STEPS.reduce(function (s, x) { return s + x.ms; }, 0);
    var card = document.createElement('div');
    card.id = 'path-card';
    card.className = 'float-card';
    card.innerHTML = '<div class="fc-head">' + glIcon('path') + '<b>' + t('path.title') + '</b><span class="grow"></span><span class="mono faint">' + t('path.total') + ' ' + total + ' ms</span>' +
      '<button class="icon-btn" data-path-close>' + glIcon('x') + '</button></div>' +
      '<ol class="path-steps">' + STEPS.map(function (s, i) {
        var here = A.view === s.level;
        return '<li class="' + (s.slow ? 'slow' : '') + (here ? '' : ' away') + '" data-step="' + i + '"><span class="pn">' + (i + 1) + '</span><span class="grow">' + t(s.label) +
          '<span class="lvl">' + (s.level === 'root' ? t('path.outside') : t('path.inside')) + '</span></span><span class="mono">' + (s.ms ? '+' + s.ms + ' ms' : '') + '</span></li>';
      }).join('') + '</ol>' +
      '<div class="callout warn" style="margin:8px 12px 12px"><span>' + t('path.slow') + '</span></div>';
    document.getElementById('canvas').appendChild(card);
  }

  function syncPathBtn() {
    var b = document.getElementById('path-btn');
    if (b) b.setAttribute('aria-pressed', mode && mode.kind === 'path' ? 'true' : 'false');
  }

  function showPath() { mode = pathMode(); apply(); renderCard(); syncPathBtn(); }

  A.HOOKS.ready.push(function () {
    var tools = document.querySelector('.canvas-tools');
    var b = document.createElement('button');
    b.className = 'btn btn-sm';
    b.id = 'path-btn';
    b.dataset.i18nTip = 'path.btn.tip';
    b.innerHTML = glIcon('path') + '<span data-i18n="path.btn"></span>';
    tools.appendChild(b);
    GL.apply(tools);
    b.addEventListener('click', function () { if (mode && mode.kind === 'path') clear(); else showPath(); });
  });

  document.getElementById('canvas').addEventListener('mousedown', function (e) {
    if (e.target.closest('[data-path-close]')) { clear(); e.stopPropagation(); return; }
    var li = e.target.closest('[data-step]');
    if (li) {
      e.stopPropagation();
      var s = STEPS[+li.dataset.step];
      if (A.view !== s.level) A.go(s.level);
      A.select(s.node);
      mode = pathMode(); apply(); renderCard();
    }
  }, true);

  // Re-draw the card on level change and language switch so "here / away" stays right.
  A.HOOKS.afterRender.push(function () { if (mode && mode.kind === 'path') renderCard(); });

  A.impact = { dependents: dependents, requirements: requirements, clear: clear, showPath: showPath };
})();
