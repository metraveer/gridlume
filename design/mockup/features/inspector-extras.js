// Extra sections in the node card: backups (when, how big, verified or not, restore)
// and what is inside a container (ports, volumes, settings with secrets hidden, limits, processes).

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'bk.title': 'Резервные копии',
      'bk.tip': 'Копия, которую ни разу не восстанавливали на пробу, может оказаться битой в самый нужный момент. «Проверить» восстанавливает её во временный контейнер рядом и сравнивает — рабочие данные не трогаются.',
      'bk.last': 'Последняя',
      'bk.size': 'Размер',
      'bk.check': 'Проверка',
      'bk.ok': 'проверена восстановлением',
      'bk.notok': 'ещё не проверялась',
      'bk.schedule': 'Расписание',
      'bk.keep': 'Хранится',
      'bk.days': '{n} дней',
      'bk.nightly': 'каждую ночь',
      'bk.never': 'Копий нет',
      'bk.tw.off': 'У сервера Timeweb нет резервных копий. Если диск сервера выйдет из строя, данные gridman будут потеряны.',
      'bk.now': 'Сделать копию сейчас',
      'bk.now.tip': 'Займёт пару минут, сервис продолжит работать. Копия ляжет рядом с остальными.',
      'bk.test': 'Проверить восстановлением',
      'bk.test.tip': 'Копия восстанавливается во временный контейнер, проверяется и удаляется. Рабочие данные не трогаются.',
      'bk.enable': 'Включить копии',
      'bk.enable.tip': 'Gridlume будет каждую ночь копировать данные и хранить 14 последних копий. Можно выбрать, где хранить: на этой же машине, на другой или в облаке.',
      'in.title': 'Внутри контейнера',
      'in.tip': 'Что видно внутри: на каких портах он принимает соединения и от кого, где хранит данные, с какими настройками запущен, сколько ресурсов ему разрешено и какие процессы работают.',
      'in.ports': 'Порты',
      'in.from': 'от',
      'in.volumes': 'Данные (тома)',
      'in.env': 'Настройки',
      'in.secret': 'секрет · скрыт',
      'in.limits': 'Ограничения',
      'in.procs': 'Процессы',
    },
    en: {
      'bk.title': 'Backups',
      'bk.tip': 'A backup that was never test-restored may turn out broken exactly when you need it. "Test" restores it into a temporary container next to it and compares — live data is not touched.',
      'bk.last': 'Last',
      'bk.size': 'Size',
      'bk.check': 'Check',
      'bk.ok': 'verified by restore',
      'bk.notok': 'never verified',
      'bk.schedule': 'Schedule',
      'bk.keep': 'Kept for',
      'bk.days': '{n} days',
      'bk.nightly': 'every night',
      'bk.never': 'No backups',
      'bk.tw.off': 'The Timeweb server has no backups. If its disk fails, the gridman data is lost.',
      'bk.now': 'Back up now',
      'bk.now.tip': 'Takes a couple of minutes; the service keeps running. The copy goes next to the others.',
      'bk.test': 'Test by restoring',
      'bk.test.tip': 'The backup is restored into a temporary container, checked and removed. Live data is not touched.',
      'bk.enable': 'Turn on backups',
      'bk.enable.tip': 'Gridlume copies the data every night and keeps the last 14 copies. You choose where: the same machine, another one, or the cloud.',
      'in.title': 'Inside the container',
      'in.tip': 'What is inside: which ports it accepts connections on and from whom, where it keeps data, which settings it runs with, how many resources it may use and which processes run.',
      'in.ports': 'Ports',
      'in.from': 'from',
      'in.volumes': 'Data (volumes)',
      'in.env': 'Settings',
      'in.secret': 'secret · hidden',
      'in.limits': 'Limits',
      'in.procs': 'Processes',
    },
  });

  function when(v) {
    if (v === 'never') return t('bk.never');
    return v.replace('yesterday', t('time.yesterday'));
  }

  A.HOOKS.nodeInspector.push(function (id, d) {
    var html = '';
    if (d.inside) {
      var i = d.inside;
      html += '<div class="section"><h3 class="section-title">' + t('in.title') + ' <span class="help" data-tip="' + A.attr(t('in.tip')) + '">?</span></h3>' +
        '<div class="sub-title">' + t('in.ports') + '</div>' + i.ports.map(function (p) { return '<div class="row"><span class="mono">' + p[0] + '</span><span class="grow faint">' + t('in.from') + ' ' + p[1] + '</span></div>'; }).join('') +
        '<div class="sub-title">' + t('in.volumes') + '</div>' + i.volumes.map(function (v) { return '<div class="row">' + glIcon('db') + '<span class="grow">' + v[0] + ' <span class="faint mono">' + v[1] + '</span></span><span class="mono">' + v[2] + '</span></div>'; }).join('') +
        '<div class="sub-title">' + t('in.env') + '</div>' + i.env.map(function (e) {
          return '<div class="row"><span class="mono grow">' + e[0] + '</span>' + (e[1] == null ? '<span class="faint">' + glIcon('lock') + ' ' + t('in.secret') + '</span>' : '<span class="mono faint">' + e[1] + '</span>') + '</div>';
        }).join('') +
        '<div class="sub-title">' + t('in.limits') + '</div><div class="row"><span class="mono">' + i.limits + '</span></div>' +
        '<div class="sub-title">' + t('in.procs') + '</div>' + i.procs.map(function (p) { return '<div class="row"><span class="mono grow">' + p[0] + '</span><span class="mono faint">' + p[1] + ' · ' + p[2] + '</span></div>'; }).join('') +
        '</div>';
    }
    if (d.backups) {
      var b = d.backups;
      html += '<div class="section"><h3 class="section-title">' + glIcon('backup') + t('bk.title') + ' <span class="help" data-tip="' + A.attr(t('bk.tip')) + '">?</span></h3>';
      if (b.last === 'never') {
        html += '<div class="callout warn"><span><strong>' + t('bk.never') + '.</strong> ' + t(b.note) + '</span></div>' +
          '<button class="action" style="margin-top:8px" data-bk="enable" data-tip="' + A.attr(t('bk.enable.tip')) + '">' + glIcon('backup') + '<span class="grow">' + t('bk.enable') + '</span><span class="risk safe">' + t('risk.safe') + '</span></button>';
      } else {
        html += '<dl class="kv"><dt>' + t('bk.last') + '</dt><dd class="mono">' + when(b.last) + '</dd><dt>' + t('bk.size') + '</dt><dd class="mono">' + b.size + '</dd>' +
          '<dt>' + t('bk.check') + '</dt><dd style="color:var(--' + (b.verified ? 'ok' : 'warn') + ')">' + t(b.verified ? 'bk.ok' : 'bk.notok') + '</dd>' +
          '<dt>' + t('bk.schedule') + '</dt><dd>' + t(b.schedule) + '</dd><dt>' + t('bk.keep') + '</dt><dd>' + t('bk.days').replace('{n}', b.keep) + '</dd></dl>' +
          '<div style="margin-top:10px"><button class="action" data-bk="now" data-tip="' + A.attr(t('bk.now.tip')) + '">' + glIcon('backup') + '<span class="grow">' + t('bk.now') + '</span><span class="risk safe">' + t('risk.safe') + '</span></button>' +
          '<button class="action" data-bk="test" data-tip="' + A.attr(t('bk.test.tip')) + '">' + glIcon('restart') + '<span class="grow">' + t('bk.test') + '</span><span class="risk safe">' + t('risk.safe') + '</span></button></div>';
      }
      html += '</div>';
    }
    return html;
  });

  document.getElementById('inspector').addEventListener('click', function (e) {
    var b = e.target.closest('[data-bk]');
    if (!b) return;
    var name = A.nodeName(A.NODES[A.selected]);
    var label = { now: 'bk.now', test: 'bk.test', enable: 'bk.enable' }[b.dataset.bk];
    A.confirm({ title: t(label) + ' · ' + name, risk: 'safe', lead: t(label + '.tip'), go: t(label) });
  });
})();
