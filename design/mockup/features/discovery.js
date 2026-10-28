// Adding things: with an agent (one command), by scanning the local network, or by hand.
// Plus the first-run screen (open index.html?empty=1) that a new user sees on an empty map.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'add.tab.agent': 'Машина с агентом',
      'add.tab.scan': 'Найти в сети',
      'add.tab.manual': 'Вручную',
      'scan.lead': 'Gridlume посмотрит, какие устройства есть в вашей домашней сети, и предложит добавить их на схему. Проверяется только сеть 192.168.1.0/24, около 30 секунд, сеть почти не нагружается.',
      'scan.start': 'Начать поиск',
      'scan.running': 'Ищем устройства… {n} из 254 адресов',
      'scan.found': 'Найдено устройств: {n}. Отметьте, какие добавить.',
      'scan.already': 'уже на схеме',
      'scan.addsel': 'Добавить выбранные · {n}',
      'scan.why': 'Как мы узнали тип: по производителю сетевой карты и открытым портам. Если угадали неверно — тип можно поменять в карточке.',
      'man.type': 'Что это',
      'man.name': 'Название',
      'man.addr': 'Адрес (IP или домен)',
      'man.place': 'Где находится',
      'man.add': 'Добавить на схему',
      'man.t.router': 'Роутер',
      'man.t.vps': 'Облачный сервер без агента',
      'man.t.domain': 'Домен',
      'man.t.device': 'Устройство (камера, принтер, NAS…)',
      'man.check': 'Будем проверять, отвечает ли он в сети, раз в 30 секунд.',
      'type.printer': 'Принтер',
      'type.nas': 'Сетевое хранилище',
      'type.tv': 'Телевизор',
      'type.device': 'Устройство',
      'welcome.title': 'Gridlume: вся инфраструктура на одной схеме',
      'welcome.lead': 'Схема пока пустая. Три шага — и вы увидите, как всё устроено.',
      'welcome.s1': 'Подключите эту машину',
      'welcome.s1.d': 'Одна команда ставит агента: процессор, память, диски, контейнеры появятся сами.',
      'welcome.s2': 'Найдите устройства в сети',
      'welcome.s2.d': 'Роутеры, камеры, принтеры, NAS — Gridlume найдёт их и предложит добавить.',
      'welcome.s3': 'Подключите облако',
      'welcome.s3.d': 'Токен Timeweb Cloud — и ваши облачные серверы, домены и баланс будут на схеме.',
      'welcome.demo': 'Посмотреть на демо-инфраструктуре',
    },
    en: {
      'add.tab.agent': 'Machine with agent',
      'add.tab.scan': 'Find on network',
      'add.tab.manual': 'By hand',
      'scan.lead': 'Gridlume looks at which devices are on your home network and offers to add them to the map. Only 192.168.1.0/24 is checked, about 30 seconds, with almost no network load.',
      'scan.start': 'Start search',
      'scan.running': 'Looking for devices… {n} of 254 addresses',
      'scan.found': 'Devices found: {n}. Tick the ones to add.',
      'scan.already': 'already on the map',
      'scan.addsel': 'Add selected · {n}',
      'scan.why': 'How we guessed the type: by the network card maker and open ports. If it is wrong, change the type in the card.',
      'man.type': 'What is it',
      'man.name': 'Name',
      'man.addr': 'Address (IP or domain)',
      'man.place': 'Where is it',
      'man.add': 'Add to the map',
      'man.t.router': 'Router',
      'man.t.vps': 'Cloud server without agent',
      'man.t.domain': 'Domain',
      'man.t.device': 'Device (camera, printer, NAS…)',
      'man.check': 'We will check that it answers on the network every 30 seconds.',
      'type.printer': 'Printer',
      'type.nas': 'Network storage',
      'type.tv': 'TV',
      'type.device': 'Device',
      'welcome.title': 'Gridlume: your whole infrastructure on one map',
      'welcome.lead': 'The map is empty for now. Three steps and you will see how everything is built.',
      'welcome.s1': 'Connect this machine',
      'welcome.s1.d': 'One command installs the agent: CPU, memory, disks and containers appear by themselves.',
      'welcome.s2': 'Find devices on the network',
      'welcome.s2.d': 'Routers, cameras, printers, NAS — Gridlume finds them and offers to add them.',
      'welcome.s3': 'Connect the cloud',
      'welcome.s3.d': 'A Timeweb Cloud token and your cloud servers, domains and balance are on the map.',
      'welcome.demo': 'Look at a demo infrastructure',
    },
  });

  var FOUND = [
    { ip: '192.168.1.1', mac: 'Keenetic', type: 'type.router', icon: 'router', name: 'Keenetic', on: 'keenetic' },
    { ip: '192.168.1.21', mac: 'HP', type: 'type.server', icon: 'server', name: 'junk', on: 'junk' },
    { ip: '192.168.1.33', mac: 'HP', ports: '631, 9100', type: 'type.printer', icon: 'app', name: 'HP LaserJet' },
    { ip: '192.168.1.47', mac: 'Hikvision', ports: '554', type: 'type.camera', icon: 'camera', name: 'Камера · двор', on: 'cam' },
    { ip: '192.168.1.52', mac: 'Samsung', ports: '8001', type: 'type.tv', icon: 'laptop', name: 'Samsung TV' },
    { ip: '192.168.1.60', mac: 'Synology', ports: '445, 5000', type: 'type.nas', icon: 'db', name: 'Synology NAS' },
    { ip: '192.168.1.71', mac: 'Xiaomi', ports: '—', type: 'type.device', icon: 'box', name: 'Xiaomi' },
  ];
  var tab = 'agent', scan = 0, checked = {};

  function agentHTML(orig) { return orig; }

  function scanHTML() {
    if (scan === 0) return '<p style="margin:0 0 12px">' + t('scan.lead') + '</p><button class="btn btn-primary" id="scan-go">' + glIcon('radar') + t('scan.start') + '</button>';
    if (scan < 254) return '<p style="margin:0 0 10px">' + t('scan.running').replace('{n}', scan) + '</p><div class="bar lume"><i style="width:' + (scan / 254 * 100) + '%"></i></div>';
    var news = FOUND.filter(function (f) { return !f.on || !A.NODES[f.on]; });
    return '<p style="margin:0 0 8px">' + t('scan.found').replace('{n}', FOUND.length) + '</p>' + FOUND.map(function (f, i) {
      var have = f.on && A.NODES[f.on];
      return '<label class="row" style="cursor:' + (have ? 'default' : 'pointer') + '"><input type="checkbox" data-f="' + i + '"' + (have ? ' disabled checked' : checked[i] ? ' checked' : '') + '>' +
        glIcon(f.icon) + '<span class="grow">' + f.name + ' <span class="faint">· ' + t(f.type) + '</span></span><span class="mono faint">' + f.ip + '</span>' +
        (have ? '<span class="faint">' + t('scan.already') + '</span>' : '<span class="faint">' + f.mac + (f.ports ? ' · ' + f.ports : '') + '</span>') + '</label>';
    }).join('') + '<p class="faint" style="font-size:var(--fs-12);margin:10px 0 0">' + t('scan.why') + '</p>' + (news.length ? '' : '');
  }

  function manualHTML() {
    var places = ['village', 'city', 'cloud'];
    return '<div class="form">' +
      '<label>' + t('man.type') + '<select class="input" id="m-type"><option value="router">' + t('man.t.router') + '</option><option value="vps">' + t('man.t.vps') + '</option><option value="domain">' + t('man.t.domain') + '</option><option value="device" selected>' + t('man.t.device') + '</option></select></label>' +
      '<label>' + t('man.name') + '<input class="input" id="m-name" placeholder="NAS"></label>' +
      '<label>' + t('man.addr') + '<input class="input mono" id="m-addr" placeholder="192.168.1.60"></label>' +
      '<label>' + t('man.place') + '<select class="input" id="m-place">' + places.map(function (p) { return '<option value="' + p + '"' + (p === 'city' ? ' selected' : '') + '>' + t('place.' + p) + '</option>'; }).join('') + '</select></label>' +
      '<p class="faint" style="font-size:var(--fs-12);margin:0">' + t('man.check') + '</p></div>';
  }

  var original = null;
  function draw() {
    var dlg = document.querySelector('#dlg-add .dialog-body');
    if (original === null) original = dlg.innerHTML;
    var tabs = '<div class="segmented" style="margin-bottom:14px">' + ['agent', 'scan', 'manual'].map(function (k) {
      return '<button data-atab="' + k + '" aria-pressed="' + (tab === k) + '">' + t('add.tab.' + k) + '</button>';
    }).join('') + '</div>';
    dlg.innerHTML = tabs + (tab === 'agent' ? agentHTML(original) : tab === 'scan' ? scanHTML() : manualHTML());
    GL.apply(dlg);
    var foot = document.querySelector('#dlg-add .dialog-foot');
    var n = Object.keys(checked).filter(function (k) { return checked[k]; }).length;
    foot.innerHTML = tab === 'scan' && scan >= 254
      ? '<button class="btn btn-ghost" data-close>' + t('dlg.cancel') + '</button><button class="btn btn-primary" id="scan-add"' + (n ? '' : ' disabled') + '>' + t('scan.addsel').replace('{n}', n) + '</button>'
      : tab === 'manual'
        ? '<button class="btn btn-ghost" data-close>' + t('dlg.cancel') + '</button><button class="btn btn-primary" id="man-add">' + t('man.add') + '</button>'
        : '<button class="btn" data-close>' + t('dlg.done') + '</button>';
  }

  var slots = {};
  function place(where) {
    // Grow the place area and drop new devices two per row at its bottom.
    var g = A.VIEWS.root.groups.filter(function (x) { return x.place === where; })[0];
    var s = slots[where] = slots[where] || { n: 0, rowY: 0 };
    var col = s.n % 2;
    if (col === 0) { s.rowY = g.y + g.h - 16; g.h += 92; }
    s.n++;
    return [g.x + 56 + col * 200, s.rowY];
  }

  function addFound(i) {
    var f = FOUND[i], id = 'dev' + i;
    var router = 'keenetic';
    A.addNode(id, { icon: f.icon, name: f.name, type: f.type, sub: f.ip, state: 'ok', place: 'city' }, 'root', place('city'), [[router, id, 'lan', '', null]]);
  }

  A.HOOKS.ready.push(function () {
    var scrim = document.getElementById('dlg-add');
    document.getElementById('add').addEventListener('click', function () { tab = 'agent'; draw(); });
    scrim.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-atab]');
      if (tb) { tab = tb.dataset.atab; draw(); return; }
      var copy = e.target.closest('#copy-cmd');
      if (copy) { copy.textContent = '✓'; return; }
      if (e.target.closest('#scan-go')) {
        scan = 1; draw();
        var timer = setInterval(function () {
          scan = Math.min(254, scan + 17);
          draw();
          if (scan >= 254) clearInterval(timer);
        }, 120);
        return;
      }
      if (e.target.closest('#scan-add')) {
        Object.keys(checked).forEach(function (k) { if (checked[k]) addFound(+k); });
        checked = {};
        scrim.classList.remove('open');
        A.go('root');
        return;
      }
      if (e.target.closest('#man-add')) {
        var name = document.getElementById('m-name').value.trim() || 'NAS';
        var addr = document.getElementById('m-addr').value.trim() || '192.168.1.60';
        var where = document.getElementById('m-place').value;
        var type = document.getElementById('m-type').value;
        var icons = { router: 'router', vps: 'cloud', domain: 'domain', device: 'box' };
        var types = { router: 'type.router', vps: 'type.vps', domain: 'type.domain', device: 'type.device' };
        var id = 'man' + Date.now();
        A.addNode(id, { icon: icons[type], name: name, type: types[type], sub: addr, state: 'unknown', place: where }, 'root', place(where), []);
        scrim.classList.remove('open');
        A.go('root', id);
      }
    });
    scrim.addEventListener('change', function (e) {
      if (e.target.dataset.f) { checked[e.target.dataset.f] = e.target.checked; draw(); }
    });
    document.addEventListener('gl-lang', function () { if (scrim.classList.contains('open')) draw(); });

    // First run: ?empty=1 shows what a brand-new installation looks like.
    if (/[?&]empty=1/.test(location.search)) {
      var w = document.createElement('div');
      w.className = 'overlay welcome';
      w.innerHTML = '<div class="welcome-box"><h1>' + t('welcome.title') + '</h1><p class="muted">' + t('welcome.lead') + '</p>' +
        '<div class="welcome-steps">' + [['laptop', 's1'], ['radar', 's2'], ['cloud', 's3']].map(function (s, i) {
          return '<button class="welcome-step" data-wstep="' + i + '"><span class="pn">' + (i + 1) + '</span>' + glIcon(s[0]) + '<b>' + t('welcome.' + s[1]) + '</b><span class="muted">' + t('welcome.' + s[1] + '.d') + '</span></button>';
        }).join('') + '</div><button class="btn btn-ghost" id="welcome-demo">' + t('welcome.demo') + '</button></div>';
      document.getElementById('canvas').appendChild(w);
      document.getElementById('app').classList.add('empty');
      w.addEventListener('click', function (e) {
        var s = e.target.closest('[data-wstep]');
        if (s) { tab = ['agent', 'scan', 'manual'][+s.dataset.wstep]; A.openDialog('dlg-add'); draw(); }
        if (e.target.closest('#welcome-demo')) { w.remove(); document.getElementById('app').classList.remove('empty'); A.fit(); }
      });
    }
  });
})();
