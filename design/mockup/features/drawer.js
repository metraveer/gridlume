// Bottom drawer: Events (everything that happens), Logs (of the selected node, live), Terminal (on a machine)
// and History (a 24 h timeline: drag it to see how the map looked at that moment).

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'dr.events': 'События',
      'dr.logs': 'Логи',
      'dr.terminal': 'Терминал',
      'dr.history': 'История',
      'dr.toggle': 'Открыть или скрыть нижнюю панель (Ctrl+`)',
      'dr.logs.of': 'Логи: {name}',
      'dr.logs.pick': 'Выберите узел на схеме — здесь побегут его логи.',
      'dr.logs.errors': 'только ошибки',
      'dr.term.pick': 'Выберите машину (сервер или VPS), чтобы открыть терминал.',
      'dr.term.warn': 'Команды выполняются на машине от имени администратора. Опасные команды Gridlume попросит подтвердить.',
      'dr.term.demo': 'макет: команда не выполняется',
      'dr.hist.now': 'Сейчас',
      'dr.hist.past': 'Вы смотрите прошлое: {time}. Цифры заморожены, действия недоступны.',
      'dr.hist.back': 'Вернуться к сейчас',
      'dr.hist.tip': 'Перетащите ползунок, чтобы увидеть, как всё было в тот момент. Отметки — события: красные — сбои, жёлтые — предупреждения.',
      'ev.you': 'Вы',
      'ev.agent': 'Агент calibur подключился',
      'ev.deploy': 'gridman-api обновлён до 1.42',
      'ev.backup': 'Ночная копия postgres готова, проверена',
    },
    en: {
      'dr.events': 'Events',
      'dr.logs': 'Logs',
      'dr.terminal': 'Terminal',
      'dr.history': 'History',
      'dr.toggle': 'Open or hide the bottom panel (Ctrl+`)',
      'dr.logs.of': 'Logs: {name}',
      'dr.logs.pick': 'Select a node on the map and its logs will run here.',
      'dr.logs.errors': 'errors only',
      'dr.term.pick': 'Select a machine (server or VPS) to open a terminal.',
      'dr.term.warn': 'Commands run on the machine as administrator. Gridlume asks to confirm dangerous ones.',
      'dr.term.demo': 'mockup: the command is not executed',
      'dr.hist.now': 'Now',
      'dr.hist.past': 'You are looking at the past: {time}. Numbers are frozen, actions are disabled.',
      'dr.hist.back': 'Back to now',
      'dr.hist.tip': 'Drag the slider to see how everything looked at that moment. Marks are events: red — failures, yellow — warnings.',
      'ev.you': 'You',
      'ev.agent': 'The calibur agent connected',
      'ev.deploy': 'gridman-api updated to 1.42',
      'ev.backup': 'Nightly postgres backup is ready and verified',
    },
  });

  // ---------- Events: one stream for the whole infrastructure ----------
  var EVENTS = [
    ['14:20', 'crit', 'ev.camoff', 'cam'],
    ['14:18', 'warn', 'ev.camweak', 'cam'],
    ['14:02', 'warn', 'ev.loss', 'keenetic'],
    ['13:51', 'warn', 'ev.latency', 'keenetic'],
    ['13:40', 'warn', 'note.worker', 'worker'],
    ['12:05', 'ok', 'ev.deploy', 'api'],
    ['09:12', 'warn', 'ev.port100', 'junk'],
    ['03:15', 'ok', 'ev.measure', 'keenetic'],
    ['03:10', 'ok', 'ev.measure', 'rt'],
    ['03:00', 'ok', 'ev.backup', 'pg'],
    ['00:41', 'ok', 'ev.agent', 'calibur'],
  ];

  // ---------- Demo log lines per node ----------
  var LOGS = {
    api: [['info', 'GET /api/projects 200 · 34 ms'], ['info', 'GET /api/shots/812 200 · 21 ms'], ['info', 'POST /api/comments 201 · 48 ms'], ['warn', 'slow query: SELECT … FROM versions · 412 ms'], ['info', 'GET /api/me 200 · 6 ms']],
    worker: [['info', 'job 4411: frame 1820/5400 (34%) · 1.4 fps'], ['info', 'job 4411: frame 1844/5400 (34%) · 1.3 fps'], ['warn', 'queue length 12, oldest job waiting 19 min'], ['error', 'job 4407: ffmpeg exited with code 1: av1 encoder out of memory'], ['info', 'job 4411: frame 1868/5400 (35%) · 1.4 fps']],
    pg: [['info', 'checkpoint complete: wrote 412 buffers (2.5%)'], ['info', 'automatic vacuum of table "versions"'], ['warn', 'duration: 412.3 ms  statement: SELECT … FROM versions'], ['info', 'connection authorized: user=gridman database=gridman']],
    web: [['info', '200 GET / · 12 ms'], ['info', '200 GET /static/app.js · 3 ms'], ['info', '304 GET /favicon.ico · 1 ms'], ['warn', 'certificate for gridman.pro expires in 12 days']],
    cam: [['warn', 'wifi signal -84 dBm'], ['error', 'ping 192.168.1.47: request timed out'], ['error', 'ping 192.168.1.47: request timed out'], ['error', 'no response for 6 min']],
    calibur: [['info', 'systemd: Started docker.service'], ['info', 'kernel: r8169 enp4s0f1: Link is Up - 1Gbps/Full'], ['info', 'unattended-upgrades: no updates'], ['info', 'agent: metrics sent (cpu 6%, mem 37%)']],
  };
  function logsFor(id) {
    return LOGS[id] || [['info', A.nodeName(A.NODES[id]) + ': running'], ['info', 'health check ok']];
  }

  var TERMINAL = {
    uptime: ' 14:31:07 up 3 days,  4:02,  1 user,  load average: 0.21, 0.18, 0.12',
    'df -h': 'Filesystem      Size  Used Avail Use% Mounted on\n/dev/sda1       112G   10G   97G   9% /',
    'docker ps': 'NAMES              STATUS\nkomodo-core-1      Up 3 days\nkomodo-mongo-1     Up 3 days\nkomodo-periphery-1 Up 3 days',
    'free -h': '               total        used        free\nMem:           5.7Gi       2.1Gi       1.1Gi',
  };

  var tab = 'events', open = false, errorsOnly = false, logBuf = {}, termLines = [];
  var sliderMin = 24 * 60; // minutes back from "now"; 0 = now

  function isMachine(id) { var n = A.NODES[id]; return n && /server|vps/.test(n.type) && n.state !== 'planned'; }

  function body() {
    var sel = A.selected;
    if (tab === 'events') {
      return '<div class="dr-list">' + EVENTS.map(function (e) {
        var n = A.NODES[e[3]];
        var text = e.custom ? t('ev.you') + ': ' + e.custom : '<b>' + A.nodeName(n) + '</b> · ' + t(e[2]);
        return '<div class="event" data-goto-node="' + e[3] + '" style="cursor:pointer"><time>' + e[0] + '</time><span class="dot ' + e[1] + '"></span><span>' + text + '</span></div>';
      }).join('') + '</div>';
    }
    if (tab === 'logs') {
      if (!sel) return '<p class="faint dr-pad">' + t('dr.logs.pick') + '</p>';
      var lines = (logBuf[sel] || []).filter(function (l) { return !errorsOnly || l[1] !== 'info'; });
      return '<div class="dr-tools"><span>' + t('dr.logs.of').replace('{name}', A.nodeName(A.NODES[sel])) + '</span><label class="faint"><input type="checkbox" id="dr-err"' + (errorsOnly ? ' checked' : '') + '> ' + t('dr.logs.errors') + '</label></div>' +
        '<pre class="dr-log" id="dr-log">' + lines.map(function (l) { return '<span class="ll ' + l[1] + '">' + l[0] + '  ' + l[2] + '</span>'; }).join('\n') + '</pre>';
    }
    if (tab === 'terminal') {
      if (!isMachine(sel)) return '<p class="faint dr-pad">' + t('dr.term.pick') + '</p>';
      var host = A.nodeName(A.NODES[sel]);
      return '<div class="dr-tools"><span class="risk careful">' + t('risk.careful') + '</span><span class="faint">' + t('dr.term.warn') + '</span></div>' +
        '<pre class="dr-log term" id="dr-term">' + termLines.join('\n') + '\n<span class="prompt">ops@' + host + ':~$ </span><input id="dr-cmd" class="term-in" autocomplete="off" spellcheck="false"></pre>';
    }
    // History
    var marks = EVENTS.map(function (e) {
      var parts = e[0].split(':'), m = +parts[0] * 60 + +parts[1];
      var minutesAgo = (14 * 60 + 31) - m; // demo "now" is 14:31
      return '<span class="tl-mark ' + e[1] + '" style="left:' + (100 - minutesAgo / (24 * 60) * 100).toFixed(2) + '%" data-tip="' + e[0] + ' · ' + A.attr(t(e[2])) + '"></span>';
    }).join('');
    // Changes (updates, settings, restarts) as diamonds, so "what changed right before" is visible at a glance.
    marks += (A.CHANGES || []).map(function (c) {
      var parts = c.time.split(':'), minutesAgo = (14 * 60 + 31) - (+parts[0] * 60 + +parts[1]);
      return '<span class="tl-mark chg" style="left:' + (100 - minutesAgo / (24 * 60) * 100).toFixed(2) + '%" data-tip="' + c.time + ' · ' + A.attr(A.txt(c.text)) + '"></span>';
    }).join('');
    var label = sliderMin === 0 ? t('dr.hist.now') : timeLabel(sliderMin);
    return '<div class="dr-pad"><div class="dr-tools" style="padding:0 0 10px"><span class="mono">' + label + '</span><span class="help" data-tip="' + A.attr(t('dr.hist.tip')) + '">?</span>' +
      (sliderMin ? '<button class="btn btn-sm" id="tl-now">' + t('dr.hist.back') + '</button>' : '') + '</div>' +
      '<div class="timeline"><div class="tl-track">' + marks + '</div><input type="range" id="tl" min="0" max="1440" step="5" value="' + (1440 - sliderMin) + '"></div>' +
      '<div class="tl-hours"><span>−24 h</span><span>−18 h</span><span>−12 h</span><span>−6 h</span><span>' + t('dr.hist.now') + '</span></div></div>';
  }

  function timeLabel(minAgo) {
    var m = (14 * 60 + 31) - minAgo, day = m < 0 ? t('time.yesterday') + ' ' : '';
    m = (m + 1440) % 1440;
    return day + String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  function render() {
    var d = document.getElementById('drawer');
    d.classList.toggle('open', open);
    d.querySelectorAll('[data-dtab]').forEach(function (b) { b.setAttribute('aria-pressed', b.dataset.dtab === tab && open ? 'true' : 'false'); });
    d.querySelector('.dr-body').innerHTML = open ? body() : '';
    var log = document.getElementById('dr-log');
    if (log) log.scrollTop = log.scrollHeight;
    var cmd = document.getElementById('dr-cmd');
    if (cmd) setTimeout(function () { cmd.focus(); }, 0);
    document.getElementById('app').classList.toggle('drawer-open', open);
  }

  function show(which) { tab = which; open = true; render(); }

  // ---------- History: put the map back to how it was ----------
  var STARTS = { cam: 14 * 60 + 18, 'up-city': 13 * 60 + 51, worker: 13 * 60 + 40, 'lan-junk': 9 * 60 + 12, 'wifi-cam': 14 * 60 + 18 };
  var saved = null;
  function applyHistory() {
    var past = sliderMin > 0, at = (14 * 60 + 31) - sliderMin;
    if (past && !saved) {
      saved = {};
      Object.keys(STARTS).forEach(function (k) { var o = A.NODES[k] || A.LINKS[k]; saved[k] = { state: o.state, offline: o.offline }; });
    }
    if (saved) Object.keys(STARTS).forEach(function (k) {
      var o = A.NODES[k] || A.LINKS[k];
      var before = past && at < STARTS[k];
      o.state = before ? 'ok' : saved[k].state;
      if (A.NODES[k]) o.offline = before ? 0 : saved[k].offline;
    });
    if (!past) saved = null;
    A.state.paused = past;
    document.getElementById('app').classList.toggle('in-past', past);
    var banner = document.getElementById('past-banner');
    banner.textContent = past ? t('dr.hist.past').replace('{time}', timeLabel(sliderMin)) : '';
    A.render();
  }

  // ---------- Live logs ----------
  A.HOOKS.tick.push(function () {
    var sel = A.selected;
    if (!sel) return;
    var src = logsFor(sel), buf = logBuf[sel] = logBuf[sel] || [];
    var pick = src[Math.floor(Math.random() * src.length)];
    var now = new Date();
    buf.push([now.toTimeString().slice(0, 8), pick[0], pick[1]]);
    if (buf.length > 200) buf.shift();
    if (open && tab === 'logs') {
      var log = document.getElementById('dr-log');
      if (log && (!errorsOnly || pick[0] !== 'info')) {
        log.insertAdjacentHTML('beforeend', '\n<span class="ll ' + pick[0] + '">' + buf[buf.length - 1][0] + '  ' + pick[1] + '</span>');
        log.scrollTop = log.scrollHeight;
      }
    }
  });

  // Seed a few lines so logs are never empty when opened.
  function seed(id) {
    if (logBuf[id]) return;
    logBuf[id] = logsFor(id).map(function (l, i) { return ['14:30:' + String(10 + i * 7).padStart(2, '0'), l[0], l[1]]; });
  }

  A.HOOKS.afterRender.push(function () {
    if (A.selected) seed(A.selected);
    if (open && (tab === 'logs' || tab === 'terminal')) {
      var key = tab + ':' + A.selected;
      if (render.last !== key) { render.last = key; termLines = []; render(); }
    }
  });

  // Actions from the inspector: logs and terminal open here instead of a dialog.
  A.HOOKS.action.push(function (id, act) {
    if (act === 'logs') { seed(id); show('logs'); return true; }
    if (act === 'terminal') { show('terminal'); return true; }
    return false;
  });

  // Opening a problem shows its logs right away, errors first.
  A.HOOKS.ready.push(function () {
    A.HOOKS.problemOpened && A.HOOKS.problemOpened.push(function (item) {
      if (item.node) { seed(item.node); errorsOnly = false; show('logs'); } else show('events');
    });
  });

  A.HOOKS.journal.push(function (title) {
    var now = new Date().toTimeString().slice(0, 5);
    EVENTS.unshift([now, 'ok', null, A.selected || 'calibur']);
    EVENTS[0][2] = 'ev.you';
    EVENTS[0].custom = title;
    if (open && tab === 'events') render();
  });

  A.drawer = { show: show, events: EVENTS };

  A.HOOKS.ready.push(function () {
    var canvas = document.getElementById('canvas');
    var d = document.createElement('section');
    d.id = 'drawer';
    d.className = 'drawer';
    d.innerHTML = '<div class="dr-head">' +
      ['events', 'logs', 'terminal', 'history'].map(function (k) {
        var ic = { events: 'bell', logs: 'logs', terminal: 'terminal', history: 'history' }[k];
        return '<button class="dr-tab" data-dtab="' + k + '">' + glIcon(ic) + '<span data-i18n="dr.' + k + '"></span></button>';
      }).join('') + '<span class="grow"></span><button class="icon-btn" id="dr-toggle" data-i18n-tip="dr.toggle">' + glIcon('drawer') + '</button></div><div class="dr-body"></div>';
    canvas.appendChild(d);
    var banner = document.createElement('div');
    banner.id = 'past-banner';
    banner.className = 'past-banner';
    canvas.appendChild(banner);
    GL.apply(d);

    d.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-dtab]');
      if (tb) { if (open && tab === tb.dataset.dtab) { open = false; render(); } else show(tb.dataset.dtab); return; }
      if (e.target.closest('#dr-toggle')) { open = !open; render(); return; }
      if (e.target.closest('#tl-now')) { sliderMin = 0; applyHistory(); render(); return; }
      var ev = e.target.closest('[data-goto-node]');
      if (ev) A.select(ev.dataset.gotoNode);
    });
    d.addEventListener('change', function (e) { if (e.target.id === 'dr-err') { errorsOnly = e.target.checked; render(); } });
    d.addEventListener('input', function (e) {
      if (e.target.id === 'tl') {
        sliderMin = 1440 - +e.target.value;
        applyHistory();
        var label = d.querySelector('.dr-tools .mono');
        if (label) label.textContent = sliderMin ? timeLabel(sliderMin) : t('dr.hist.now');
      }
    });
    d.addEventListener('keydown', function (e) {
      if (e.target.id === 'dr-cmd' && e.key === 'Enter') {
        var cmd = e.target.value.trim(), host = A.nodeName(A.NODES[A.selected]);
        termLines.push('<span class="prompt">ops@' + host + ':~$ </span>' + cmd);
        if (cmd) termLines.push(TERMINAL[cmd] || '<span class="faint">' + t('dr.term.demo') + '</span>');
        render();
      }
      e.stopPropagation(); // typing in the terminal must not trigger map shortcuts
    });
    window.addEventListener('keydown', function (e) {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); open = !open; render(); }
    });
    document.addEventListener('gl-lang', function () { GL.apply(d); render(); });
  });
})();
