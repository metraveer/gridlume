// Gridlume mockup: demo data, three views of one graph, pan/zoom, draggable nodes, inspector, dialogs.
// Not product code — it exists to agree on layout, behaviour and wording before development.

(function () {
  var t = GL.t;

  // ---------- Demo data ----------
  var NODES = {
    internet: { icon: 'globe', name: 'Интернет', nameEn: 'Internet', type: 'type.internet', state: 'ok' },
    rt: { icon: 'router', name: 'Ростелеком', nameEn: 'Rostelecom', type: 'type.router', state: 'unknown', place: 'village' },
    calibur: { icon: 'laptop', name: 'calibur', type: 'type.server', sub: 'Acer E5-575G', state: 'ok', place: 'village' },
    max: { icon: 'server', name: 'max', type: 'type.server', state: 'planned', place: 'village' },
    keenetic: { icon: 'router', name: 'Keenetic', type: 'type.router', state: 'ok', place: 'city' },
    junk: { icon: 'server', name: 'junk', type: 'type.server', sub: 'HP t530', state: 'ok', place: 'city' },
    ha: { icon: 'home', name: 'Home Assistant', type: 'type.ha', state: 'ok', place: 'city', on: 'junk' },
    tw: { icon: 'cloud', name: 'gridman.pro', type: 'type.vps', sub: 'Timeweb · 4 vCPU', state: 'ok', place: 'cloud' },
    domain: { icon: 'domain', name: 'gridman.pro', type: 'type.domain', state: 'ok', place: 'cloud' },
    komodo: { icon: 'box', name: 'komodo-core', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    mongo: { icon: 'db', name: 'mongo', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    periphery: { icon: 'box', name: 'komodo-periphery', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    glcore: { icon: 'box', name: 'gridlume', type: 'type.container', state: 'planned', place: 'village', on: 'calibur' },
    web: { icon: 'app', name: 'gridman-web', type: 'type.service', state: 'ok', place: 'cloud', on: 'tw' },
    api: { icon: 'box', name: 'gridman-api', type: 'type.container', state: 'ok', place: 'cloud', on: 'tw' },
    pg: { icon: 'db', name: 'postgres', type: 'type.container', state: 'ok', place: 'cloud', on: 'tw' },
    worker: { icon: 'box', name: 'ffmpeg-worker', type: 'type.container', state: 'warn', place: 'cloud', on: 'tw' },
  };

  var VIEWS = {
    network: {
      groups: [
        { cls: 'village', label: 'place.village', x: 40, y: 150, w: 440, h: 330 },
        { cls: 'city', label: 'place.city', x: 520, y: 150, w: 300, h: 330 },
        { cls: 'cloud', label: 'place.cloud', x: 860, y: 150, w: 300, h: 330 },
      ],
      nodes: { internet: [556, 24], rt: [80, 204], calibur: [80, 380], max: [276, 292], keenetic: [576, 204], junk: [576, 380], tw: [916, 204], domain: [916, 380] },
      edges: [
        ['internet', 'rt', 'uplink', '700 Mbit'], ['internet', 'keenetic', 'uplink', '100 Mbit'], ['internet', 'tw', 'uplink', ''],
        ['rt', 'calibur', 'lan', '1 Gbit'], ['rt', 'max', 'lan planned', ''], ['keenetic', 'junk', 'lan', '1 Gbit'],
        ['calibur', 'junk', 'vpn', 'AmneziaWG'], ['domain', 'tw', 'dns', 'A 104.171.132.145'],
      ],
    },
    services: {
      groups: [
        { cls: 'machine', label: 'calibur', x: 40, y: 110, w: 420, h: 250 },
        { cls: 'machine', label: 'gridman.pro', x: 500, y: 110, w: 420, h: 250 },
        { cls: 'machine', label: 'junk', x: 960, y: 110, w: 220, h: 140 },
      ],
      nodes: { komodo: [70, 160], mongo: [270, 160], periphery: [70, 270], glcore: [270, 270], web: [530, 160], api: [730, 160], worker: [530, 270], pg: [730, 270], ha: [990, 160], domain: [530, 24] },
      edges: [
        ['web', 'api', 'depends', ''], ['api', 'pg', 'depends', ''], ['worker', 'pg', 'depends', ''], ['worker', 'api', 'depends', ''],
        ['komodo', 'mongo', 'depends', ''], ['periphery', 'komodo', 'depends', ''], ['domain', 'web', 'dns', ''],
      ],
    },
    places: {
      groups: [
        { cls: 'village', label: 'place.village', x: 40, y: 60, w: 380, h: 330, place: 'village' },
        { cls: 'city', label: 'place.city', x: 460, y: 60, w: 380, h: 220, place: 'city' },
        { cls: 'cloud', label: 'place.cloud', x: 880, y: 60, w: 380, h: 330, place: 'cloud' },
      ],
      nodes: {
        rt: [70, 110, 1], calibur: [70, 170, 1], max: [70, 230, 1], komodo: [244, 110, 1], mongo: [244, 170, 1], periphery: [244, 230, 1], glcore: [244, 290, 1],
        keenetic: [490, 110, 1], junk: [490, 170, 1], ha: [664, 110, 1],
        tw: [910, 110, 1], domain: [910, 170, 1], web: [1084, 110, 1], api: [1084, 170, 1], pg: [1084, 230, 1], worker: [1084, 290, 1],
      },
      edges: [],
    },
  };

  var DETAILS = {
    calibur: {
      kv: [['insp.place', 'place.village'], ['insp.address', '192.168.1.63'], ['insp.os', 'Debian 13.7'], ['insp.hw', 'i3-6006U · 2C/4T · 6 GB'], ['insp.agent', 'v0.1 · online'], ['insp.uptime', '3d 4h']],
      metrics: [['insp.cpu', '6%', [4, 6, 5, 9, 22, 18, 7, 5, 6, 8, 5, 6]], ['insp.ram', '37%', [30, 31, 31, 33, 34, 34, 35, 35, 36, 36, 36, 37]], ['insp.disk', '9%', [8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9]], ['insp.temp', '41°', [38, 39, 41, 44, 47, 43, 41, 40, 40, 41, 41, 41]]],
      children: ['komodo', 'mongo', 'periphery'],
      actions: [['logs', 'act.logs', 'safe'], ['terminal', 'act.terminal', 'careful'], ['restart', 'act.reboot', 'danger']],
      secrets: true,
    },
    api: {
      kv: [['insp.runson', 'gridman.pro'], ['insp.image', 'gridman/api:1.42'], ['insp.ports', '3000/tcp']],
      metrics: [['insp.cpu', '12%', [8, 10, 9, 14, 12, 11, 15, 13, 12, 12, 11, 12]], ['insp.ram', '410 MB', [380, 390, 395, 400, 402, 405, 406, 408, 409, 410, 410, 410]]],
      depends: ['pg'], usedBy: ['web', 'worker'],
      actions: [['logs', 'act.logs', 'safe'], ['restart', 'act.restart', 'careful'], ['stop', 'act.stop', 'danger'], ['move', 'act.move', 'danger']],
      secrets: true,
    },
    worker: {
      note: 'note.worker',
      kv: [['insp.runson', 'gridman.pro'], ['insp.image', 'gridman/worker:1.42']],
      metrics: [['insp.cpu', '96%', [40, 55, 70, 88, 92, 95, 96, 97, 95, 96, 96, 96], 'warn'], ['insp.ram', '1.1 GB', [0.6, 0.7, 0.8, 0.9, 1, 1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1]]],
      depends: ['pg', 'api'],
      actions: [['logs', 'act.logs', 'safe'], ['restart', 'act.restart', 'careful'], ['move', 'act.move', 'danger']],
    },
    rt: {
      note: 'note.rt',
      kv: [['insp.place', 'place.village'], ['insp.address', '192.168.0.1'], ['insp.agent', 'insp.manual']],
      actions: [],
    },
  };

  // ---------- State ----------
  var view = 'network';
  var selected = 'calibur';
  var zoom = 1, panX = 40, panY = 40;
  var pos = {}; // current node positions per view (copied so dragging persists per view)
  Object.keys(VIEWS).forEach(function (v) {
    pos[v] = {};
    Object.keys(VIEWS[v].nodes).forEach(function (id) { pos[v][id] = VIEWS[v].nodes[id].slice(); });
  });

  var $ = function (id) { return document.getElementById(id); };
  var world = $('world'), canvas = $('canvas');

  function nodeName(n) { return GL.lang === 'en' && n.nameEn ? n.nameEn : n.name; }
  function nodeSize(id) { var small = (pos[view][id] || [])[2] || NODES[id].type === 'type.container' || NODES[id].type === 'type.service' || NODES[id].type === 'type.ha'; return small ? [156, 40] : [188, 52]; }
  function stateClass(s) { return s; }

  // ---------- Rendering ----------
  function renderRail() {
    var items = [['map', 'rail.map', true], ['list', 'rail.nodes'], ['clock', 'rail.journal'], ['key', 'rail.vault']];
    $('rail').innerHTML = items.map(function (i) {
      return '<button class="icon-btn" aria-pressed="' + (i[2] ? 'true' : 'false') + '" data-i18n-tip="' + i[1] + '" data-i18n-label="' + i[1] + '">' + glIcon(i[0]) + '</button>';
    }).join('') + '<button class="icon-btn bottom" data-i18n-tip="rail.settings" data-i18n-label="rail.settings">' + glIcon('gear') + '</button>';
  }

  function renderGroups() {
    $('groups').innerHTML = VIEWS[view].groups.map(function (g) {
      var label = g.label.indexOf('.') > 0 ? t(g.label) : g.label;
      var sum = '';
      if (g.place) {
        var counts = { ok: 0, warn: 0, crit: 0 };
        Object.keys(NODES).forEach(function (id) { var n = NODES[id]; if (n.place === g.place && counts[n.state] !== undefined) counts[n.state]++; });
        sum = '<span class="place-sum"><span class="badge ok">' + counts.ok + '</span>' + (counts.warn ? '<span class="badge warn">' + counts.warn + '</span>' : '') + '</span>';
      }
      return '<div class="group ' + g.cls + '" style="left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px">' +
        '<span class="group-label">' + label + '</span>' + sum + '</div>';
    }).join('');
  }

  function renderNodes() {
    var html = '';
    Object.keys(pos[view]).forEach(function (id) {
      var n = NODES[id], p = pos[view][id], sz = nodeSize(id);
      var sub = (n.sub ? n.sub + ' · ' : '') + t(n.type);
      if (n.state === 'planned') sub = t('state.planned');
      html += '<div class="node' + (sz[0] < 188 ? ' small' : '') + (n.state === 'planned' ? ' planned' : '') + (id === selected ? ' selected' : '') +
        '" data-id="' + id + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px" data-tip="' + nodeName(n) + ' · ' + t('state.' + n.state) + '">' +
        '<span class="glyph">' + glIcon(n.icon) + '</span><span class="label"><span class="name">' + nodeName(n) + '</span><span class="sub">' + sub + '</span></span>' +
        '<span class="state"><span class="dot ' + stateClass(n.state) + '"></span></span></div>';
    });
    $('nodes').innerHTML = html;
  }

  function center(id) {
    var p = pos[view][id], s = nodeSize(id);
    return [p[0] + s[0] / 2, p[1] + s[1] / 2, s];
  }

  function renderEdges() {
    var out = '';
    VIEWS[view].edges.forEach(function (e) {
      var a = center(e[0]), b = center(e[1]);
      var dx = b[0] - a[0], dy = b[1] - a[1], d;
      if (Math.abs(dy) >= Math.abs(dx)) {
        var y1 = a[1] + Math.sign(dy) * a[2][1] / 2, y2 = b[1] - Math.sign(dy) * b[2][1] / 2, my = (y1 + y2) / 2;
        d = 'M' + a[0] + ' ' + y1 + ' C' + a[0] + ' ' + my + ' ' + b[0] + ' ' + my + ' ' + b[0] + ' ' + y2;
      } else {
        var x1 = a[0] + Math.sign(dx) * a[2][0] / 2, x2 = b[0] - Math.sign(dx) * b[2][0] / 2, mx = (x1 + x2) / 2;
        d = 'M' + x1 + ' ' + a[1] + ' C' + mx + ' ' + a[1] + ' ' + mx + ' ' + b[1] + ' ' + x2 + ' ' + b[1];
      }
      var hot = (e[0] === selected || e[1] === selected) ? ' hot' : '';
      out += '<path class="edge ' + e[2] + hot + '" d="' + d + '"/>';
      if (e[3]) out += '<text class="edge-label" x="' + ((a[0] + b[0]) / 2 + 6) + '" y="' + ((a[1] + b[1]) / 2 - 4) + '">' + e[3] + '</text>';
    });
    $('edges').innerHTML = out;
  }

  function applyTransform() {
    world.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
  }

  function spark(values, cls) {
    var max = Math.max.apply(null, values), min = Math.min.apply(null, values);
    var pts = values.map(function (v, i) { return (i * 96 / (values.length - 1)).toFixed(1) + ',' + (20 - (v - min) / ((max - min) || 1) * 18).toFixed(1); });
    return '<svg class="spark ' + (cls || '') + '" viewBox="0 0 96 22"><path d="M' + pts.join(' L') + '"/></svg>';
  }

  function linkRow(id, hint) {
    var n = NODES[id];
    return '<div class="row" data-goto="' + id + '" style="cursor:pointer"><span class="dot ' + n.state + '"></span><span class="grow">' + nodeName(n) + '</span><span class="faint">' + (hint || t(n.type)) + '</span></div>';
  }

  function renderInspector() {
    var el = $('inspector');
    if (!selected) { el.innerHTML = '<div class="insp-empty" data-i18n="insp.empty"></div>'; GL.apply(el); return; }
    var n = NODES[selected], d = DETAILS[selected] || {};
    var html = '<div class="insp-head"><span class="glyph">' + glIcon(n.icon) + '</span><div class="insp-title"><h1>' + nodeName(n) + '</h1>' +
      '<span class="sub">' + (n.sub ? n.sub + ' · ' : '') + t(n.type) + '</span></div><button class="icon-btn" id="insp-close" data-i18n-tip="insp.close">' + glIcon('x') + '</button></div>';
    html += '<div class="insp-state"><span class="badge ' + (n.state === 'unknown' || n.state === 'planned' ? '' : n.state) + '"><span class="dot ' + n.state + '"></span>' + t('state.' + n.state) + '</span>' +
      (n.place ? '<span class="badge">' + t('place.' + n.place) + '</span>' : '') + '</div>';

    if (d.note) html += '<div class="section"><div class="note">' + t(d.note) + '</div></div>';

    if (d.kv) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.overview') + '</h3><dl class="kv">' + d.kv.map(function (r) {
        var v = r[1].indexOf('place.') === 0 || r[1].indexOf('insp.') === 0 ? t(r[1]) : r[1];
        return '<dt>' + t(r[0]) + '</dt><dd' + (/\d/.test(v) ? ' class="mono"' : '') + '>' + v + '</dd>';
      }).join('') + '</dl></div>';
    }

    if (d.metrics) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.metrics') + '</h3>' + d.metrics.map(function (m) {
        return '<div class="metric"><span>' + t(m[0]) + '</span>' + spark(m[2], m[3]) + '<span class="val"' + (m[3] ? ' style="color:var(--warn)"' : '') + '>' + m[1] + '</span></div>';
      }).join('') + '</div>';
    }

    if (d.children) html += '<div class="section"><h3 class="section-title">' + t('insp.containers') + ' <span class="faint">' + d.children.length + '</span></h3>' + d.children.map(function (c) { return linkRow(c); }).join('') + '</div>';
    if (d.depends) html += '<div class="section"><h3 class="section-title">' + t('insp.dependson') + '</h3>' + d.depends.map(function (c) { return linkRow(c); }).join('') + '</div>';
    if (d.usedBy) html += '<div class="section"><h3 class="section-title">' + t('insp.usedby') + '</h3>' + d.usedBy.map(function (c) { return linkRow(c); }).join('') + '</div>';

    if (!d.children && !d.depends) {
      var links = [];
      Object.keys(VIEWS).forEach(function (v) { VIEWS[v].edges.forEach(function (e) {
        var other = e[0] === selected ? e[1] : e[1] === selected ? e[0] : null;
        if (other && links.indexOf(other) < 0) links.push(other);
      }); });
      if (n.on) links.unshift(n.on);
      if (links.length) html += '<div class="section"><h3 class="section-title">' + t('insp.links') + '</h3>' + links.map(function (c) { return linkRow(c); }).join('') + '</div>';
    }

    if (d.secrets) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.secrets') + ' <span class="help" data-tip="' + t('insp.vault.tip') + '">?</span></h3>' +
        '<div class="vault">' + glIcon('lock') + '<span class="grow">' + t('insp.vault.locked') + '</span><button class="btn btn-sm">' + t('insp.vault.unlock') + '</button></div></div>';
    }

    if (d.actions && d.actions.length) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.actions') + '</h3>' + d.actions.map(function (a) {
        return '<button class="action" data-act="' + a[0] + '" data-tip="' + t(a[1] + '.tip') + '">' + glIcon(a[0] === 'move' ? 'move' : a[0] === 'stop' ? 'stop' : a[0] === 'restart' ? 'restart' : a[0]) +
          '<span class="grow">' + t(a[1]) + '</span><span class="risk ' + a[2] + '">' + t('risk.' + a[2]) + '</span></button>';
      }).join('') + '</div>';
    }

    el.innerHTML = html;
    GL.apply(el);
  }

  function render() {
    renderGroups();
    renderNodes();
    renderEdges();
    renderInspector();
    document.querySelectorAll('#views button').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.view === view ? 'true' : 'false'); });
    $('app').classList.toggle('no-inspector', !selected);
  }

  function renderLegend() {
    $('legend').innerHTML = [['lan', 'legend.lan'], ['wifi', 'legend.wifi'], ['uplink', 'legend.uplink'], ['vpn', 'legend.vpn'], ['runs', 'legend.runs'], ['depends', 'legend.depends'], ['dns', 'legend.dns'], ['planned', 'legend.planned']]
      .map(function (e) { return '<div class="edge-row"><svg viewBox="0 0 40 10"><path class="edge ' + e[0] + '" d="M1 5 H39"/></svg><span>' + t(e[1]) + '</span></div>'; }).join('');
  }

  function fit() {
    var xs = [], ys = [];
    VIEWS[view].groups.forEach(function (g) { xs.push(g.x, g.x + g.w); ys.push(g.y, g.y + g.h); });
    Object.keys(pos[view]).forEach(function (id) { var p = pos[view][id], s = nodeSize(id); xs.push(p[0], p[0] + s[0]); ys.push(p[1], p[1] + s[1]); });
    var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys);
    var r = canvas.getBoundingClientRect();
    zoom = Math.min(1.2, Math.min((r.width - 80) / (maxX - minX), (r.height - 120) / (maxY - minY)));
    panX = (r.width - (maxX - minX) * zoom) / 2 - minX * zoom;
    panY = (r.height - (maxY - minY) * zoom) / 2 - minY * zoom + 10;
    applyTransform();
  }

  // ---------- Interaction ----------
  var drag = null;
  canvas.addEventListener('mousedown', function (e) {
    var nodeEl = e.target.closest('.node');
    if (e.target.closest('.canvas-tools, .zoom, .legend')) return;
    if (nodeEl) {
      var id = nodeEl.dataset.id;
      drag = { type: 'node', id: id, el: nodeEl, sx: e.clientX, sy: e.clientY, ox: pos[view][id][0], oy: pos[view][id][1], moved: false };
    } else {
      drag = { type: 'pan', sx: e.clientX, sy: e.clientY, ox: panX, oy: panY };
      canvas.classList.add('panning');
    }
  });
  window.addEventListener('mousemove', function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (drag.type === 'pan') { panX = drag.ox + dx; panY = drag.oy + dy; applyTransform(); return; }
    if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
    if (!drag.moved) return;
    pos[view][drag.id][0] = Math.round((drag.ox + dx / zoom) / 4) * 4;
    pos[view][drag.id][1] = Math.round((drag.oy + dy / zoom) / 4) * 4;
    drag.el.style.left = pos[view][drag.id][0] + 'px';
    drag.el.style.top = pos[view][drag.id][1] + 'px';
    drag.el.classList.add('dragging');
    renderEdges();
  });
  window.addEventListener('mouseup', function () {
    if (!drag) return;
    if (drag.type === 'node' && !drag.moved) { selected = drag.id; render(); }
    if (drag.type === 'node' && drag.moved) drag.el.classList.remove('dragging');
    if (drag.type === 'pan' && Math.abs(panX - drag.ox) + Math.abs(panY - drag.oy) < 3) { selected = null; render(); }
    canvas.classList.remove('panning');
    drag = null;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var r = canvas.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var nz = Math.min(2, Math.max(0.35, zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    panX = mx - (mx - panX) * nz / zoom; panY = my - (my - panY) * nz / zoom; zoom = nz;
    applyTransform();
  }, { passive: false });

  function zoomBy(f) {
    var r = canvas.getBoundingClientRect(), mx = r.width / 2, my = r.height / 2;
    var nz = Math.min(2, Math.max(0.35, zoom * f));
    panX = mx - (mx - panX) * nz / zoom; panY = my - (my - panY) * nz / zoom; zoom = nz; applyTransform();
  }

  $('views').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    view = b.dataset.view;
    if (selected && !pos[view][selected]) { /* keep inspector open even if node is hidden in this view */ }
    render(); fit();
  });

  $('inspector').addEventListener('click', function (e) {
    if (e.target.closest('#insp-close')) { selected = null; render(); return; }
    var go = e.target.closest('[data-goto]');
    if (go) { selected = go.dataset.goto; render(); return; }
    var act = e.target.closest('[data-act]');
    if (act && act.dataset.act === 'move') openDialog('dlg-move');
  });

  function openDialog(id) {
    $(id).classList.add('open');
    var input = $(id).querySelector('input');
    if (input) { input.value = ''; setTimeout(function () { input.focus(); }, 30); }
    if (id === 'dlg-move') $('move-go').disabled = true;
  }
  document.querySelectorAll('.scrim').forEach(function (s) {
    s.addEventListener('click', function (e) { if (e.target === s || e.target.closest('[data-close]')) s.classList.remove('open'); });
  });
  document.querySelectorAll('[data-close].icon-btn').forEach(function (b) { b.innerHTML = glIcon('x'); });
  $('move-confirm').addEventListener('input', function (e) { $('move-go').disabled = e.target.value.trim() !== 'gridman-api'; });
  $('move-go').addEventListener('click', function () { $('dlg-move').classList.remove('open'); });
  $('add').addEventListener('click', function () { openDialog('dlg-add'); });
  $('copy-cmd').addEventListener('click', function (e) { e.target.textContent = '✓'; setTimeout(function () { GL.apply($('dlg-add')); }, 1200); });

  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('.scrim.open').forEach(function (s) { s.classList.remove('open'); });
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('search').focus(); }
  });

  $('search').addEventListener('input', function (e) {
    var q = e.target.value.trim().toLowerCase();
    document.querySelectorAll('#nodes .node').forEach(function (el) {
      var n = NODES[el.dataset.id];
      el.classList.toggle('dim', !!q && (n.name + ' ' + (n.nameEn || '') + ' ' + (n.sub || '')).toLowerCase().indexOf(q) < 0);
    });
  });

  $('zin').innerHTML = glIcon('plus'); $('zout').innerHTML = glIcon('minus'); $('zfit').innerHTML = glIcon('fit'); $('zleg').innerHTML = glIcon('layers');
  $('bell').insertAdjacentHTML('afterbegin', glIcon('bell'));
  $('add-ic').innerHTML = glIcon('plus');
  $('zin').onclick = function () { zoomBy(1.2); };
  $('zout').onclick = function () { zoomBy(1 / 1.2); };
  $('zfit').onclick = fit;
  $('zleg').onclick = function () { $('legend').classList.toggle('open'); };
  $('lang').onclick = function () { GL.setLang(GL.lang === 'ru' ? 'en' : 'ru'); };
  document.addEventListener('gl-lang', function () { renderRail(); renderLegend(); render(); GL.apply(); });

  renderRail();
  renderLegend();
  render();
  GL.apply();
  fit();
  window.addEventListener('resize', fit);
})();
