// Screens behind the left rail: all nodes as a table, the action log, the password vault,
// notification rules and settings. The map stays the main screen; these open over it.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'pg.nodes.title': 'Все узлы',
      'pg.nodes.filter': 'Фильтр по имени, адресу, месту…',
      'pg.col.name': 'Имя', 'pg.col.type': 'Тип', 'pg.col.place': 'Где', 'pg.col.state': 'Состояние', 'pg.col.addr': 'Адрес', 'pg.col.inside': 'Внутри',
      'pg.journal.title': 'Журнал действий',
      'pg.journal.lead': 'Всё, что делалось с инфраструктурой: кем, когда и чем закончилось. Где возможно — откат одной кнопкой.',
      'pg.col.time': 'Когда', 'pg.col.who': 'Кто', 'pg.col.what': 'Что', 'pg.col.result': 'Результат',
      'pg.res.ok': 'успешно', 'pg.res.fail': 'ошибка', 'pg.res.undone': 'откачено',
      'pg.undo': 'Откатить',
      'pg.undo.tip': 'Вернёт всё, как было до этого действия. Перед откатом покажем, что именно изменится.',
      'j.update': 'Обновил gridman-api 1.41 → 1.42',
      'j.restart': 'Перезапустил ffmpeg-worker',
      'j.vault': 'Посмотрел пароль root · gridman.example',
      'j.add': 'Добавил камеру во дворе',
      'j.agent': 'Подключил calibur (агент 0.1)',
      'pg.vault.title': 'Пароли и доступы',
      'pg.vault.locked': 'Хранилище заблокировано',
      'pg.vault.lead': 'Пароли хранятся зашифрованными мастер-паролем. Без него их не прочитать — даже имея доступ к серверу.',
      'pg.vault.master': 'Мастер-пароль',
      'pg.vault.unlock': 'Разблокировать',
      'pg.vault.demo': 'В макете подходит любой пароль.',
      'pg.vault.autolock': 'Заблокируется само через 15 минут бездействия.',
      'pg.vault.import': 'Импорт из KeePassXC',
      'pg.vault.import.tip': 'Выберите файл .kdbx и введите его мастер-пароль. Записи разложатся по узлам схемы, совпадения найдём по адресам.',
      'pg.vault.lock': 'Заблокировать',
      'pg.vault.show': 'Показать',
      'pg.vault.copy': 'Скопировать',
      'pg.vault.logged': 'Каждый просмотр и копирование пишутся в журнал.',
      'pg.rules.title': 'Уведомления',
      'pg.rules.lead': 'Правила простыми словами. Что-то случилось — придёт сообщение туда, куда вы выбрали.',
      'pg.rules.channels': 'Куда отправлять',
      'pg.rules.quiet': 'Тихие часы 23:00–08:00: ночью — только критичное.',
      'r.down': 'Если узел не отвечает дольше <b>2 минут</b>',
      'r.loss': 'Если связь теряет больше <b>5%</b> данных дольше <b>5 минут</b>',
      'r.ssl': 'Если сертификат или домен истекает меньше чем через <b>14 дней</b>',
      'r.balance': 'Если баланса облака хватит меньше чем на <b>7 дней</b>',
      'r.backup': 'Если ночная копия не сделалась или не прошла проверку',
      'r.digest': 'Каждое утро в <b>9:00</b> — короткая сводка',
      'r.to': '→',
      'ch.tg': 'Telegram', 'ch.tg.s': 'подключён · @gridlume_bot',
      'ch.max': 'MAX', 'ch.max.s': 'нужна бизнес-страница MAX и модерация бота',
      'ch.ya': 'Яндекс Мессенджер', 'ch.ya.s': 'для организаций в Яндекс 360',
      'ch.mail': 'Email', 'ch.mail.s': 'не настроен',
      'ch.hook': 'Webhook', 'ch.hook.s': 'для своих систем',
      'ch.connect': 'Подключить',
      'pg.settings.title': 'Настройки',
      'pg.set.lang': 'Язык интерфейса',
      'pg.set.agents': 'Обновлять агентов автоматически',
      'pg.set.agents.d': 'Новые версии ставятся ночью по одной машине; если что-то пошло не так — откат.',
      'pg.set.speed': 'Ночной замер скорости связей',
      'pg.set.speed.d': 'В 03:00–04:00, по 20 секунд на связь.',
      'pg.set.version': 'Версия',
      'pg.back': 'К схеме',
    },
    en: {
      'pg.nodes.title': 'All nodes',
      'pg.nodes.filter': 'Filter by name, address, place…',
      'pg.col.name': 'Name', 'pg.col.type': 'Type', 'pg.col.place': 'Where', 'pg.col.state': 'State', 'pg.col.addr': 'Address', 'pg.col.inside': 'Inside',
      'pg.journal.title': 'Action log',
      'pg.journal.lead': 'Everything done to the infrastructure: by whom, when and how it ended. Rollback with one button where possible.',
      'pg.col.time': 'When', 'pg.col.who': 'Who', 'pg.col.what': 'What', 'pg.col.result': 'Result',
      'pg.res.ok': 'success', 'pg.res.fail': 'failed', 'pg.res.undone': 'rolled back',
      'pg.undo': 'Roll back',
      'pg.undo.tip': 'Brings everything back to how it was before this action. You see exactly what changes first.',
      'j.update': 'Updated gridman-api 1.41 → 1.42',
      'j.restart': 'Restarted ffmpeg-worker',
      'j.vault': 'Viewed the root password · gridman.example',
      'j.add': 'Added the yard camera',
      'j.agent': 'Connected calibur (agent 0.1)',
      'pg.vault.title': 'Passwords and access',
      'pg.vault.locked': 'The vault is locked',
      'pg.vault.lead': 'Passwords are encrypted with the master password. Without it they cannot be read — even with access to the server.',
      'pg.vault.master': 'Master password',
      'pg.vault.unlock': 'Unlock',
      'pg.vault.demo': 'Any password works in the mockup.',
      'pg.vault.autolock': 'Locks itself after 15 minutes of inactivity.',
      'pg.vault.import': 'Import from KeePassXC',
      'pg.vault.import.tip': 'Pick a .kdbx file and enter its master password. Entries are attached to map nodes by matching addresses.',
      'pg.vault.lock': 'Lock',
      'pg.vault.show': 'Show',
      'pg.vault.copy': 'Copy',
      'pg.vault.logged': 'Every view and copy is written to the log.',
      'pg.rules.title': 'Notifications',
      'pg.rules.lead': 'Rules in plain words. When something happens, a message goes where you chose.',
      'pg.rules.channels': 'Where to send',
      'pg.rules.quiet': 'Quiet hours 23:00–08:00: only critical at night.',
      'r.down': 'If a node does not answer for more than <b>2 minutes</b>',
      'r.loss': 'If a link loses more than <b>5%</b> of data for more than <b>5 minutes</b>',
      'r.ssl': 'If a certificate or domain expires in less than <b>14 days</b>',
      'r.balance': 'If the cloud balance lasts less than <b>7 days</b>',
      'r.backup': 'If the nightly backup was not made or failed its check',
      'r.digest': 'Every morning at <b>9:00</b> — a short summary',
      'r.to': '→',
      'ch.tg': 'Telegram', 'ch.tg.s': 'connected · @gridlume_bot',
      'ch.max': 'MAX', 'ch.max.s': 'needs a MAX business page and bot moderation',
      'ch.ya': 'Yandex Messenger', 'ch.ya.s': 'for Yandex 360 organisations',
      'ch.mail': 'Email', 'ch.mail.s': 'not set up',
      'ch.hook': 'Webhook', 'ch.hook.s': 'for your own systems',
      'ch.connect': 'Connect',
      'pg.settings.title': 'Settings',
      'pg.set.lang': 'Interface language',
      'pg.set.agents': 'Update agents automatically',
      'pg.set.agents.d': 'New versions install at night, one machine at a time; rollback if something goes wrong.',
      'pg.set.speed': 'Nightly link speed test',
      'pg.set.speed.d': 'At 03:00–04:00, 20 seconds per link.',
      'pg.set.version': 'Version',
      'pg.back': 'Back to map',
    },
  });

  var JOURNAL = [
    { time: '14:05', who: 'ops', what: 'j.restart', target: 'worker', res: 'ok', undo: false },
    { time: '12:05', who: 'ops', what: 'j.update', target: 'api', res: 'ok', undo: true },
    { time: '11:40', who: 'ops', what: 'j.vault', target: 'tw', res: 'ok', undo: false },
    { time: 'yesterday 19:12', who: 'ops', what: 'j.add', target: 'cam', res: 'ok', undo: true },
    { time: 'yesterday 00:41', who: 'ops', what: 'j.agent', target: 'calibur', res: 'ok', undo: false },
  ];
  A.HOOKS.journal.push(function (title) {
    var now = new Date().toTimeString().slice(0, 5);
    JOURNAL.unshift({ time: now, who: 'ops', text: title, target: A.selected, res: 'ok', undo: true });
    if (page === 'journal') draw();
  });

  GL.add({
    ru: { 'v.user': 'пароль пользователя', 'v.server': 'пароль сервера', 'v.cloud': 'аккаунт облака', 'v.router': 'панель роутера', 'v.bios': 'пароль BIOS (снят)' },
    en: { 'v.user': 'user password', 'v.server': 'server password', 'v.cloud': 'cloud account', 'v.router': 'router panel', 'v.bios': 'BIOS password (removed)' },
  });
  // Demo secrets: fake values that only show what revealing looks like.
  var VAULT = [
    { node: 'calibur', items: [['ops', 'v.user', 'K7q!m2-demo'], ['BIOS', 'v.bios', '']] },
    { node: 'tw', items: [['root', 'v.server', 'Vx9#2p-demo'], ['Timeweb Cloud', 'v.cloud', 'pR4$-demo']] },
    { node: 'pg', items: [['gridman', 'PostgreSQL', 'db8&Lq-demo']] },
    { node: 'keenetic', items: [['admin', 'v.router', 'kN3!-demo'], ['MT', 'Wi-Fi', 'wF7@-demo']] },
  ];
  var unlocked = false, filterQ = '';

  var page = 'map';

  function table(head, rows) {
    return '<table class="tbl"><thead><tr>' + head.map(function (h) { return '<th>' + t(h) + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.join('') + '</tbody></table>';
  }

  function nodesPage() {
    var q = filterQ.toLowerCase();
    var rows = Object.keys(A.NODES).filter(function (id) {
      var n = A.NODES[id], hay = (A.nodeName(n) + ' ' + (n.sub || '') + ' ' + (n.place ? t('place.' + n.place) : '')).toLowerCase();
      return !q || hay.indexOf(q) >= 0;
    }).map(function (id) {
      var n = A.NODES[id], d = A.DETAILS[id] || {};
      var addr = (d.kv || []).filter(function (r) { return r[0] === 'insp.address'; })[0];
      return '<tr data-open="' + id + '"><td>' + glIcon(n.icon) + ' ' + A.nodeName(n) + '</td><td class="faint">' + t(n.type) + '</td><td>' + (n.place ? t('place.' + n.place) : '—') + '</td>' +
        '<td><span class="dot ' + n.state + '"></span> ' + t('state.' + n.state) + '</td><td class="mono faint">' + (addr ? addr[1] : n.sub || '—') + '</td><td class="faint">' + (A.KIDS[id] ? A.KIDS[id].length : '') + '</td></tr>';
    });
    return '<h1>' + t('pg.nodes.title') + ' <span class="faint">' + rows.length + '</span></h1>' +
      '<input class="input" id="pg-filter" style="width:320px;margin-bottom:16px" placeholder="' + A.attr(t('pg.nodes.filter')) + '" value="' + A.attr(filterQ) + '">' +
      table(['pg.col.name', 'pg.col.type', 'pg.col.place', 'pg.col.state', 'pg.col.addr', 'pg.col.inside'], rows);
  }

  function journalPage() {
    var rows = JOURNAL.map(function (j, i) {
      var target = A.NODES[j.target] ? A.nodeName(A.NODES[j.target]) : '';
      return '<tr><td class="mono faint">' + j.time.replace('yesterday', t('time.yesterday')) + '</td><td>' + j.who + '</td><td>' + (j.text || t(j.what)) + (target ? ' <span class="faint">· ' + target + '</span>' : '') + '</td>' +
        '<td><span class="badge ' + (j.res === 'ok' ? 'ok' : j.res === 'fail' ? 'crit' : '') + '">' + t('pg.res.' + j.res) + '</span></td>' +
        '<td>' + (j.undo && j.res === 'ok' ? '<button class="btn btn-sm" data-undo="' + i + '" data-tip="' + A.attr(t('pg.undo.tip')) + '">' + glIcon('restore') + t('pg.undo') + '</button>' : '') + '</td></tr>';
    });
    return '<h1>' + t('pg.journal.title') + '</h1><p class="muted lead">' + t('pg.journal.lead') + '</p>' +
      table(['pg.col.time', 'pg.col.who', 'pg.col.what', 'pg.col.result', ''], rows);
  }

  function vaultPage() {
    if (!unlocked) {
      return '<div class="vault-lock">' + glIcon('lock') + '<h1>' + t('pg.vault.locked') + '</h1><p class="muted">' + t('pg.vault.lead') + '</p>' +
        '<form id="vault-form"><input class="input" type="password" id="vault-pw" placeholder="' + A.attr(t('pg.vault.master')) + '" autocomplete="off" style="width:280px">' +
        '<button class="btn btn-primary">' + t('pg.vault.unlock') + '</button></form><p class="faint" style="font-size:var(--fs-12)">' + t('pg.vault.demo') + '</p></div>';
    }
    return '<h1>' + t('pg.vault.title') + '</h1><div class="stack-row"><span class="muted">' + t('pg.vault.autolock') + ' ' + t('pg.vault.logged') + '</span><span class="grow"></span>' +
      '<button class="btn btn-sm" data-tip="' + A.attr(t('pg.vault.import.tip')) + '">' + t('pg.vault.import') + '</button><button class="btn btn-sm" id="vault-lock">' + glIcon('lock') + t('pg.vault.lock') + '</button></div>' +
      VAULT.map(function (g) {
        var n = A.NODES[g.node];
        return '<div class="vault-group"><div class="vg-head">' + glIcon(n.icon) + '<b>' + A.nodeName(n) + '</b><span class="faint">' + t(n.type) + '</span></div>' +
          g.items.map(function (it, i) {
            return '<div class="row"><span class="grow">' + it[0] + ' <span class="faint">· ' + t(it[1]) + '</span></span>' +
              (it[2] ? '<span class="mono secret" data-secret="' + A.attr(it[2]) + '">••••••••</span><button class="btn btn-sm btn-ghost" data-reveal>' + glIcon('eye') + t('pg.vault.show') + '</button>' +
                '<button class="btn btn-sm btn-ghost" data-copy>' + glIcon('copy') + t('pg.vault.copy') + '</button>' : '<span class="faint">—</span>') + '</div>';
          }).join('') + '</div>';
      }).join('');
  }

  function rulesPage() {
    var rules = [['r.down', true], ['r.loss', true], ['r.ssl', true], ['r.balance', true], ['r.backup', true], ['r.digest', false]];
    var channels = [['ch.tg', 'ok'], ['ch.max', ''], ['ch.ya', ''], ['ch.mail', ''], ['ch.hook', '']];
    return '<h1>' + t('pg.rules.title') + '</h1><p class="muted lead">' + t('pg.rules.lead') + '</p>' +
      '<div class="rules">' + rules.map(function (r) {
        return '<label class="rule"><input type="checkbox" class="switch"' + (r[1] ? ' checked' : '') + '><span class="grow">' + t(r[0]) + '</span><span class="faint">' + t('r.to') + '</span><span class="badge">Telegram</span></label>';
      }).join('') + '</div><p class="faint" style="font-size:var(--fs-12)">' + t('pg.rules.quiet') + '</p>' +
      '<h2>' + t('pg.rules.channels') + '</h2><div class="channels">' + channels.map(function (c) {
        return '<div class="channel"><b>' + t(c[0]) + '</b><span class="faint">' + t(c[0] + '.s') + '</span>' +
          (c[1] === 'ok' ? '<span class="badge ok"><span class="dot ok"></span>on</span>' : '<button class="btn btn-sm">' + t('ch.connect') + '</button>') + '</div>';
      }).join('') + '</div>';
  }

  function settingsPage() {
    return '<h1>' + t('pg.settings.title') + '</h1><div class="rules">' +
      '<div class="rule"><span class="grow">' + t('pg.set.lang') + '</span><div class="segmented"><button data-setlang="ru" aria-pressed="' + (GL.lang === 'ru') + '">Русский</button><button data-setlang="en" aria-pressed="' + (GL.lang === 'en') + '">English</button></div></div>' +
      '<label class="rule"><input type="checkbox" class="switch" checked><span class="grow">' + t('pg.set.agents') + '<br><span class="faint" style="font-size:var(--fs-12)">' + t('pg.set.agents.d') + '</span></span></label>' +
      '<label class="rule"><input type="checkbox" class="switch" checked><span class="grow">' + t('pg.set.speed') + '<br><span class="faint" style="font-size:var(--fs-12)">' + t('pg.set.speed.d') + '</span></span></label>' +
      '<div class="rule"><span class="grow">' + t('pg.set.version') + '</span><span class="mono faint">Gridlume 0.1 · mockup</span></div></div>';
  }

  function draw() {
    var el = document.getElementById('page');
    var body = { nodes: nodesPage, journal: journalPage, vault: vaultPage, rules: rulesPage, settings: settingsPage }[page];
    el.innerHTML = '<div class="page-inner"><button class="btn btn-sm btn-ghost page-back" data-page-back>← ' + t('pg.back') + '</button>' + body() + '</div>';
    var f = document.getElementById('pg-filter');
    if (f && f === document.activeElement) {} // keep focus handled in input listener
  }

  function open(p) {
    page = p;
    A.state.page = p;
    var el = document.getElementById('page');
    el.classList.toggle('open', p !== 'map');
    document.getElementById('app').classList.toggle('page-open', p !== 'map');
    if (p !== 'map') draw();
    A.renderRail();
  }

  A.pages = { open: open };

  A.HOOKS.ready.push(function () {
    var el = document.createElement('div');
    el.id = 'page';
    el.className = 'page overlay';
    document.getElementById('canvas').appendChild(el);

    document.getElementById('rail').addEventListener('click', function (e) {
      var b = e.target.closest('[data-page]');
      if (b) open(b.dataset.page === page ? 'map' : b.dataset.page);
    });
    el.addEventListener('click', function (e) {
      if (e.target.closest('[data-page-back]')) { open('map'); return; }
      var row = e.target.closest('[data-open]');
      if (row) { open('map'); A.select(row.dataset.open); return; }
      var u = e.target.closest('[data-undo]');
      if (u) {
        var j = JOURNAL[+u.dataset.undo];
        A.confirm({ title: t('pg.undo') + ': ' + (j.text || t(j.what)), risk: 'careful', lead: t('pg.undo.tip'), go: t('pg.undo'), onGo: function () { j.res = 'undone'; draw(); } });
        return;
      }
      var r = e.target.closest('[data-reveal]');
      if (r) {
        var s = r.parentNode.querySelector('.secret');
        s.textContent = s.textContent.indexOf('•') === 0 ? s.dataset.secret : '••••••••';
        return;
      }
      var c = e.target.closest('[data-copy]');
      if (c) { c.lastChild.textContent = '✓'; return; }
      if (e.target.closest('#vault-lock')) { unlocked = false; draw(); return; }
      var l = e.target.closest('[data-setlang]');
      if (l) GL.setLang(l.dataset.setlang);
    });
    el.addEventListener('submit', function (e) {
      e.preventDefault();
      if (document.getElementById('vault-pw').value) { unlocked = true; draw(); }
    });
    el.addEventListener('input', function (e) {
      if (e.target.id === 'pg-filter') {
        filterQ = e.target.value;
        var pos = e.target.selectionStart;
        draw();
        var f = document.getElementById('pg-filter');
        f.focus(); f.setSelectionRange(pos, pos);
      }
    });
    document.addEventListener('gl-lang', function () { if (page !== 'map') draw(); });
  });
})();
