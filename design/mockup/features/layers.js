// Map layers on top of the main view, switched from the "Layers" button:
//   • Watch — which machine checks on which, so an alarm still comes if the machine running Gridlume dies;
//   • Power — the UPS, what runs from it, how long it lasts, the shutdown/start-up plan by dependencies;
//   • Outside — what is reachable from the internet, with risks and advice.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'ly.btn': 'Слои',
      'ly.btn.tip': 'Дополнительные слои поверх схемы: присмотр, питание, что видно из интернета.',
      'ly.watch': 'Кто за кем присматривает',
      'ly.watch.d': 'Если упадёт машина, о ней сообщит другая.',
      'ly.power': 'Питание и ИБП',
      'ly.power.d': 'Что работает от ИБП и сколько продержится без света.',
      'ly.outside': 'Что видно из интернета',
      'ly.outside.d': 'Открытые наружу порты и чем они опасны.',
      'type.ups': 'ИБП',
      'w.title': 'Присмотр',
      'w.card': 'Ядро Gridlume работает на calibur. Если calibur упадёт, тревогу поднимут <b>junk</b> из дома и <b>облачный дежурный</b> на gridman.pro — сообщение придёт в течение минуты.',
      'w.label': 'проверка каждые 30 с',
      'w.watchedBy': 'За ним присматривают',
      'w.watches': 'Он присматривает за',
      'w.cloud': 'облачный дежурный',
      'w.tip': 'Машины проверяют друг друга, а дежурный в облаке — всех снаружи. Поэтому тревога придёт, даже если упадёт машина, на которой работает сам Gridlume.',
      'p.title': 'Питание',
      'p.card': '<b>Деревня:</b> роутер и calibur от ИБП, хватит примерно на 25 минут.<br><b>Дом:</b> ИБП нет — при отключении света сразу пропадут junk, Home Assistant и камера.<br><b>Облако:</b> питание у провайдера.',
      'p.onups': 'от ИБП',
      'p.noups': 'без ИБП',
      'p.dc': 'у провайдера',
      'p.usb': 'USB: сигнал о сбое',
      'p.mains': '220 В',
      'p.plan': 'План при отключении света',
      'p.plan.tip': 'Порядок выключения строится по зависимостям: сначала то, от чего никто не зависит, база данных — последней. Включение — в обратном порядке. Так ничего не повреждается и всё поднимается само.',
      'p.off': 'Свет пропал',
      'p.on': 'Свет вернулся',
      'p.s1': 'Сразу — сообщение в Telegram: «работаем от ИБП, запас 25 мин».',
      'p.s2': 'Через 10 минут без света — останавливаем второстепенное: komodo-periphery, komodo-core.',
      'p.s3': 'Когда запаса останется 8 минут — mongo, затем корректно выключаем calibur.',
      'p.s4': 'Роутер работает до конца батареи — чтобы сообщения успели уйти.',
      'p.r1': 'Роутер включается сам вместе со светом.',
      'p.r2': 'Через 2 минуты будим calibur по сети (Wake-on-LAN).',
      'p.r3': 'Контейнеры запускаются по зависимостям: mongo → komodo-core → komodo-periphery.',
      'p.r4': 'Сообщение «всё снова работает, простой N минут».',
      'p.test': 'Проверить план без выключения',
      'p.test.tip': 'Прогоним план «вхолостую»: проверим, что команды доходят до машин и порядок верный. Ничего не выключится.',
      'ups.charge': 'Заряд',
      'ups.runtime': 'Хватит на',
      'ups.load': 'Нагрузка',
      'ups.source': 'Питание',
      'ups.mains': 'от сети',
      'ups.min': '{n} мин',
      'insp.ups.mains': 'от сети',
      'insp.ups.runtime': '~25 мин',
      'o.title': 'Снаружи',
      'o.card': 'Из интернета видно <b>6 портов</b>: <span style="color:var(--crit)">2 опасных</span>, <span style="color:var(--warn)">1 стоит ограничить</span>, остальное в порядке.',
      'o.check': 'Проверить снаружи сейчас',
      'o.check.tip': 'Облачный дежурный попробует подключиться к вашим адресам из интернета, как это сделал бы посторонний. Около минуты, ничего не меняет.',
      'o.section': 'Что видно из интернета',
      'o.close': 'Закрыть порт',
      'o.close.tip': 'Уберём проброс порта на роутере. Сервис продолжит работать внутри сети и через VPN.',
      'o.443': 'сайт по HTTPS — так и должно быть',
      'o.80': 'перенаправляет на HTTPS — нормально',
      'o.22': 'SSH открыт для всех. Вход только по ключу — хорошо, но лучше пускать только через VPN.',
      'o.8123': 'Home Assistant открыт в интернет без HTTPS: пароли и управление домом идут открытым текстом.',
      'o.554': 'Видео с камеры доступно из интернета по RTSP — его могут смотреть посторонние.',
      'o.51820': 'VPN (план) — так и должно быть.',
    },
    en: {
      'ly.btn': 'Layers',
      'ly.btn.tip': 'Extra layers over the map: watching, power, what is visible from the internet.',
      'ly.watch': 'Who watches whom',
      'ly.watch.d': 'If a machine dies, another one reports it.',
      'ly.power': 'Power and UPS',
      'ly.power.d': 'What runs from the UPS and how long it lasts without power.',
      'ly.outside': 'Visible from the internet',
      'ly.outside.d': 'Ports open to the outside and why they are risky.',
      'type.ups': 'UPS',
      'w.title': 'Watching',
      'w.card': 'The Gridlume core runs on calibur. If calibur dies, <b>junk</b> at home and the <b>cloud watcher</b> on gridman.pro raise the alarm — the message arrives within a minute.',
      'w.label': 'checked every 30 s',
      'w.watchedBy': 'Watched by',
      'w.watches': 'It watches',
      'w.cloud': 'cloud watcher',
      'w.tip': 'Machines check each other and the cloud watcher checks everything from outside, so an alarm comes even if the machine running Gridlume itself dies.',
      'p.title': 'Power',
      'p.card': '<b>Village:</b> router and calibur on the UPS, about 25 minutes.<br><b>Home:</b> no UPS — on a power cut junk, Home Assistant and the camera go down at once.<br><b>Cloud:</b> the provider\'s power.',
      'p.onups': 'on UPS',
      'p.noups': 'no UPS',
      'p.dc': 'provider',
      'p.usb': 'USB: power-fail signal',
      'p.mains': '230 V',
      'p.plan': 'Power cut plan',
      'p.plan.tip': 'The shutdown order follows dependencies: first what nothing depends on, the database last. Start-up is the reverse. Nothing gets corrupted and everything comes back by itself.',
      'p.off': 'Power lost',
      'p.on': 'Power back',
      'p.s1': 'At once — a Telegram message: "on UPS, 25 min left".',
      'p.s2': 'After 10 minutes without power — stop the non-essential: komodo-periphery, komodo-core.',
      'p.s3': 'With 8 minutes left — mongo, then shut calibur down cleanly.',
      'p.s4': 'The router runs to the end of the battery so messages get out.',
      'p.r1': 'The router turns on with the power.',
      'p.r2': 'After 2 minutes calibur is woken over the network (Wake-on-LAN).',
      'p.r3': 'Containers start by dependencies: mongo → komodo-core → komodo-periphery.',
      'p.r4': 'A message "everything works again, N minutes of downtime".',
      'p.test': 'Test the plan without shutting down',
      'p.test.tip': 'A dry run: we check that commands reach the machines and the order is right. Nothing turns off.',
      'ups.charge': 'Charge',
      'ups.runtime': 'Lasts',
      'ups.load': 'Load',
      'ups.source': 'Power',
      'ups.mains': 'mains',
      'ups.min': '{n} min',
      'insp.ups.mains': 'mains',
      'insp.ups.runtime': '~25 min',
      'o.title': 'Outside',
      'o.card': '<b>6 ports</b> are visible from the internet: <span style="color:var(--crit)">2 dangerous</span>, <span style="color:var(--warn)">1 worth restricting</span>, the rest is fine.',
      'o.check': 'Check from outside now',
      'o.check.tip': 'The cloud watcher tries to connect to your addresses from the internet, as a stranger would. About a minute, changes nothing.',
      'o.section': 'Visible from the internet',
      'o.close': 'Close the port',
      'o.close.tip': 'We remove the port forward on the router. The service keeps working inside the network and over VPN.',
      'o.443': 'the site over HTTPS — as it should be',
      'o.80': 'redirects to HTTPS — fine',
      'o.22': 'SSH is open to everyone. Key-only login is good, but better allow it only over VPN.',
      'o.8123': 'Home Assistant is open to the internet without HTTPS: passwords and home control travel in plain text.',
      'o.554': 'The camera video is reachable from the internet over RTSP — strangers can watch it.',
      'o.51820': 'VPN (planned) — as it should be.',
    },
  });

  var on = { watch: false, power: false, outside: false };

  // ---------- Data ----------
  var WATCH = [['junk', 'calibur'], ['calibur', 'junk'], ['tw', 'calibur'], ['tw', 'junk']];
  var POWER = { rt: 'onups', calibur: 'onups', max: 'noups', keenetic: 'noups', junk: 'noups', cam: 'noups', tw: 'dc', domain: null };
  var PORTS = {
    tw: [['443/tcp', 'ok', 'o.443'], ['80/tcp', 'ok', 'o.80'], ['22/tcp', 'warn', 'o.22']],
    keenetic: [['8123 → junk', 'crit', 'o.8123'], ['554 → cam', 'crit', 'o.554']],
    rt: [['51820/udp', 'ok', 'o.51820']],
  };

  A.HOOKS.ready.unshift(function () {
    // The UPS is a real node on the map: it has a card, a charge level and a plan.
    A.NODES.ups = { icon: 'battery', name: 'ИБП', nameEn: 'UPS', type: 'type.ups', sub: 'APC Back-UPS 650', state: 'ok', place: 'village' };
    A.VIEWS.root.nodes.ups = [276, 404];
    A.positions().ups = [276, 404];
    A.DETAILS.ups = {
      kv: [['ups.source', 'insp.ups.mains'], ['ups.charge', '100%'], ['ups.runtime', 'insp.ups.runtime'], ['ups.load', '38 W']],
      actions: [],
    };
  });

  // ---------- Drawing on the map ----------
  function c(id) {
    var p = A.positions()[id], s = A.nodeSize(id);
    return p ? [p[0] + s[0] / 2, p[1] + s[1] / 2] : null;
  }
  function arc(a, b, bend) {
    var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
    var len = Math.sqrt(dx * dx + dy * dy) || 1, k = bend * len;
    var cx = mx - dy / len * k, cy = my + dx / len * k;
    return { d: 'M' + a[0] + ' ' + a[1] + ' Q' + cx + ' ' + cy + ' ' + b[0] + ' ' + b[1], mid: [(a[0] + 2 * cx + b[0]) / 4, (a[1] + 2 * cy + b[1]) / 4] };
  }
  function label(x, y, text, cls) {
    var w = text.length * 6.1 + 14;
    return '<g class="edge-pill ' + (cls || '') + '" transform="translate(' + (x - w / 2).toFixed(1) + ',' + (y - 9).toFixed(1) + ')"><rect width="' + w.toFixed(1) + '" height="18" rx="9"/><text x="7" y="12.5">' + text + '</text></g>';
  }

  function drawLayers() {
    var svg = document.getElementById('edges');
    var old = document.getElementById('layer-g');
    if (old) old.remove();
    if (A.view !== 'root' || (!on.watch && !on.power && !on.outside)) return;
    var out = '';
    if (on.watch) WATCH.forEach(function (w, i) {
      var a = c(w[0]), b = c(w[1]);
      if (!a || !b) return;
      var g = arc(a, b, i % 2 ? 0.18 : -0.18);
      out += '<path class="ly-watch" d="' + g.d + '" marker-end="url(#arrow)"/>';
      if (i === 0) out += label(g.mid[0], g.mid[1], t('w.label'), 'ly-watch-pill');
    });
    if (on.power) {
      [['rt', 'p.mains'], ['calibur', 'p.usb']].forEach(function (p) {
        var a = c('ups'), b = c(p[0]);
        if (!a || !b) return;
        var g = arc(a, b, 0.12);
        out += '<path class="ly-power" d="' + g.d + '"/>' + label(g.mid[0], g.mid[1], t(p[1]), 'ly-power-pill');
      });
    }
    if (on.outside) Object.keys(PORTS).forEach(function (id) {
      var a = c('internet'), b = c(id);
      if (!a || !b) return;
      var worst = PORTS[id].some(function (p) { return p[1] === 'crit'; }) ? 'crit' : PORTS[id].some(function (p) { return p[1] === 'warn'; }) ? 'warn' : 'ok';
      var g = arc(a, b, -0.15);
      out += '<path class="ly-out ' + worst + '" d="' + g.d + '" marker-end="url(#arrow)"/>';
    });
    svg.insertAdjacentHTML('beforeend', '<g id="layer-g">' + out + '</g>');
  }

  function chips() {
    document.querySelectorAll('.layer-chips').forEach(function (el) { el.remove(); });
    if (A.view !== 'root') return;
    document.querySelectorAll('#nodes .node').forEach(function (el) {
      var id = el.dataset.id, html = '';
      if (on.power && POWER[id]) html += '<span class="lchip ' + (POWER[id] === 'noups' ? 'warn' : POWER[id] === 'onups' ? 'ok' : '') + '">' + glIcon('power') + t('p.' + POWER[id]) + '</span>';
      if (on.outside && PORTS[id]) PORTS[id].forEach(function (p) { html += '<span class="lchip ' + p[1] + '">' + glIcon('globe') + p[0] + '</span>'; });
      if (on.watch && WATCH.some(function (w) { return w[1] === id; })) html += '<span class="lchip info">' + glIcon('eye') + WATCH.filter(function (w) { return w[1] === id; }).length + '</span>';
      if (html) el.insertAdjacentHTML('beforeend', '<span class="layer-chips">' + html + '</span>');
    });
  }

  function card() {
    var old = document.getElementById('layer-card');
    if (old) old.remove();
    if (!on.watch && !on.power && !on.outside) return;
    var html = '';
    if (on.watch) html += '<div class="lc-sec"><div class="lc-h">' + glIcon('eye') + t('w.title') + ' <span class="help" data-tip="' + A.attr(t('w.tip')) + '">?</span></div><p>' + t('w.card') + '</p></div>';
    if (on.power) html += '<div class="lc-sec"><div class="lc-h">' + glIcon('power') + t('p.title') + '</div><p>' + t('p.card') + '</p><button class="btn btn-sm" data-goto-ups>' + t('p.plan') + '</button></div>';
    if (on.outside) html += '<div class="lc-sec"><div class="lc-h">' + glIcon('shield') + t('o.title') + '</div><p>' + t('o.card') + '</p><button class="btn btn-sm" data-check-out data-tip="' + A.attr(t('o.check.tip')) + '">' + t('o.check') + '</button></div>';
    var el = document.createElement('div');
    el.id = 'layer-card';
    el.className = 'float-card layer-card';
    el.innerHTML = html;
    document.getElementById('canvas').appendChild(el);
  }

  function refresh() { drawLayers(); chips(); card(); }
  A.HOOKS.afterEdges.push(drawLayers);
  A.HOOKS.afterRender.push(function () { chips(); card(); });

  // ---------- Inspector sections ----------
  function planList(prefix, n) {
    var html = '<ol class="steps">';
    for (var i = 1; i <= n; i++) html += '<li>' + t(prefix + i) + '</li>';
    return html + '</ol>';
  }
  A.HOOKS.nodeInspector.push(function (id) {
    var html = '';
    if (id === 'ups') {
      html += '<div class="section"><h3 class="section-title">' + glIcon('power') + t('p.plan') + ' <span class="help" data-tip="' + A.attr(t('p.plan.tip')) + '">?</span></h3>' +
        '<div class="sub-title">' + t('p.off') + '</div>' + planList('p.s', 4) + '<div class="sub-title">' + t('p.on') + '</div>' + planList('p.r', 4) +
        '<button class="action" data-plan-test data-tip="' + A.attr(t('p.test.tip')) + '">' + glIcon('restart') + '<span class="grow">' + t('p.test') + '</span><span class="risk safe">' + t('risk.safe') + '</span></button></div>';
    }
    var by = WATCH.filter(function (w) { return w[1] === id; }), of = WATCH.filter(function (w) { return w[0] === id; });
    if (by.length || of.length) {
      var name = function (x) { return x === 'tw' ? 'gridman.pro · ' + t('w.cloud') : A.nodeName(A.NODES[x]); };
      html += '<div class="section"><h3 class="section-title">' + glIcon('eye') + t('w.title') + ' <span class="help" data-tip="' + A.attr(t('w.tip')) + '">?</span></h3>' +
        (by.length ? '<div class="sub-title">' + t('w.watchedBy') + '</div>' + by.map(function (w) { return '<div class="row" data-goto="' + w[0] + '" style="cursor:pointer"><span class="dot ok"></span><span class="grow">' + name(w[0]) + '</span><span class="faint">' + t('w.label') + '</span></div>'; }).join('') : '') +
        (of.length ? '<div class="sub-title">' + t('w.watches') + '</div>' + of.map(function (w) { return '<div class="row" data-goto="' + w[1] + '" style="cursor:pointer"><span class="dot ok"></span><span class="grow">' + A.nodeName(A.NODES[w[1]]) + '</span></div>'; }).join('') : '') +
        '</div>';
    }
    if (PORTS[id]) {
      html += '<div class="section"><h3 class="section-title">' + glIcon('shield') + t('o.section') + '</h3>' + PORTS[id].map(function (p) {
        return '<div class="port"><span class="dot ' + p[1] + '"></span><span class="mono">' + p[0] + '</span><span class="grow muted">' + t(p[2]) + '</span>' +
          (p[1] === 'crit' ? '<button class="btn btn-sm btn-danger" data-close-port="' + A.attr(p[0]) + '" data-tip="' + A.attr(t('o.close.tip')) + '">' + t('o.close') + '</button>' : '') + '</div>';
      }).join('') + '</div>';
    }
    return html;
  });

  // ---------- UI ----------
  A.HOOKS.ready.push(function () {
    var tools = document.querySelector('.canvas-tools');
    var wrap = document.createElement('div');
    wrap.className = 'layers-wrap';
    wrap.innerHTML = '<button class="btn btn-sm" id="layers-btn" data-i18n-tip="ly.btn.tip">' + glIcon('layers') + '<span data-i18n="ly.btn"></span></button><div class="layers-menu" id="layers-menu"></div>';
    tools.appendChild(wrap);
    function menu() {
      document.getElementById('layers-menu').innerHTML = [['watch', 'eye'], ['power', 'power'], ['outside', 'shield']].map(function (l) {
        return '<label class="lm-item"><input type="checkbox" class="switch" data-layer="' + l[0] + '"' + (on[l[0]] ? ' checked' : '') + '>' + glIcon(l[1]) +
          '<span><b>' + t('ly.' + l[0]) + '</b><br><span class="faint">' + t('ly.' + l[0] + '.d') + '</span></span></label>';
      }).join('');
      var any = on.watch || on.power || on.outside;
      document.getElementById('layers-btn').setAttribute('aria-pressed', any ? 'true' : 'false');
    }
    menu();
    GL.apply(tools);
    document.getElementById('layers-btn').addEventListener('click', function () { document.getElementById('layers-menu').classList.toggle('open'); });
    document.getElementById('layers-menu').addEventListener('change', function (e) {
      var k = e.target.dataset.layer;
      if (!k) return;
      on[k] = e.target.checked;
      if (on[k] && A.view !== 'root') A.go('root');
      menu();
      refresh();
    });
    document.addEventListener('mousedown', function (e) { if (!e.target.closest('.layers-wrap')) document.getElementById('layers-menu').classList.remove('open'); });
    document.getElementById('canvas').addEventListener('mousedown', function (e) {
      if (e.target.closest('[data-goto-ups]')) { e.stopPropagation(); A.select('ups'); }
      if (e.target.closest('[data-check-out]')) { e.stopPropagation(); A.confirm({ title: t('o.check'), risk: 'safe', lead: t('o.check.tip'), go: t('o.check') }); }
    }, true);
    document.getElementById('inspector').addEventListener('click', function (e) {
      if (e.target.closest('[data-plan-test]')) A.confirm({ title: t('p.test'), risk: 'safe', lead: t('p.test.tip'), go: t('p.test') });
      var cp = e.target.closest('[data-close-port]');
      if (cp) A.confirm({ title: t('o.close') + ' ' + cp.dataset.closePort, risk: 'careful', lead: t('o.close.tip'), go: t('o.close') });
    });
    document.addEventListener('gl-lang', function () { menu(); refresh(); });
  });

  A.layers = { on: on, refresh: refresh };
})();
