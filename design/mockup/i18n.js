// RU/EN dictionaries for the mockup, plus the shared tooltip behaviour.
// Every visible string goes through a key: data-i18n (text), data-i18n-tip (tooltip), data-i18n-ph (placeholder).

window.GL_I18N = {
  ru: {
    'app.views.network': 'Сеть',
    'app.views.services': 'Сервисы',
    'app.views.places': 'Места',
    'app.views.network.tip': 'Как соединены машины, роутеры, интернет и VPN.',
    'app.views.services.tip': 'Что на какой машине работает и что от чего зависит.',
    'app.views.places.tip': 'Всё, сгруппированное по местам: дом, деревня, облако.',
    'app.search': 'Найти узел, сервис, IP…',
    'app.demo': 'демо-данные',
    'rail.map': 'Схема',
    'rail.nodes': 'Все узлы',
    'rail.journal': 'Журнал действий',
    'rail.vault': 'Пароли',
    'rail.alerts': 'Уведомления',
    'rail.settings': 'Настройки',
    'canvas.add': 'Добавить',
    'canvas.add.tip': 'Добавить машину с агентом или вручную: роутер, VPS, домен, устройство.',
    'canvas.legend': 'Что значат линии',
    'canvas.zoomin': 'Приблизить',
    'canvas.zoomout': 'Отдалить',
    'canvas.fit': 'Показать всё',
    'legend.lan': 'Кабель / локальная сеть',
    'legend.wifi': 'Wi-Fi',
    'legend.uplink': 'Выход в интернет',
    'legend.vpn': 'VPN-туннель',
    'legend.runs': 'Работает на',
    'legend.depends': 'Зависит от',
    'legend.dns': 'Домен указывает на',
    'legend.planned': 'Запланировано',
    'place.village': 'Деревня',
    'place.city': 'Липецк, дом',
    'place.cloud': 'Облако · Timeweb',
    'place.net': 'Интернет',
    'type.server': 'Сервер',
    'type.router': 'Роутер',
    'type.vps': 'Облачный сервер',
    'type.container': 'Контейнер',
    'type.service': 'Сервис',
    'type.domain': 'Домен',
    'type.internet': 'Интернет',
    'type.ha': 'Умный дом',
    'state.ok': 'Работает',
    'state.warn': 'Внимание',
    'state.crit': 'Недоступен',
    'state.unknown': 'Нет данных',
    'state.planned': 'В планах',
    'insp.overview': 'Обзор',
    'insp.metrics': 'Сейчас',
    'insp.containers': 'Контейнеры',
    'insp.links': 'Связи',
    'insp.secrets': 'Доступы',
    'insp.actions': 'Действия',
    'insp.place': 'Место',
    'insp.address': 'Адрес',
    'insp.os': 'Система',
    'insp.hw': 'Железо',
    'insp.agent': 'Агент',
    'insp.uptime': 'Работает',
    'insp.cpu': 'Процессор',
    'insp.ram': 'Память',
    'insp.disk': 'Диск',
    'insp.temp': 'Температура',
    'insp.net': 'Сеть',
    'insp.vault.locked': 'Хранилище заблокировано',
    'insp.vault.unlock': 'Разблокировать',
    'insp.vault.tip': 'Пароли хранятся зашифрованными. Чтобы их увидеть, введите мастер-пароль. Каждый просмотр записывается в журнал.',
    'insp.close': 'Закрыть',
    'insp.empty': 'Выберите узел на схеме, чтобы увидеть подробности.',
    'act.restart': 'Перезапустить',
    'act.stop': 'Остановить',
    'act.logs': 'Логи',
    'act.terminal': 'Терминал',
    'act.move': 'Перенести на другую машину',
    'act.restart.tip': 'Контейнер остановится и запустится снова. Сайт будет недоступен 5–15 секунд.',
    'act.stop.tip': 'Контейнер остановится и не запустится сам. Всё, что от него зависит, перестанет работать.',
    'act.logs.tip': 'Последние записи журнала контейнера. Ничего не меняет.',
    'act.terminal.tip': 'Командная строка внутри машины. Команды выполняются от имени администратора.',
    'act.move.tip': 'Контейнер и его данные копируются на другую машину, потом переключаются. Сначала покажем план.',
    'risk.safe': 'безопасно',
    'risk.careful': 'осторожно',
    'risk.danger': 'опасно',
    'dlg.move.title': 'Перенести gridman-api на calibur',
    'dlg.move.lead': 'Вот что произойдёт по шагам. Ничего не начнётся, пока вы не подтвердите.',
    'dlg.move.s1': 'Скопируем данные контейнера на calibur (~2,4 ГБ, около 4 минут через интернет).',
    'dlg.move.s2': 'Запустим копию на calibur и проверим, что она отвечает.',
    'dlg.move.s3': 'Переключим сайт gridman.example на новую копию.',
    'dlg.move.s4': 'Остановим старый контейнер на gridman.example. Его данные сохраним 7 дней на случай отката.',
    'act.reboot': 'Перезагрузить машину',
    'act.reboot.tip': 'Машина перезагрузится. Все её контейнеры и сервисы будут недоступны 1–2 минуты.',
    'insp.runson': 'Работает на',
    'insp.image': 'Образ',
    'insp.ports': 'Порты',
    'insp.dependson': 'Зависит от',
    'insp.usedby': 'От него зависят',
    'insp.manual': 'нет — добавлен вручную',
    'note.rt': 'У этого роутера нет открытого API. Узел добавлен вручную, проверяем только, отвечает ли он в сети.',
    'note.worker': 'Очередь кодирования растёт 20 минут: 12 задач. Процессор загружен почти полностью.',
    'dlg.move.warn': '<strong>Сайт будет недоступен 10–30 секунд</strong> на шаге 3. Лучше делать ночью.',
    'dlg.move.undo': 'Откат: одна кнопка в журнале в течение 7 дней.',
    'dlg.move.confirm': 'Чтобы подтвердить, введите имя контейнера:',
    'dlg.cancel': 'Отмена',
    'dlg.move.go': 'Перенести',
    'dlg.add.title': 'Добавить машину',
    'dlg.add.lead': 'Выполните эту команду на машине, которую хотите подключить. Она поставит агента и сама появится на схеме.',
    'dlg.add.code': 'Код действует 15 минут и подходит только для одной машины.',
    'dlg.add.wait': 'Ждём подключения…',
    'dlg.add.manual': 'Добавить вручную',
    'dlg.add.manual.tip': 'Для устройств, на которые нельзя поставить агента: роутер, VPS без доступа, домен, камера.',
    'dlg.copy': 'Скопировать',
    'dlg.done': 'Готово',
    'lang.switch': 'English',
    'ds.title': 'Дизайн-система',
  },
  en: {
    'app.views.network': 'Network',
    'app.views.services': 'Services',
    'app.views.places': 'Places',
    'app.views.network.tip': 'How machines, routers, the internet and VPNs are connected.',
    'app.views.services.tip': 'What runs on which machine and what depends on what.',
    'app.views.places.tip': 'Everything grouped by place: home, village, cloud.',
    'app.search': 'Find a node, service, IP…',
    'app.demo': 'demo data',
    'rail.map': 'Map',
    'rail.nodes': 'All nodes',
    'rail.journal': 'Action log',
    'rail.vault': 'Passwords',
    'rail.alerts': 'Notifications',
    'rail.settings': 'Settings',
    'canvas.add': 'Add',
    'canvas.add.tip': 'Add a machine with an agent, or add a router, VPS, domain or device by hand.',
    'canvas.legend': 'What the lines mean',
    'canvas.zoomin': 'Zoom in',
    'canvas.zoomout': 'Zoom out',
    'canvas.fit': 'Fit everything',
    'legend.lan': 'Cable / local network',
    'legend.wifi': 'Wi-Fi',
    'legend.uplink': 'Internet uplink',
    'legend.vpn': 'VPN tunnel',
    'legend.runs': 'Runs on',
    'legend.depends': 'Depends on',
    'legend.dns': 'Domain points to',
    'legend.planned': 'Planned',
    'place.village': 'Village',
    'place.city': 'Lipetsk, home',
    'place.cloud': 'Cloud · Timeweb',
    'place.net': 'Internet',
    'type.server': 'Server',
    'type.router': 'Router',
    'type.vps': 'Cloud server',
    'type.container': 'Container',
    'type.service': 'Service',
    'type.domain': 'Domain',
    'type.internet': 'Internet',
    'type.ha': 'Smart home',
    'state.ok': 'Running',
    'state.warn': 'Attention',
    'state.crit': 'Down',
    'state.unknown': 'No data',
    'state.planned': 'Planned',
    'insp.overview': 'Overview',
    'insp.metrics': 'Now',
    'insp.containers': 'Containers',
    'insp.links': 'Links',
    'insp.secrets': 'Credentials',
    'insp.actions': 'Actions',
    'insp.place': 'Place',
    'insp.address': 'Address',
    'insp.os': 'System',
    'insp.hw': 'Hardware',
    'insp.agent': 'Agent',
    'insp.uptime': 'Uptime',
    'insp.cpu': 'CPU',
    'insp.ram': 'Memory',
    'insp.disk': 'Disk',
    'insp.temp': 'Temperature',
    'insp.net': 'Network',
    'insp.vault.locked': 'Vault is locked',
    'insp.vault.unlock': 'Unlock',
    'insp.vault.tip': 'Passwords are stored encrypted. Enter the master password to see them. Every view is written to the log.',
    'insp.close': 'Close',
    'insp.empty': 'Select a node on the map to see its details.',
    'act.restart': 'Restart',
    'act.stop': 'Stop',
    'act.logs': 'Logs',
    'act.terminal': 'Terminal',
    'act.move': 'Move to another machine',
    'act.restart.tip': 'The container stops and starts again. The site is unavailable for 5–15 seconds.',
    'act.stop.tip': 'The container stops and will not start by itself. Everything that depends on it stops working.',
    'act.logs.tip': 'Latest log entries of the container. Changes nothing.',
    'act.terminal.tip': 'A command line inside the machine. Commands run as administrator.',
    'act.move.tip': 'The container and its data are copied to another machine, then switched over. You see the plan first.',
    'risk.safe': 'safe',
    'risk.careful': 'careful',
    'risk.danger': 'dangerous',
    'dlg.move.title': 'Move gridman-api to calibur',
    'dlg.move.lead': 'Here is what will happen, step by step. Nothing starts until you confirm.',
    'dlg.move.s1': 'Copy the container data to calibur (~2.4 GB, about 4 minutes over the internet).',
    'dlg.move.s2': 'Start the copy on calibur and check that it responds.',
    'dlg.move.s3': 'Switch gridman.example over to the new copy.',
    'dlg.move.s4': 'Stop the old container on gridman.example. Its data is kept for 7 days in case of rollback.',
    'act.reboot': 'Reboot the machine',
    'act.reboot.tip': 'The machine reboots. All its containers and services are unavailable for 1–2 minutes.',
    'insp.runson': 'Runs on',
    'insp.image': 'Image',
    'insp.ports': 'Ports',
    'insp.dependson': 'Depends on',
    'insp.usedby': 'Used by',
    'insp.manual': 'none — added by hand',
    'note.rt': 'This router has no open API. The node was added by hand; we only check that it answers on the network.',
    'note.worker': 'The encoding queue has been growing for 20 minutes: 12 jobs. The CPU is almost fully loaded.',
    'dlg.move.warn': '<strong>The site will be down for 10–30 seconds</strong> at step 3. Better to do it at night.',
    'dlg.move.undo': 'Rollback: one button in the log, for 7 days.',
    'dlg.move.confirm': 'To confirm, type the container name:',
    'dlg.cancel': 'Cancel',
    'dlg.move.go': 'Move',
    'dlg.add.title': 'Add a machine',
    'dlg.add.lead': 'Run this command on the machine you want to connect. It installs the agent and the machine appears on the map by itself.',
    'dlg.add.code': 'The code is valid for 15 minutes and works for one machine only.',
    'dlg.add.wait': 'Waiting for the connection…',
    'dlg.add.manual': 'Add by hand',
    'dlg.add.manual.tip': 'For devices that cannot run the agent: a router, a VPS without access, a domain, a camera.',
    'dlg.copy': 'Copy',
    'dlg.done': 'Done',
    'lang.switch': 'Русский',
    'ds.title': 'Design system',
  },
};

window.GL = {
  lang: (function () {
    try {
      var saved = localStorage.getItem('gl-lang');
      if (saved === 'ru' || saved === 'en') return saved;
    } catch (e) {}
    return (navigator.language || 'ru').toLowerCase().indexOf('ru') === 0 ? 'ru' : 'en';
  })(),

  t: function (key) {
    var d = window.GL_I18N[GL.lang];
    return (d && d[key]) || window.GL_I18N.ru[key] || key;
  },

  apply: function (root) {
    root = root || document;
    document.documentElement.lang = GL.lang;
    root.querySelectorAll('[data-i18n]').forEach(function (el) { el.innerHTML = GL.t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) { el.placeholder = GL.t(el.dataset.i18nPh); });
    root.querySelectorAll('[data-i18n-tip]').forEach(function (el) { el.dataset.tip = GL.t(el.dataset.i18nTip); });
    root.querySelectorAll('[data-i18n-label]').forEach(function (el) { el.setAttribute('aria-label', GL.t(el.dataset.i18nLabel)); });
  },

  setLang: function (lang) {
    GL.lang = lang;
    try { localStorage.setItem('gl-lang', lang); } catch (e) {}
    GL.apply();
    document.dispatchEvent(new CustomEvent('gl-lang'));
  },
};

// Tooltips: one floating element, shown after a short delay for any [data-tip].
(function () {
  var tip, timer, current;
  function ensure() {
    if (!tip) {
      tip = document.createElement('div');
      tip.className = 'tip';
      document.body.appendChild(tip);
    }
  }
  function place(el) {
    var r = el.getBoundingClientRect();
    var tr = tip.getBoundingClientRect();
    var x = Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), window.innerWidth - tr.width - 8);
    var y = r.bottom + 8;
    if (y + tr.height > window.innerHeight - 8) y = r.top - tr.height - 8;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }
  document.addEventListener('mouseover', function (e) {
    var el = e.target.closest('[data-tip]');
    if (el === current) return;
    current = el;
    clearTimeout(timer);
    if (tip) tip.classList.remove('show');
    if (!el) return;
    timer = setTimeout(function () {
      ensure();
      tip.innerHTML = el.dataset.tip;
      place(el);
      tip.classList.add('show');
    }, 350);
  });
  document.addEventListener('scroll', function () { if (tip) tip.classList.remove('show'); }, true);
})();
