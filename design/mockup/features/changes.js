// "What changed before it broke", notes on a node, and the history of its settings with a before/after diff.
// One list of changes feeds all three, plus diamonds on the history timeline.

(function () {
  var A = window.GLAPP, t = A.t;

  GL.add({
    ru: {
      'chg.before': 'Что изменилось перед этим',
      'chg.before.tip': 'Изменения за 30 минут до начала проблемы: обновления, перезапуски, правки настроек. Совпадение по времени — не доказательство, поэтому помечаем «возможно связано». Проверьте и, если нужно, откатите.',
      'chg.maybe': 'возможно связано',
      'chg.ago': 'за {n} мин до проблемы',
      'chg.none': 'За 30 минут до проблемы ничего не менялось. Похоже, причина снаружи — например, у провайдера.',
      'chg.diff': 'Сравнить',
      'chg.revert': 'Откатить',
      'chg.revert.tip': 'Вернёт настройку как было. Перед этим покажем, что изменится, и спросим подтверждение.',
      'chg.auto': 'автоматически',
      'chg.history': 'История настроек',
      'chg.history.empty': 'Изменений пока не было.',
      'chg.was': 'было',
      'chg.now': 'стало',
      'notes.title': 'Заметки',
      'notes.tip': 'Как это настроено и почему, что важно помнить. Видно всем, кто смотрит схему. Пароли сюда не пишите — для них есть хранилище.',
      'notes.ph': 'Как настроено, что важно помнить…',
      'notes.saved': 'сохранено',
    },
    en: {
      'chg.before': 'What changed before this',
      'chg.before.tip': 'Changes in the 30 minutes before the problem started: updates, restarts, settings edits. Close timing is not proof, so we mark them "maybe related". Check them and roll back if needed.',
      'chg.maybe': 'maybe related',
      'chg.ago': '{n} min before the problem',
      'chg.none': 'Nothing changed in the 30 minutes before the problem. The cause looks external — for example, the provider.',
      'chg.diff': 'Compare',
      'chg.revert': 'Roll back',
      'chg.revert.tip': 'Puts the setting back as it was. You see what changes and confirm first.',
      'chg.auto': 'automatically',
      'chg.history': 'Settings history',
      'chg.history.empty': 'No changes yet.',
      'chg.was': 'before',
      'chg.now': 'after',
      'notes.title': 'Notes',
      'notes.tip': 'How it is set up and why, what to remember. Visible to everyone who views the map. Do not put passwords here — there is a vault for them.',
      'notes.ph': 'How it is set up, what to remember…',
      'notes.saved': 'saved',
    },
  });

  function m(hhmm) { var p = hhmm.split(':'); return +p[0] * 60 + +p[1]; }

  var CHANGES = [
    { time: '14:05', node: 'keenetic', who: 'auto', relates: ['cam', 'wifi-cam'],
      text: { ru: 'Keenetic сам сменил канал Wi-Fi 2.4 ГГц: 6 → 11', en: 'Keenetic switched the 2.4 GHz Wi-Fi channel by itself: 6 → 11' },
      diff: { file: 'Wi-Fi 2.4 GHz', before: ['channel: 6', 'width: 20 MHz', 'power: 100%'], after: ['channel: 11', 'width: 20 MHz', 'power: 100%'] } },
    { time: '13:35', node: 'worker', who: 'ops', relates: ['worker'],
      text: { ru: 'ffmpeg-worker: качество AV1 preset 8 → 6, задач одновременно 2 → 4', en: 'ffmpeg-worker: AV1 preset 8 → 6, parallel jobs 2 → 4' },
      diff: { file: 'docker-compose.yml', before: ['  worker:', '    image: gridman/worker:1.42', '    environment:', '      AV1_PRESET: 8', '      PARALLEL_JOBS: 2'], after: ['  worker:', '    image: gridman/worker:1.42', '    environment:', '      AV1_PRESET: 6', '      PARALLEL_JOBS: 4'] } },
    { time: '12:05', node: 'api', who: 'ops', relates: [],
      text: { ru: 'gridman-api обновлён 1.41 → 1.42', en: 'gridman-api updated 1.41 → 1.42' },
      diff: { file: 'docker-compose.yml', before: ['  api:', '    image: gridman/api:1.41'], after: ['  api:', '    image: gridman/api:1.42'] } },
    { time: '09:10', node: 'junk', who: 'auto', relates: ['lan-junk'],
      text: { ru: 'junk перезагрузился после обновления ядра', en: 'junk rebooted after a kernel update' } },
    { time: '00:41', node: 'calibur', who: 'ops', relates: [],
      text: { ru: 'calibur: подключён агент, включён вход только по ключу', en: 'calibur: agent connected, key-only login enabled' },
      diff: { file: '/etc/ssh/sshd_config.d/10-hardening.conf', before: ['PasswordAuthentication yes', 'PermitRootLogin prohibit-password'], after: ['PasswordAuthentication no', 'PermitRootLogin no'] } },
  ];
  A.CHANGES = CHANGES;

  // When each problem started (the same moments the history timeline uses).
  var STARTED = { cam: '14:18', 'wifi-cam': '14:18', worker: '13:40', 'up-city': '13:51', 'lan-junk': '09:12' };

  var NOTES = {
    calibur: { ru: 'Установлен 28.10.2026, Debian 13. BIOS: Legacy, пароль снят, Wake-on-LAN включён.\nАккумулятор мёртв — заказать AS16B5J / AS16B8J.\nПереедет в деревню, адрес там закрепить на роутере (MAC a8:1e:84:33:a7:56).', en: 'Installed 28.10.2026, Debian 13. BIOS: Legacy, password removed, Wake-on-LAN on.\nThe battery is dead — order AS16B5J / AS16B8J.\nMoves to the village; reserve its address on the router there (MAC a8:1e:84:33:a7:56).' },
    junk: { ru: 'HP t530, Home Assistant. Ключ SSH — hpt530.ppk.', en: 'HP t530, Home Assistant. SSH key — hpt530.ppk.' },
  };

  function before(target) {
    var start = STARTED[target];
    if (!start) return null;
    return CHANGES.filter(function (c) {
      var d = m(start) - m(c.time);
      return c.relates.indexOf(target) >= 0 && d >= 0 && d <= 30;
    });
  }

  function changeRow(c, withAgo, target) {
    var ago = withAgo ? '<span class="badge warn">' + t('chg.maybe') + '</span> <span class="faint">' + t('chg.ago').replace('{n}', m(STARTED[target]) - m(c.time)) + '</span>' : '';
    return '<div class="change"><div class="ch-top"><time class="mono">' + c.time + '</time><span class="grow">' + A.txt(c.text) + '</span></div>' +
      '<div class="ch-meta">' + (c.who === 'auto' ? t('chg.auto') : c.who) + (ago ? ' · ' + ago : '') + '</div>' +
      '<div class="ch-btns">' + (c.diff ? '<button class="btn btn-sm" data-diff="' + CHANGES.indexOf(c) + '">' + t('chg.diff') + '</button>' +
        '<button class="btn btn-sm btn-ghost" data-revert="' + CHANGES.indexOf(c) + '" data-tip="' + A.attr(t('chg.revert.tip')) + '">' + glIcon('restore') + t('chg.revert') + '</button>' : '') + '</div></div>';
  }

  function beforeSection(target) {
    var list = before(target);
    if (!list) return '';
    return '<div class="section"><h3 class="section-title">' + glIcon('history') + t('chg.before') + ' <span class="help" data-tip="' + A.attr(t('chg.before.tip')) + '">?</span></h3>' +
      (list.length ? list.map(function (c) { return changeRow(c, true, target); }).join('') : '<p class="muted" style="margin:0">' + t('chg.none') + '</p>') + '</div>';
  }

  // Nodes: what changed before the problem, notes, settings history.
  A.HOOKS.nodeInspector.unshift(function (id) { return beforeSection(id); });
  A.HOOKS.nodeInspector.push(function (id) {
    var n = A.NODES[id];
    if (!n || n.type === 'type.internet') return '';
    var hist = CHANGES.filter(function (c) { return c.node === id; });
    var note = NOTES[id] ? A.txt(NOTES[id]) : (NOTES[id + ':user'] || '');
    var html = '<div class="section"><h3 class="section-title">' + t('notes.title') + ' <span class="help" data-tip="' + A.attr(t('notes.tip')) + '">?</span><span class="grow"></span><span class="faint notes-saved"></span></h3>' +
      '<textarea class="input notes" data-notes="' + id + '" placeholder="' + A.attr(t('notes.ph')) + '">' + note + '</textarea></div>';
    if (hist.length || /server|vps|container|service/.test(n.type)) {
      html += '<div class="section"><h3 class="section-title">' + t('chg.history') + '</h3>' +
        (hist.length ? hist.map(function (c) { return changeRow(c, false); }).join('') : '<p class="faint" style="margin:0">' + t('chg.history.empty') + '</p>') + '</div>';
    }
    return html;
  });

  // Links: the same "what changed before" block.
  A.HOOKS.linkInspector.push(function (id) { return beforeSection(id); });

  // ---------- Diff dialog ----------
  function showDiff(c) {
    var d = document.getElementById('dlg-diff');
    var rows = [], max = Math.max(c.diff.before.length, c.diff.after.length);
    for (var i = 0; i < max; i++) {
      var a = c.diff.before[i], b = c.diff.after[i];
      if (a === b) rows.push('<div class="dl same">  ' + a + '</div>');
      else {
        if (a != null) rows.push('<div class="dl del">− ' + a + '</div>');
        if (b != null) rows.push('<div class="dl add">+ ' + b + '</div>');
      }
    }
    d.querySelector('.dialog').innerHTML = '<div class="dialog-head"><h2>' + A.txt(c.text) + '</h2><button class="icon-btn" data-close>' + glIcon('x') + '</button></div>' +
      '<div class="dialog-body"><p class="mono faint" style="margin:0 0 8px">' + c.diff.file + ' · ' + c.time + ' · ' + (c.who === 'auto' ? t('chg.auto') : c.who) + '</p>' +
      '<div class="diff">' + rows.join('') + '</div><p class="faint" style="font-size:var(--fs-12);margin:8px 0 0"><span class="dl del" style="display:inline">− ' + t('chg.was') + '</span> &nbsp; <span class="dl add" style="display:inline">+ ' + t('chg.now') + '</span></p></div>' +
      '<div class="dialog-foot"><button class="btn btn-ghost" data-close>' + t('dlg.done') + '</button><button class="btn" data-revert="' + CHANGES.indexOf(c) + '">' + glIcon('restore') + t('chg.revert') + '</button></div>';
    d.classList.add('open');
  }

  function revert(c) {
    A.confirm({
      title: t('chg.revert') + ': ' + A.txt(c.text), risk: 'careful', lead: t('chg.revert.tip'),
      steps: c.diff ? [c.diff.file + ': ' + c.diff.after.filter(function (x, i) { return x !== c.diff.before[i]; }).join(', ') + ' → ' + c.diff.before.filter(function (x, i) { return x !== c.diff.after[i]; }).join(', ')] : null,
      undo: t('confirm.undo'), go: t('chg.revert'),
    });
  }

  A.HOOKS.ready.push(function () {
    var s = document.createElement('div');
    s.className = 'scrim';
    s.id = 'dlg-diff';
    s.innerHTML = '<div class="dialog" role="dialog" aria-modal="true" style="width:min(640px,calc(100vw - 32px))"></div>';
    document.body.appendChild(s);
    s.addEventListener('click', function (e) {
      if (e.target === s || e.target.closest('[data-close]')) { s.classList.remove('open'); return; }
      var r = e.target.closest('[data-revert]');
      if (r) { s.classList.remove('open'); revert(CHANGES[+r.dataset.revert]); }
    });
    var insp = document.getElementById('inspector');
    insp.addEventListener('click', function (e) {
      var d = e.target.closest('[data-diff]');
      if (d) { showDiff(CHANGES[+d.dataset.diff]); return; }
      var r = e.target.closest('[data-revert]');
      if (r) revert(CHANGES[+r.dataset.revert]);
    });
    insp.addEventListener('input', function (e) {
      if (!e.target.dataset.notes) return;
      var id = e.target.dataset.notes;
      if (NOTES[id]) NOTES[id][GL.lang] = e.target.value; else NOTES[id + ':user'] = e.target.value;
      var s2 = insp.querySelector('.notes-saved');
      if (s2) { s2.textContent = t('notes.saved'); clearTimeout(s2._t); s2._t = setTimeout(function () { s2.textContent = ''; }, 1200); }
    });
  });
})();
