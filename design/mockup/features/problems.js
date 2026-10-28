// Problems center: one status line in the top bar ("all good" / "N problems") and a list of
// everything that is wrong right now, plus advice. Clicking an item travels to it on the map.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'st.ok': 'Всё работает',
      'st.some': 'Проблем: {n}',
      'pr.title': 'Что сейчас не так',
      'pr.tab.problems': 'Проблемы',
      'pr.tab.advice': 'Советы',
      'pr.show': 'Показать',
      'pr.empty': 'Всё работает. Если что-то случится, появится здесь и придёт в Telegram.',
      'prob.cam': 'Камера во дворе не отвечает 6 минут',
      'prob.upcity': 'Домашний интернет теряет 3% данных',
      'prob.worker': 'Очередь кодирования видео растёт',
      'prob.port': 'Кабель к junk работает на 100 Мбит вместо 1 Гбит',
      'prob.ssl': 'Сертификат HTTPS gridman.example истекает через 12 дней',
      'prob.balance': 'Баланса Timeweb хватит на 9 дней',
      'adv.cable': 'Замените кабель между Keenetic и junk — скорость вырастет в 10 раз.',
      'adv.backup': 'Включите автоматические копии на сервере Timeweb: сейчас их нет.',
      'adv.verify': 'Проверьте вчерашнюю копию calibur — её ещё ни разу не восстанавливали на пробу.',
      'adv.ssl': 'Включите автопродление сертификата: Gridlume сам будет продлевать его через Let\'s Encrypt.',
      'adv.ram': 'Память calibur в пике занята на 85%. Когда появится max, перенесите туда komodo.',
      'adv.wifi': 'Камере во дворе не хватает Wi-Fi. Поставьте ретранслятор ближе к ней или проведите кабель.',
    },
    en: {
      'st.ok': 'All good',
      'st.some': 'Problems: {n}',
      'pr.title': 'What is wrong right now',
      'pr.tab.problems': 'Problems',
      'pr.tab.advice': 'Advice',
      'pr.show': 'Show',
      'pr.empty': 'Everything works. If something happens it shows up here and in Telegram.',
      'prob.cam': 'The yard camera has not answered for 6 minutes',
      'prob.upcity': 'Home internet is losing 3% of data',
      'prob.worker': 'The video encoding queue is growing',
      'prob.port': 'The cable to junk runs at 100 Mbit instead of 1 Gbit',
      'prob.ssl': 'The gridman.example HTTPS certificate expires in 12 days',
      'prob.balance': 'The Timeweb balance lasts 9 more days',
      'adv.cable': 'Replace the cable between Keenetic and junk — speed goes up ten times.',
      'adv.backup': 'Turn on automatic backups for the Timeweb server: there are none now.',
      'adv.verify': 'Test yesterday\'s calibur backup — it has never been test-restored.',
      'adv.ssl': 'Turn on certificate auto-renewal: Gridlume will renew it via Let\'s Encrypt.',
      'adv.ram': 'calibur memory peaks at 85%. When max arrives, move komodo there.',
      'adv.wifi': 'The yard camera lacks Wi-Fi. Put a repeater closer to it or run a cable.',
    },
  });

  var PROBLEMS = [
    { sev: 'crit', node: 'cam', title: 'prob.cam', time: '14:20' },
    { sev: 'warn', link: 'up-city', title: 'prob.upcity', time: '14:02' },
    { sev: 'warn', node: 'worker', title: 'prob.worker', time: '13:40' },
    { sev: 'warn', link: 'lan-junk', title: 'prob.port', time: '09:12' },
    { sev: 'warn', node: 'web', title: 'prob.ssl', time: '' },
    { sev: 'warn', node: 'tw', title: 'prob.balance', time: '' },
  ];
  var ADVICE = [
    { node: 'cam', text: 'adv.wifi' },
    { link: 'lan-junk', text: 'adv.cable' },
    { node: 'tw', text: 'adv.backup' },
    { node: 'calibur', text: 'adv.verify' },
    { node: 'web', text: 'adv.ssl' },
    { node: 'calibur', text: 'adv.ram' },
  ];
  A.PROBLEMS = PROBLEMS;

  var tab = 'problems';

  function where(p) {
    var id = p.node || (A.LINKS[p.link] && Object.keys(A.VIEWS).reduce(function (acc, v) {
      A.VIEWS[v].edges.forEach(function (e) { if (e[4] === p.link) acc = e[1]; });
      return acc;
    }, null));
    var n = A.NODES[id];
    return n && n.place ? t('place.' + n.place) : '';
  }

  function renderStatus() {
    var el = document.getElementById('status-pill');
    var crit = PROBLEMS.filter(function (p) { return p.sev === 'crit'; }).length;
    var sev = crit ? 'crit' : PROBLEMS.length ? 'warn' : 'ok';
    el.className = 'badge status-pill ' + sev;
    el.innerHTML = '<span class="dot ' + sev + '"></span>' + (PROBLEMS.length ? t('st.some').replace('{n}', PROBLEMS.length) : t('st.ok'));
  }

  function renderPanel() {
    var panel = document.getElementById('problems');
    var list = tab === 'problems'
      ? (PROBLEMS.length ? PROBLEMS.map(function (p, i) {
        return '<div class="pr-item" data-pi="' + i + '"><span class="dot ' + p.sev + '"></span><div class="grow"><div>' + t(p.title) + '</div>' +
          '<div class="faint">' + [where(p), p.time].filter(Boolean).join(' · ') + '</div></div><button class="btn btn-sm">' + t('pr.show') + '</button></div>';
      }).join('') : '<p class="faint" style="padding:16px;margin:0">' + t('pr.empty') + '</p>')
      : ADVICE.map(function (a, i) {
        return '<div class="pr-item" data-ai="' + i + '"><span class="dot info" style="background:var(--info)"></span><div class="grow">' + t(a.text) + '</div><button class="btn btn-sm">' + t('pr.show') + '</button></div>';
      }).join('');
    panel.innerHTML = '<div class="fc-head"><b>' + t('pr.title') + '</b><span class="grow"></span>' +
      '<div class="segmented"><button data-tab="problems" aria-pressed="' + (tab === 'problems') + '">' + t('pr.tab.problems') + ' · ' + PROBLEMS.length + '</button>' +
      '<button data-tab="advice" aria-pressed="' + (tab === 'advice') + '">' + t('pr.tab.advice') + ' · ' + ADVICE.length + '</button></div></div>' +
      '<div class="pr-list">' + list + '</div>';
  }

  function toggle(open) {
    var panel = document.getElementById('problems');
    var show = open !== undefined ? open : !panel.classList.contains('open');
    panel.classList.toggle('open', show);
    if (show) renderPanel();
  }

  function goTo(item) {
    toggle(false);
    if (item.link) A.selectLink(item.link); else A.select(item.node);
    A.HOOKS.problemOpened && A.HOOKS.problemOpened.forEach(function (fn) { fn(item); });
  }

  A.HOOKS.problemOpened = [];
  A.problems = { toggle: toggle, list: PROBLEMS };

  A.HOOKS.ready.push(function () {
    var bell = document.getElementById('bell');
    var pill = document.createElement('button');
    pill.id = 'status-pill';
    bell.parentNode.insertBefore(pill, bell);
    var panel = document.createElement('div');
    panel.id = 'problems';
    panel.className = 'dropdown';
    document.body.appendChild(panel);
    renderStatus();

    pill.addEventListener('click', function () { toggle(); });
    bell.addEventListener('click', function () { toggle(); });
    panel.addEventListener('click', function (e) {
      var tb = e.target.closest('[data-tab]');
      if (tb) { tab = tb.dataset.tab; renderPanel(); return; }
      var p = e.target.closest('[data-pi]');
      if (p) { goTo(PROBLEMS[+p.dataset.pi]); return; }
      var a = e.target.closest('[data-ai]');
      if (a) goTo(ADVICE[+a.dataset.ai]);
    });
    document.addEventListener('mousedown', function (e) {
      if (!e.target.closest('#problems, #status-pill, #bell')) toggle(false);
    });
    document.addEventListener('gl-lang', function () { renderStatus(); if (panel.classList.contains('open')) renderPanel(); });
  });
})();
