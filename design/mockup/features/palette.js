// Command palette (Ctrl+K): type a name or an action, press Enter.
// Actions keep their risk level and still go through the same confirmation as from the inspector.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'pal.ph': 'Узел, связь или действие… например «перезапустить api»',
      'pal.go': 'Перейти',
      'pal.do': 'Действия',
      'pal.show': 'Показать',
      'pal.app': 'Приложение',
      'pal.empty': 'Ничего не нашлось. Попробуйте имя машины, сервиса или IP.',
      'pal.hint': '↑↓ выбрать · Enter выполнить · Esc закрыть',
      'pal.path': 'Путь запроса до gridman.example',
      'pal.problems': 'Что сейчас не так',
      'pal.events': 'Все события',
      'pal.history': 'История за сутки',
      'pal.add': 'Добавить машину',
      'pal.lang': 'Switch to English',
      'search.kbd': 'Ctrl K',
    },
    en: {
      'pal.ph': 'A node, link or action… e.g. "restart api"',
      'pal.go': 'Go to',
      'pal.do': 'Actions',
      'pal.show': 'Show',
      'pal.app': 'App',
      'pal.empty': 'Nothing found. Try a machine, service name or IP.',
      'pal.hint': '↑↓ select · Enter run · Esc close',
      'pal.path': 'Request path to gridman.example',
      'pal.problems': 'What is wrong right now',
      'pal.events': 'All events',
      'pal.history': 'Last 24 hours',
      'pal.add': 'Add a machine',
      'pal.lang': 'Переключить на русский',
      'search.kbd': 'Ctrl K',
    },
  });

  function items() {
    var list = [];
    Object.keys(A.NODES).forEach(function (id) {
      var n = A.NODES[id];
      list.push({ group: 'pal.go', icon: n.icon, label: A.nodeName(n), hint: t(n.type) + (n.place ? ' · ' + t('place.' + n.place) : ''), state: n.state, run: function () { A.select(id); } });
      var d = A.DETAILS[id];
      (d && d.actions || []).forEach(function (a) {
        list.push({ group: 'pal.do', icon: a[0], label: t(a[1]) + ' · ' + A.nodeName(n), risk: a[2], run: function () { A.select(id); A.runAction(id, a[0], a[1], a[2]); } });
      });
    });
    Object.keys(A.VIEWS).forEach(function (v) {
      A.VIEWS[v].edges.forEach(function (e) {
        if (!e[4]) return;
        var L = A.LINKS[e[4]];
        list.push({ group: 'pal.go', icon: 'link', label: A.nodeName(A.NODES[e[0]]) + ' → ' + A.nodeName(A.NODES[e[1]]), hint: t(L.kind), state: L.state, run: function () { A.selectLink(e[4]); } });
      });
    });
    list.push({ group: 'pal.show', icon: 'path', label: t('pal.path'), run: function () { A.impact && A.impact.showPath(); } });
    list.push({ group: 'pal.show', icon: 'alert', label: t('pal.problems'), run: function () { A.problems && A.problems.toggle(true); } });
    list.push({ group: 'pal.show', icon: 'bell', label: t('pal.events'), run: function () { A.drawer && A.drawer.show('events'); } });
    list.push({ group: 'pal.show', icon: 'history', label: t('pal.history'), run: function () { A.drawer && A.drawer.show('history'); } });
    list.push({ group: 'pal.app', icon: 'plus', label: t('pal.add'), run: function () { A.openDialog('dlg-add'); } });
    list.push({ group: 'pal.app', icon: 'globe', label: t('pal.lang'), run: function () { GL.setLang(GL.lang === 'ru' ? 'en' : 'ru'); } });
    return list;
  }

  var all = [], shown = [], cur = 0;

  function filter(q) {
    var words = q.toLowerCase().split(/\s+/).filter(Boolean);
    // Russian verbs people type first: "перезапустить api" should match "Перезапустить · gridman-api".
    shown = all.filter(function (it) {
      var hay = (it.label + ' ' + (it.hint || '')).toLowerCase();
      return words.every(function (w) { return hay.indexOf(w) >= 0; });
    }).slice(0, 40);
    cur = 0;
    draw();
  }

  function draw() {
    var box = document.getElementById('pal-list'), last = null, html = '';
    if (!shown.length) { box.innerHTML = '<p class="faint" style="padding:16px;margin:0">' + t('pal.empty') + '</p>'; return; }
    shown.forEach(function (it, i) {
      if (it.group !== last) { html += '<div class="pal-group">' + t(it.group) + '</div>'; last = it.group; }
      html += '<div class="pal-item' + (i === cur ? ' cur' : '') + '" data-i="' + i + '">' + glIcon(it.icon) + '<span class="grow">' + it.label + '</span>' +
        (it.hint ? '<span class="faint">' + it.hint + '</span>' : '') +
        (it.risk ? '<span class="risk ' + it.risk + '">' + t('risk.' + it.risk) + '</span>' : '') +
        (it.state && it.state !== 'ok' ? '<span class="dot ' + it.state + '"></span>' : '') + '</div>';
    });
    box.innerHTML = html;
    var c = box.querySelector('.cur');
    if (c) c.scrollIntoView({ block: 'nearest' });
  }

  function open() {
    all = items();
    var s = document.getElementById('dlg-pal');
    s.classList.add('open');
    var input = document.getElementById('pal-in');
    input.value = '';
    filter('');
    setTimeout(function () { input.focus(); }, 20);
  }

  function run(i) {
    var it = shown[i];
    if (!it) return;
    document.getElementById('dlg-pal').classList.remove('open');
    it.run();
  }

  A.HOOKS.ready.push(function () {
    var s = document.createElement('div');
    s.className = 'scrim';
    s.id = 'dlg-pal';
    s.style.placeItems = 'start center';
    s.innerHTML = '<div class="dialog palette"><div class="pal-head">' + glIcon('search') + '<input id="pal-in" autocomplete="off" spellcheck="false"></div>' +
      '<div class="pal-list" id="pal-list"></div><div class="pal-foot faint" data-i18n="pal.hint"></div></div>';
    document.body.appendChild(s);
    s.addEventListener('click', function (e) {
      if (e.target === s) { s.classList.remove('open'); return; }
      var it = e.target.closest('[data-i]');
      if (it) run(+it.dataset.i);
    });
    var input = document.getElementById('pal-in');
    input.addEventListener('input', function () { filter(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { cur = Math.min(shown.length - 1, cur + 1); draw(); e.preventDefault(); }
      if (e.key === 'ArrowUp') { cur = Math.max(0, cur - 1); draw(); e.preventDefault(); }
      if (e.key === 'Enter') run(cur);
    });

    // The top-bar search opens the palette too, so there is one place to find things.
    var search = document.getElementById('search');
    search.addEventListener('focus', function () { search.blur(); open(); });
    var kbd = document.querySelector('.search .kbd');
    if (kbd) { kbd.dataset.i18n = 'search.kbd'; }
    window.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'л' || e.key === 'Л')) { e.preventDefault(); open(); }
    });
    function lang() { input.placeholder = t('pal.ph'); GL.apply(s); }
    document.addEventListener('gl-lang', lang);
    lang();
  });

  A.palette = { open: open };
})();
