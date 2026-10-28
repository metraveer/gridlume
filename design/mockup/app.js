// Gridlume mockup core: demo data, one map with levels, pan/zoom, draggable nodes, inspector, dialogs.
// Feature files in features/ plug in through window.GLAPP (hooks + API at the bottom of this file).
// Not product code — it exists to agree on layout, behaviour and wording before development.

(function () {
  var t = GL.t;

  // Feature files register here (see GLAPP at the bottom).
  var HOOKS = { afterRender: [], afterEdges: [], nodeInspector: [], linkInspector: [], action: [], journal: [], tick: [], ready: [], view: [] };
  var state = { paused: false };

  // ---------- Demo data ----------
  var NODES = {
    internet: { icon: 'globe', name: 'Интернет', nameEn: 'Internet', type: 'type.internet', state: 'ok' },
    rt: { icon: 'router', name: 'Ростелеком', nameEn: 'Rostelecom', type: 'type.router', state: 'unknown', place: 'village' },
    calibur: { icon: 'laptop', name: 'calibur', type: 'type.server', sub: 'Acer E5-575G', state: 'ok', place: 'village' },
    max: { icon: 'server', name: 'max', type: 'type.server', state: 'planned', place: 'village' },
    keenetic: { icon: 'router', name: 'Keenetic', type: 'type.router', state: 'ok', place: 'city' },
    junk: { icon: 'server', name: 'junk', type: 'type.server', sub: 'HP t530', state: 'ok', place: 'city' },
    ha: { icon: 'home', name: 'Home Assistant', type: 'type.ha', state: 'ok', place: 'city', on: 'junk' },
    cam: { icon: 'camera', name: 'Камера · двор', nameEn: 'Yard camera', type: 'type.camera', sub: 'Wi-Fi', state: 'crit', place: 'city', offline: 6 },
    tw: { icon: 'cloud', name: 'gridman.example', type: 'type.vps', sub: 'Timeweb · 4 vCPU', state: 'ok', place: 'cloud', flags: [['warn', 'flag.balance']] },
    domain: { icon: 'domain', name: 'gridman.example', type: 'type.domain', state: 'ok', place: 'cloud', flags: [['', 'flag.domain']] },
    komodo: { icon: 'box', name: 'komodo-core', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    mongo: { icon: 'db', name: 'mongo', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    periphery: { icon: 'box', name: 'komodo-periphery', type: 'type.container', state: 'ok', place: 'village', on: 'calibur' },
    glcore: { icon: 'box', name: 'gridlume', type: 'type.container', state: 'planned', place: 'village', on: 'calibur' },
    web: { icon: 'app', name: 'gridman-web', type: 'type.service', state: 'ok', place: 'cloud', on: 'tw', flags: [['warn', 'flag.ssl']] },
    api: { icon: 'box', name: 'gridman-api', type: 'type.container', state: 'ok', place: 'cloud', on: 'tw' },
    pg: { icon: 'db', name: 'postgres', type: 'type.container', state: 'ok', place: 'cloud', on: 'tw' },
    worker: { icon: 'box', name: 'ffmpeg-worker', type: 'type.container', state: 'warn', place: 'cloud', on: 'tw' },
  };

  var VIEWS = {
    // Top level: places (coloured areas), machines, routers, internet. Machines with something inside get a "go inside" chip.
    root: {
      groups: [
        { cls: 'village', label: 'place.village', x: 40, y: 150, w: 440, h: 330, place: 'village' },
        { cls: 'city', label: 'place.city', x: 520, y: 150, w: 440, h: 330, place: 'city' },
        { cls: 'cloud', label: 'place.cloud', x: 1000, y: 150, w: 300, h: 330, place: 'cloud' },
      ],
      nodes: { internet: [626, 24], rt: [80, 204], calibur: [80, 380], max: [276, 292], keenetic: [576, 204], junk: [576, 380], cam: [756, 292], tw: [1056, 204], domain: [1056, 380] },
      edges: [
        ['internet', 'rt', 'uplink', '', 'up-village'], ['internet', 'keenetic', 'uplink', '', 'up-city'], ['internet', 'tw', 'uplink', '', 'up-cloud'],
        ['rt', 'calibur', 'lan', '', 'lan-calibur'], ['rt', 'max', 'lan planned', '', 'lan-max'], ['keenetic', 'junk', 'lan', '', 'lan-junk'],
        ['calibur', 'junk', 'vpn planned', '', 'vpn-cj'], ['domain', 'tw', 'dns', '', 'dns-root'], ['keenetic', 'cam', 'wifi', '', 'wifi-cam'],
      ],
    },
    // Inside a machine: its containers and services and how they depend on each other.
    // Nodes from outside (dashed "portals") show where the machine connects to the rest.
    'in-calibur': {
      machine: 'calibur',
      groups: [{ cls: 'machine', label: 'calibur', x: 40, y: 80, w: 520, h: 280 }],
      nodes: { komodo: [70, 130], mongo: [370, 130], periphery: [70, 270], glcore: [370, 270] },
      edges: [['komodo', 'mongo', 'depends', '', 'rq-komodo'], ['periphery', 'komodo', 'depends', '', 'ws-periph']],
    },
    'in-tw': {
      machine: 'tw',
      groups: [{ cls: 'machine', label: 'gridman.example', x: 40, y: 80, w: 520, h: 280 }],
      nodes: { domain: [70, -40], web: [70, 130], api: [370, 130], worker: [70, 270], pg: [370, 270] },
      edges: [
        ['domain', 'web', 'dns', '', 'dns-web'], ['web', 'api', 'depends', '', 'rq-web'], ['api', 'pg', 'depends', '', 'rq-api'],
        ['worker', 'pg', 'depends', '', 'rq-worker'], ['worker', 'api', 'depends', '', 'jobs-wa'],
      ],
    },
    'in-junk': {
      machine: 'junk',
      groups: [{ cls: 'machine', label: 'junk', x: 40, y: 80, w: 240, h: 150 }],
      nodes: { ha: [70, 130] },
      edges: [],
    },
  };

  // Which nodes live inside which machine (drives the "go inside" chip and breadcrumbs).
  var KIDS = {};
  Object.keys(NODES).forEach(function (id) { var on = NODES[id].on; if (on) (KIDS[on] = KIDS[on] || []).push(id); });
  function viewOf(id) {
    if (VIEWS.root.nodes[id]) return 'root';
    return NODES[id].on ? 'in-' + NODES[id].on : 'root';
  }

  var DETAILS = {
    calibur: {
      kv: [['insp.place', 'place.village'], ['insp.address', '192.168.1.20'], ['insp.os', 'Debian 13.7'], ['insp.hw', 'i3-6006U · 2C/4T · 6 GB'], ['insp.agent', 'v0.1 · online'], ['insp.uptime', '3d 4h']],
      metrics: [['insp.cpu', '6%', [4, 6, 5, 9, 22, 18, 7, 5, 6, 8, 5, 6]], ['insp.ram', '37%', [30, 31, 31, 33, 34, 34, 35, 35, 36, 36, 36, 37]], ['insp.disk', '9%', [8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 9, 9]], ['insp.temp', '41°', [38, 39, 41, 44, 47, 43, 41, 40, 40, 41, 41, 41]]],
      children: ['komodo', 'mongo', 'periphery'],
      actions: [['logs', 'act.logs', 'safe'], ['terminal', 'act.terminal', 'careful'], ['restart', 'act.reboot', 'danger']],
      secrets: true,
    },
    api: {
      kv: [['insp.runson', 'gridman.example'], ['insp.image', 'gridman/api:1.42'], ['insp.ports', '3000/tcp']],
      metrics: [['insp.cpu', '12%', [8, 10, 9, 14, 12, 11, 15, 13, 12, 12, 11, 12]], ['insp.ram', '410 MB', [380, 390, 395, 400, 402, 405, 406, 408, 409, 410, 410, 410]]],
      depends: ['pg'], usedBy: ['web', 'worker'],
      actions: [['logs', 'act.logs', 'safe'], ['restart', 'act.restart', 'careful'], ['stop', 'act.stop', 'danger'], ['move', 'act.move', 'danger']],
      secrets: true,
    },
    worker: {
      note: 'note.worker',
      kv: [['insp.runson', 'gridman.example'], ['insp.image', 'gridman/worker:1.42']],
      metrics: [['insp.cpu', '96%', [40, 55, 70, 88, 92, 95, 96, 97, 95, 96, 96, 96], 'warn'], ['insp.ram', '1.1 GB', [0.6, 0.7, 0.8, 0.9, 1, 1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1]]],
      depends: ['pg', 'api'],
      actions: [['logs', 'act.logs', 'safe'], ['restart', 'act.restart', 'careful'], ['move', 'act.move', 'danger']],
    },
    rt: {
      note: 'note.rt',
      kv: [['insp.place', 'place.village'], ['insp.address', '192.168.0.1'], ['insp.agent', 'insp.manual']],
      actions: [],
    },
    cam: {
      note: 'note.cam',
      kv: [['insp.place', 'place.city'], ['insp.address', '192.168.1.47'], ['insp.lastseen', 'insp.lastseen.v'], ['insp.agent', 'insp.manual']],
      actions: [['logs', 'act.logs', 'safe']],
    },
    tw: {
      kv: [['insp.place', 'place.cloud'], ['insp.address', '203.0.113.45'], ['insp.os', 'Ubuntu 24.04'], ['insp.hw', '4 vCPU · 8 GB · 80 GB NVMe'], ['insp.cost', 'insp.cost.v'], ['insp.balance', 'insp.balance.v']],
      metrics: [['insp.cpu', '34%', [20, 24, 30, 41, 38, 35, 33, 36, 34, 32, 35, 34]], ['insp.ram', '58%', [50, 52, 53, 55, 56, 57, 57, 58, 58, 58, 58, 58]], ['insp.disk', '30%', [29, 29, 29, 30, 30, 30, 30, 30, 30, 30, 30, 30]]],
      backups: { last: 'never', note: 'bk.tw.off' },
      actions: [['logs', 'act.logs', 'safe'], ['terminal', 'act.terminal', 'careful'], ['restart', 'act.reboot', 'danger']],
      secrets: true,
    },
    pg: {
      kv: [['insp.runson', 'gridman.example'], ['insp.image', 'postgres:16'], ['insp.ports', '5432/tcp']],
      metrics: [['insp.cpu', '4%', [3, 4, 5, 4, 6, 5, 4, 4, 3, 4, 4, 4]], ['insp.ram', '620 MB', [600, 605, 610, 612, 615, 618, 618, 620, 620, 620, 620, 620]]],
      usedBy: ['api', 'worker'],
      inside: {
        ports: [['5432/tcp', 'gridman-api, ffmpeg-worker']],
        volumes: [['pgdata', '/var/lib/postgresql/data', '2.1 GB']],
        env: [['POSTGRES_DB', 'gridman'], ['POSTGRES_USER', 'gridman'], ['POSTGRES_PASSWORD', null]],
        limits: '1 CPU · 1 GB',
        procs: [['postgres', '1.8%', '412 MB'], ['autovacuum', '0.3%', '24 MB'], ['walwriter', '0.1%', '8 MB']],
      },
      backups: { last: '03:00', size: '1.8 GB', verified: true, schedule: 'bk.nightly', keep: '14' },
      actions: [['logs', 'act.logs', 'safe'], ['restart', 'act.restart', 'careful'], ['restore', 'act.restore', 'danger']],
      secrets: true,
    },
  };
  DETAILS.calibur.backups = { last: 'yesterday 04:00', size: '6.2 GB', verified: false, schedule: 'bk.nightly', keep: '7' };
  DETAILS.api.inside = {
    ports: [['3000/tcp', 'gridman-web, ffmpeg-worker']],
    volumes: [['uploads', '/app/uploads', '38 GB']],
    env: [['NODE_ENV', 'production'], ['DATABASE_URL', null], ['S3_SECRET', null]],
    limits: '2 CPU · 2 GB',
    procs: [['node server.js', '11%', '398 MB']],
  };

  // Every link on the map (demo). Each one says what it is, how it is connected, why it exists and what breaks without it.
  // In the product: protocol/port are detected (Docker networks, listening ports, connections), the plain-language text
  // comes from templates for known software (PostgreSQL, nginx, …) and can be edited by the owner.
  // Speeds in Mbit/s; "rate" = requests per second between services.
  // should: contract or port speed; port: negotiated port speed; down/up: traffic now; avail: last measured real capacity.
  var LINKS = {
    'up-village': { kind: 'link.kind.uplink', proto: 'Ethernet · PPPoE', should: 700, shouldSrc: 'link.contract', port: 1000, down: 312, up: 48, avail: 641, availAt: '03:10', lat: 6, loss: 0, state: 'ok',
      events: [['03:10', 'ok', 'ev.measure'], ['yesterday', 'ok', 'ev.stable']],
      about: { ru: 'Интернет в деревню от Ростелекома. Через этот канал всё, что стоит в деревне, ходит в интернет, а посетители — на сайты, которые там работают.', en: 'Internet to the village from Rostelecom. Everything in the village reaches the internet through it, and visitors reach the sites hosted there.' },
      broken: { ru: 'Всё в деревне останется без интернета: сайты оттуда перестанут открываться, VPN до дома пропадёт. Внутри деревни всё продолжит работать.', en: 'Everything in the village loses the internet: sites hosted there stop opening, the VPN to home drops. Inside the village everything keeps working.' } },
    'up-city': { kind: 'link.kind.uplink', proto: 'Ethernet · IPoE', should: 100, shouldSrc: 'link.contract', port: 1000, down: 41, up: 6, avail: 88, availAt: '03:15', lat: 38, loss: 3.2, state: 'warn',
      events: [['14:02', 'warn', 'ev.loss'], ['13:51', 'warn', 'ev.latency'], ['03:15', 'ok', 'ev.measure']], meaning: 'mean.loss',
      about: { ru: 'Домашний интернет в Липецке. Через него домашний сервер и Home Assistant выходят в интернет.', en: 'Home internet in Lipetsk. The home server and Home Assistant reach the internet through it.' },
      broken: { ru: 'Дом останется без интернета: Home Assistant не будет доступен снаружи, уведомления из дома не придут.', en: 'Home loses the internet: Home Assistant is unreachable from outside and home notifications stop.' } },
    'up-cloud': { kind: 'link.kind.uplink', proto: 'Timeweb Cloud', should: 1000, shouldSrc: 'link.provider', port: 1000, down: 18, up: 74, avail: null, lat: 12, loss: 0, state: 'ok', events: [],
      about: { ru: 'Канал облачного сервера Timeweb в интернет. По нему посетители открывают gridman.example, а сервер отдаёт видео.', en: 'The Timeweb cloud server\'s internet channel. Visitors open gridman.example over it and the server sends video.' },
      broken: { ru: 'gridman.example перестанет открываться для всех.', en: 'gridman.example stops opening for everyone.' } },
    'lan-calibur': { kind: 'link.kind.lan', proto: 'Ethernet · Cat5e', should: 1000, shouldSrc: 'link.port', port: 1000, down: 22, up: 9, avail: 940, availAt: '03:20', lat: 0.4, loss: 0, state: 'ok', events: [],
      about: { ru: 'Кабель от роутера к ноутбуку calibur. Через него calibur получает интернет и связь с остальными устройствами в деревне.', en: 'Cable from the router to the calibur laptop. Through it calibur gets the internet and reaches other devices in the village.' },
      broken: { ru: 'calibur и всё, что на нём работает (Komodo и другие контейнеры), станет недоступно. Wi-Fi можно настроить запасным путём.', en: 'calibur and everything running on it (Komodo and other containers) becomes unreachable. Wi-Fi can be set up as a backup path.' } },
    'lan-junk': { kind: 'link.kind.lan', proto: 'Ethernet', should: 1000, shouldSrc: 'link.port', port: 100, down: 3, up: 1, avail: 94, availAt: '03:25', lat: 0.6, loss: 0, state: 'warn',
      events: [['09:12', 'warn', 'ev.port100']], meaning: 'mean.port100',
      about: { ru: 'Кабель от домашнего роутера Keenetic к серверу junk (HP t530) с Home Assistant.', en: 'Cable from the home Keenetic router to the junk server (HP t530) running Home Assistant.' },
      broken: { ru: 'Home Assistant станет недоступен, умный дом перестанет управляться удалённо.', en: 'Home Assistant becomes unreachable; the smart home can no longer be controlled remotely.' } },
    'wifi-cam': { kind: 'link.kind.wifi', proto: 'Wi-Fi 2.4 GHz', state: 'crit',
      events: [['14:20', 'crit', 'ev.camoff'], ['14:18', 'warn', 'ev.camweak']], meaning: 'mean.camoff',
      about: { ru: 'Камера во дворе подключена к домашнему роутеру по Wi-Fi и отправляет видео на сервер junk.', en: 'The yard camera is connected to the home router over Wi-Fi and sends video to the junk server.' },
      broken: { ru: 'Видео со двора не пишется и не смотрится, уведомления о движении не приходят.', en: 'Yard video is not recorded or viewable, motion alerts stop.' } },
    'lan-max': { kind: 'link.kind.lan', proto: 'Ethernet', state: 'planned', short: 'plan',
      about: { ru: 'Запланировано: будущий мини-ПК max подключится к роутеру кабелем.', en: 'Planned: the future max mini PC will be connected to the router by cable.' } },
    'vpn-cj': { kind: 'link.kind.vpn', proto: 'AmneziaWG · UDP', state: 'planned', short: 'VPN',
      about: { ru: 'Запланировано: защищённый туннель между деревней и домом. Машины будут видеть друг друга как в одной сети, а вы — заходить ко всему из любого города.', en: 'Planned: an encrypted tunnel between the village and home. Machines will see each other as one network, and you can reach everything from any city.' },
      broken: { ru: 'Пропадёт доступ к машинам «изнутри» из другого места; сами сервисы продолжат работать.', en: 'Remote "inside" access to the machines is lost; the services themselves keep running.' } },
    'dns-root': { kind: 'link.kind.dns', proto: 'DNS · A 203.0.113.45', short: 'DNS',
      about: { ru: 'Домен gridman.example указывает на IP-адрес сервера в Timeweb. Когда человек вводит адрес в браузере, DNS подсказывает, к какому серверу идти.', en: 'The gridman.example domain points to the IP of the Timeweb server. When someone types the address, DNS tells the browser which server to go to.' },
      broken: { ru: 'Если запись удалить или она будет указывать не туда, сайт по адресу gridman.example перестанет открываться, хотя сервер будет работать.', en: 'If the record is removed or points elsewhere, gridman.example stops opening even though the server keeps running.' } },
    'dns-web': { kind: 'link.kind.dns', proto: 'HTTPS · 443/tcp', short: 'HTTPS',
      about: { ru: 'Посетители набирают gridman.example и попадают на сайт: домен ведёт на этот сервер, а веб-сервер gridman-web принимает их по HTTPS на порту 443.', en: 'Visitors type gridman.example and land on the site: the domain leads to this server and gridman-web accepts them over HTTPS on port 443.' },
      broken: { ru: 'Сайт перестанет открываться у всех посетителей.', en: 'The site stops opening for all visitors.' } },
    'rq-web': { kind: 'link.kind.http', proto: 'HTTP · 3000/tcp', rate: 42,
      about: { ru: 'Сайт gridman-web просит у API данные: проекты, шоты, версии, пользователей. Каждое открытие страницы — несколько запросов.', en: 'The gridman-web site asks the API for data: projects, shots, versions, users. Every page view is a few requests.' },
      broken: { ru: 'Сайт откроется, но будет пустым или покажет ошибку: данных взять неоткуда.', en: 'The site opens but is empty or shows an error: there is nowhere to get data from.' } },
    'rq-api': { kind: 'link.kind.db', proto: 'PostgreSQL · 5432/tcp', rate: 118,
      about: { ru: 'API читает и записывает всё в базу данных PostgreSQL: проекты, комментарии, пользователей, задания.', en: 'The API reads and writes everything in the PostgreSQL database: projects, comments, users, jobs.' },
      broken: { ru: 'Перестанет работать почти всё: вход, загрузка, просмотр. Данные не потеряются — они в базе.', en: 'Almost everything stops: login, uploads, viewing. No data is lost — it is in the database.' } },
    'rq-worker': { kind: 'link.kind.queue', proto: 'PostgreSQL · 5432/tcp', rate: 9,
      about: { ru: 'Воркер берёт из базы задания на кодирование видео (очередь) и записывает, что готово.', en: 'The worker takes video encoding jobs from the database (the queue) and records what is done.' },
      broken: { ru: 'Новые видео перестанут обрабатываться: загрузки будут висеть в очереди. Уже готовые видео продолжат показываться.', en: 'New videos stop being processed: uploads wait in the queue. Finished videos keep playing.' } },
    'jobs-wa': { kind: 'link.kind.http', proto: 'HTTP · 3000/tcp', rate: 2,
      about: { ru: 'Воркер сообщает API о ходе кодирования: прогресс, «готово», «ошибка». Поэтому на сайте видна полоска обработки.', en: 'The worker reports encoding progress to the API: progress, "done", "failed". That is why the site shows a processing bar.' },
      broken: { ru: 'Видео будут кодироваться, но на сайте прогресс зависнет, пока связь не вернётся.', en: 'Videos still get encoded, but progress on the site freezes until the link is back.' } },
    'rq-komodo': { kind: 'link.kind.db', proto: 'MongoDB · 27017/tcp', rate: 3,
      about: { ru: 'Панель Komodo хранит настройки, пользователей и историю действий в базе MongoDB.', en: 'The Komodo panel keeps its settings, users and action history in the MongoDB database.' },
      broken: { ru: 'Панель Komodo перестанет открываться; контейнеры на машинах продолжат работать.', en: 'The Komodo panel stops opening; containers on the machines keep running.' } },
    'ws-periph': { kind: 'link.kind.ws', proto: 'WebSocket · 9120/tcp', rate: 1,
      about: { ru: 'Агент Komodo на машине держит постоянное соединение с панелью: присылает нагрузку и логи, получает команды (запустить, остановить).', en: 'The Komodo agent keeps a permanent connection to the panel: sends load and logs, receives commands (start, stop).' },
      broken: { ru: 'В панели машина станет серой, управлять её контейнерами будет нельзя. Сами контейнеры продолжат работать.', en: 'The machine turns grey in the panel and its containers cannot be managed. The containers keep running.' } },
  };

  function txt(o) { return o ? (o[GL.lang] || o.ru) : ''; }
  function attr(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }

  // ---------- State ----------
  var view = 'root';
  var selected = 'calibur';
  var selectedLink = null; // [linkId, fromNode, toNode]
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
    var items = [['map', 'rail.map', 'map'], ['list', 'rail.nodes', 'nodes'], ['clock', 'rail.journal', 'journal'], ['key', 'rail.vault', 'vault'], ['bell', 'rail.alerts', 'rules']];
    var page = state.page || 'map';
    $('rail').innerHTML = items.map(function (i) {
      return '<button class="icon-btn" data-page="' + i[2] + '" aria-pressed="' + (page === i[2] ? 'true' : 'false') + '" data-i18n-tip="' + i[1] + '" data-i18n-label="' + i[1] + '">' + glIcon(i[0]) + '</button>';
    }).join('') + '<button class="icon-btn bottom" data-page="settings" aria-pressed="' + (page === 'settings' ? 'true' : 'false') + '" data-i18n-tip="rail.settings" data-i18n-label="rail.settings">' + glIcon('gear') + '</button>';
    GL.apply($('rail'));
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
      return '<div class="group ' + g.cls + '"' + (g.place ? ' data-place="' + g.place + '"' : '') + ' style="left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px;height:' + g.h + 'px">' +
        '<span class="group-label">' + (g.place ? '<button class="collapse" data-collapse="' + g.place + '">' + glIcon('chevron') + '</button>' : '') + label + '</span>' + sum + '</div>';
    }).join('');
  }

  function renderNodes() {
    var html = '';
    Object.keys(pos[view]).forEach(function (id) {
      var n = NODES[id], p = pos[view][id], sz = nodeSize(id);
      var sub = (n.sub ? n.sub + ' · ' : '') + t(n.type);
      if (n.state === 'planned') sub = t('state.planned');
      if (n.offline) sub = t('node.offline').replace('{n}', n.offline);
      var machine = VIEWS[view].machine;
      var portal = machine && n.on !== machine;
      var chip = view === 'root' && KIDS[id] ? '<span class="kids" data-enter="' + id + '">' + KIDS[id].length + ' ›</span>' : '';
      var tip = nodeName(n) + ' · ' + t('state.' + n.state) + (chip ? '<br>' + t('node.enter.tip') : '') + (portal ? '<br>' + t('node.portal.tip') : '');
      // Deadlines that must not be missed (certificate, domain, balance) hang under the node as small tags.
      var flags = n.flags ? '<span class="flags">' + n.flags.map(function (f) { return '<span class="flag ' + f[0] + '">' + t(f[1]) + '</span>'; }).join('') + '</span>' : '';
      html += '<div class="node' + (sz[0] < 188 ? ' small' : '') + (n.state === 'planned' ? ' planned' : '') + (n.offline ? ' offline' : '') + (portal ? ' portal' : '') + (id === selected ? ' selected' : '') +
        '" data-id="' + id + '" style="left:' + p[0] + 'px;top:' + p[1] + 'px" data-tip="' + attr(tip) + '">' +
        '<span class="glyph">' + glIcon(n.icon) + '</span><span class="label"><span class="name">' + nodeName(n) + '</span><span class="sub">' + sub + '</span></span>' +
        chip + '<span class="state"><span class="dot ' + stateClass(n.state) + '"></span></span>' + flags + '</div>';
    });
    $('nodes').innerHTML = html;
  }

  function center(id) {
    var p = pos[view][id], s = nodeSize(id);
    return [p[0] + s[0] / 2, p[1] + s[1] / 2, s];
  }

  function fmtSpeed(mbit) {
    if (mbit == null) return '—';
    if (mbit >= 1000) return (mbit / 1000).toFixed(mbit % 1000 ? 1 : 0) + ' ' + t('unit.gbit');
    return Math.round(mbit) + ' ' + t('unit.mbit');
  }

  // Cubic bezier between two node centres, leaving from the node edge; returns path and its midpoint.
  function curve(e) {
    var a = center(e[0]), b = center(e[1]);
    var dx = b[0] - a[0], dy = b[1] - a[1], p;
    if (Math.abs(dy) >= Math.abs(dx)) {
      var y1 = a[1] + Math.sign(dy) * a[2][1] / 2, y2 = b[1] - Math.sign(dy) * b[2][1] / 2, my = (y1 + y2) / 2;
      p = [a[0], y1, a[0], my, b[0], my, b[0], y2];
    } else {
      var x1 = a[0] + Math.sign(dx) * a[2][0] / 2, x2 = b[0] - Math.sign(dx) * b[2][0] / 2, mx = (x1 + x2) / 2;
      p = [x1, a[1], mx, a[1], mx, b[1], x2, b[1]];
    }
    var mid = [(p[0] + 3 * p[2] + 3 * p[4] + p[6]) / 8, (p[1] + 3 * p[3] + 3 * p[5] + p[7]) / 8];
    return { d: 'M' + p[0] + ' ' + p[1] + ' C' + p[2] + ' ' + p[3] + ' ' + p[4] + ' ' + p[5] + ' ' + p[6] + ' ' + p[7], mid: mid };
  }

  function hasSpeed(L) { return L.should != null && L.down != null; }
  function protoShort(L) { return (L.proto || '').split(' · ')[0]; }

  // Text on the line itself: protocol + numbers, so a line is never just an arrow.
  function linkSummary(L) {
    if (L.state === 'crit' && !hasSpeed(L) && L.rate == null) return t('link.down');
    if (L.state === 'planned') return (L.short && L.short !== 'plan' ? L.short + ' · ' : '') + t('link.planned');
    if (L.rate != null) return protoShort(L) + ' · ' + L.rate + ' ' + t('unit.rps');
    if (hasSpeed(L)) return Math.round(Math.max(L.down, L.up)) + ' / ' + fmtSpeed(Math.min(L.should, L.port));
    return L.short || protoShort(L);
  }

  // Hover: what it is and why, in one glance.
  function linkTip(L) {
    var s = '<b>' + t(L.kind) + '</b> · <span class="mono">' + (L.proto || '') + '</span><br>' + txt(L.about);
    if (L.rate != null) s += '<br><span class="faint">' + t('link.now') + ': ' + L.rate + ' ' + t('unit.rps') + '</span>';
    if (hasSpeed(L)) s += '<br><span class="faint">' + t('link.now') + ': ↓ ' + fmtSpeed(L.down) + ' ↑ ' + fmtSpeed(L.up) + ' · ' + t('link.should') + ' ' + fmtSpeed(L.should) +
      ' · ' + t('link.latency') + ' ' + L.lat + ' ms · ' + t('link.loss') + ' ' + L.loss + '%</span>';
    return s + '<br><span class="faint">' + t('link.click') + '</span>';
  }

  function renderEdges() {
    var out = '', pills = '';
    VIEWS[view].edges.forEach(function (e, i) {
      var c = curve(e), L = LINKS[e[4]];
      var st = L && L.state && L.state !== 'ok' ? ' s-' + L.state : '';
      var hot = (e[0] === selected || e[1] === selected || (selectedLink && selectedLink[0] === e[4] && e[4])) ? ' hot' : '';
      // Arrow shows who talks to whom: the caller at the start, the one being called at the end.
      var arrow = L && /http|db|queue|ws|dns/.test(L.kind) ? ' marker-end="url(#arrow)"' : '';
      var ends = ' data-a="' + e[0] + '" data-b="' + e[1] + '"' + (e[4] ? ' data-lid="' + e[4] + '"' : '');
      out += '<path class="edge ' + e[2] + (L && L.state === 'planned' ? '' : st) + hot + '"' + ends + ' d="' + c.d + '"' + arrow + '/>';
      if (L) {
        // Load decides how fast and dense the dots run: 0% → barely moving, 100% → fast.
        var moving = L.state !== 'planned' && (L.rate != null || hasSpeed(L));
        var load = L.rate != null ? Math.min(1, L.rate / 150) : hasSpeed(L) ? Math.max(L.down, L.up) / Math.min(L.should, L.port) : 0;
        var dur = (3.2 - Math.min(1, load) * 2.6).toFixed(2);
        var rev = L.rate == null && L.up > L.down ? ' rev' : '';
        if (moving) out += '<path class="flow' + st + rev + '"' + ends + ' d="' + c.d + '" style="animation-duration:' + dur + 's"/>';
        var text = (L.state === 'warn' || L.state === 'crit' ? '! ' : '') + linkSummary(L);
        var w = text.length * 6.1 + 14;
        pills += '<g class="edge-pill' + st + '"' + ends + ' data-link="' + e[4] + '" data-from="' + e[0] + '" data-to="' + e[1] + '" data-tip="' + attr(linkTip(L)) + '" transform="translate(' + (c.mid[0] - w / 2).toFixed(1) + ',' + (c.mid[1] - 9).toFixed(1) + ')">' +
          '<rect width="' + w.toFixed(1) + '" height="18" rx="9"/><text x="7" y="12.5" data-pill="' + e[4] + '">' + text + '</text></g>';
        out += '<path class="edge-hit" d="' + c.d + '" data-link="' + e[4] + '" data-from="' + e[0] + '" data-to="' + e[1] + '" data-tip="' + attr(linkTip(L)) + '"/>';
      } else if (e[3]) {
        out += '<text class="edge-label" x="' + (c.mid[0] + 6) + '" y="' + (c.mid[1] - 6) + '">' + e[3] + '</text>';
      }
    });
    var defs = '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">' +
      '<path d="M1 1 L9 5 L1 9" fill="none" stroke="#8a93a0" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>';
    $('edges').innerHTML = defs + out + pills;
    HOOKS.afterEdges.forEach(function (fn) { fn(); });
  }

  function applyTransform() {
    world.style.transform = 'translate(' + panX + 'px,' + panY + 'px) scale(' + zoom + ')';
    world.classList.toggle('far', zoom < 0.7); // hide speed labels when zoomed out; colour and motion stay
    HOOKS.view.forEach(function (fn) { fn(); });
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

  // Last hour of download speed per link, one point per minute (demo history).
  Object.keys(LINKS).forEach(function (id) {
    var L = LINKS[id], base = L.rate != null ? L.rate : L.down;
    L.hist = [];
    for (var i = 0; i < 60; i++) L.hist.push(Math.max(0, base * (0.55 + 0.45 * Math.sin(i / 7) + Math.random() * 0.35)));
  });

  function chart(L) {
    var cap = L.rate != null ? Math.max.apply(null, L.hist) * 1.2 : Math.min(L.should, L.port);
    var max = Math.max(cap, Math.max.apply(null, L.hist));
    var pts = L.hist.map(function (v, i) { return (i * 320 / 59).toFixed(1) + ',' + (54 - v / max * 50).toFixed(1); });
    var capY = (54 - cap / max * 50).toFixed(1);
    return '<svg class="chart" viewBox="0 0 320 56" preserveAspectRatio="none">' +
      '<path class="area" d="M0,56 L' + pts.join(' L') + ' L320,56 Z"/><path class="line" d="M' + pts.join(' L') + '"/>' +
      (L.rate == null ? '<line class="cap" x1="0" x2="320" y1="' + capY + '" y2="' + capY + '"/>' : '') + '</svg>';
  }

  function capRow(label, value, hint, pct, cls) {
    return '<div class="cap-row"><span>' + label + '</span><span class="v" data-live>' + value + '</span>' +
      (pct != null ? '<div class="bar ' + (cls || '') + '"><i style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></div>' : '') +
      (hint ? '<span class="hint">' + hint + '</span>' : '') + '</div>';
  }

  function renderLinkInspector(el) {
    var id = selectedLink[0], L = LINKS[id], a = NODES[selectedLink[1]], b = NODES[selectedLink[2]];
    var st = L.state || 'ok';
    var html = '<div class="insp-head"><span class="glyph">' + glIcon('link') + '</span><div class="insp-title"><h1 style="font-size:var(--fs-15)">' +
      nodeName(a) + ' ↔ ' + nodeName(b) + '</h1><span class="sub">' + t(L.kind) + '</span></div><button class="icon-btn" id="insp-close" data-i18n-tip="insp.close">' + glIcon('x') + '</button></div>';
    html += '<div class="insp-state"><span class="badge ' + st + '"><span class="dot ' + st + '"></span>' + t('state.' + st) + '</span></div>';

    if (L.meaning) html += '<div class="section"><div class="note">' + t(L.meaning) + '</div></div>';

    // What it is and why — always first, in plain words.
    html += '<div class="section"><h3 class="section-title">' + t('link.about') + '</h3><p style="margin:0">' + txt(L.about) + '</p></div>';
    html += '<div class="section"><h3 class="section-title">' + t('link.how') + '</h3><dl class="kv">' +
      '<dt>' + t('link.type') + '</dt><dd>' + t(L.kind) + '</dd>' +
      '<dt>' + t('link.proto') + '</dt><dd class="mono">' + (L.proto || '—') + '</dd>' +
      '<dt>' + t('link.dir') + '</dt><dd>' + nodeName(a) + ' → ' + nodeName(b) + '</dd></dl></div>';

    if (L.rate != null) {
      html += '<div class="section"><h3 class="section-title">' + t('link.requests') + '</h3>' + capRow(t('link.now'), L.rate + ' ' + t('unit.rps')) + chart(L) + '</div>';
    } else if (hasSpeed(L)) {
      var cap = Math.min(L.should, L.port);
      html += '<div class="section"><h3 class="section-title">' + t('link.speed') + ' <span class="help" data-tip="' + t('link.speed.tip') + '">?</span></h3>' +
        capRow(t('link.should'), fmtSpeed(L.should), t(L.shouldSrc) + ' · ' + t('link.port') + ' ' + fmtSpeed(L.port), null) +
        capRow(t('link.now'), '↓ ' + fmtSpeed(L.down) + '  ↑ ' + fmtSpeed(L.up), Math.round(Math.max(L.down, L.up) / cap * 100) + '% ' + t('link.ofcap'), Math.max(L.down, L.up) / cap * 100, 'lume') +
        capRow(t('link.avail'), fmtSpeed(L.avail), L.avail != null ? t('link.measuredAt') + ' ' + L.availAt : t('link.notmeasured'), L.avail != null ? L.avail / L.should * 100 : null, L.avail != null && L.avail < L.should * 0.8 ? 'warn' : '') +
        '<button class="action" data-tip="' + t('link.measure.tip') + '">' + glIcon('restart') + '<span class="grow">' + t('link.measure') + '</span><span class="risk careful">' + t('risk.careful') + '</span></button>' +
        '</div>';
      html += '<div class="section"><h3 class="section-title">' + t('link.hour') + '</h3>' + chart(L) + '</div>';
      html += '<div class="section"><h3 class="section-title">' + t('link.quality') + '</h3><dl class="kv">' +
        '<dt>' + t('link.latency') + '</dt><dd class="mono"' + (L.lat > 30 ? ' style="color:var(--warn)"' : '') + '>' + L.lat + ' ms</dd>' +
        '<dt>' + t('link.loss') + '</dt><dd class="mono"' + (L.loss > 1 ? ' style="color:var(--warn)"' : '') + '>' + L.loss + '%</dd></dl></div>';
    }

    if (L.broken) html += '<div class="section"><h3 class="section-title">' + t('link.broken') + '</h3><p style="margin:0" class="muted">' + txt(L.broken) + '</p></div>';
    HOOKS.linkInspector.forEach(function (fn) { html += fn(id, L) || ''; });

    if (L.events && L.events.length) {
      html += '<div class="section"><h3 class="section-title">' + t('link.events') + '</h3>' + L.events.map(function (ev) {
        return '<div class="event"><time>' + (ev[0] === 'yesterday' ? t('time.yesterday') : ev[0]) + '</time><span class="dot ' + ev[1] + '"></span><span>' + t(ev[2]) + '</span></div>';
      }).join('') + '</div>';
    }
    html += '<div class="section"><button class="btn btn-sm btn-ghost" data-tip="' + t('link.edit.tip') + '">' + t('link.edit') + '</button></div>';
    el.innerHTML = html;
    GL.apply(el);
  }

  function renderInspector() {
    var el = $('inspector');
    if (selectedLink) { renderLinkInspector(el); return; }
    if (!selected) { el.innerHTML = '<div class="insp-empty" data-i18n="insp.empty"></div>'; GL.apply(el); return; }
    var n = NODES[selected], d = DETAILS[selected] || {};
    var html = '<div class="insp-head"><span class="glyph">' + glIcon(n.icon) + '</span><div class="insp-title"><h1>' + nodeName(n) + '</h1>' +
      '<span class="sub">' + (n.sub ? n.sub + ' · ' : '') + t(n.type) + '</span></div><button class="icon-btn" id="insp-close" data-i18n-tip="insp.close">' + glIcon('x') + '</button></div>';
    html += '<div class="insp-state"><span class="badge ' + (n.state === 'unknown' || n.state === 'planned' ? '' : n.state) + '"><span class="dot ' + n.state + '"></span>' + t('state.' + n.state) + '</span>' +
      (n.place ? '<span class="badge">' + t('place.' + n.place) + '</span>' : '') + '</div>';

    if (KIDS[selected] && view === 'root') {
      html += '<div class="section"><button class="btn btn-primary" style="width:100%;justify-content:center" data-enter="' + selected + '">' +
        t('insp.enter') + ' · ' + KIDS[selected].length + '</button></div>';
    }

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

    var children = d.children || KIDS[selected];
    if (children) html += '<div class="section"><h3 class="section-title">' + t('insp.containers') + ' <span class="faint">' + children.length + '</span></h3>' + children.map(function (c) { return linkRow(c); }).join('') + '</div>';
    if (d.depends) html += '<div class="section"><h3 class="section-title">' + t('insp.dependson') + '</h3>' + d.depends.map(function (c) { return linkRow(c); }).join('') + '</div>';
    if (d.usedBy) html += '<div class="section"><h3 class="section-title">' + t('insp.usedby') + '</h3>' + d.usedBy.map(function (c) { return linkRow(c); }).join('') + '</div>';

    if (!children && !d.depends && !d.usedBy) {
      var links = [];
      Object.keys(VIEWS).forEach(function (v) { VIEWS[v].edges.forEach(function (e) {
        var other = e[0] === selected ? e[1] : e[1] === selected ? e[0] : null;
        if (other && links.indexOf(other) < 0) links.push(other);
      }); });
      if (n.on) links.unshift(n.on);
      if (links.length) html += '<div class="section"><h3 class="section-title">' + t('insp.links') + '</h3>' + links.map(function (c) { return linkRow(c); }).join('') + '</div>';
    }

    HOOKS.nodeInspector.forEach(function (fn) { html += fn(selected, d, n) || ''; });

    if (d.secrets) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.secrets') + ' <span class="help" data-tip="' + t('insp.vault.tip') + '">?</span></h3>' +
        '<div class="vault">' + glIcon('lock') + '<span class="grow">' + t('insp.vault.locked') + '</span><button class="btn btn-sm">' + t('insp.vault.unlock') + '</button></div></div>';
    }

    if (d.actions && d.actions.length) {
      html += '<div class="section"><h3 class="section-title">' + t('insp.actions') + '</h3>' + d.actions.map(function (a) {
        return '<button class="action" data-act="' + a[0] + '" data-label="' + a[1] + '" data-risk="' + a[2] + '" data-tip="' + attr(t(a[1] + '.tip')) + '">' + glIcon(a[0]) +
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
    renderCrumbs();
    $('app').classList.toggle('no-inspector', !selected && !selectedLink);
    HOOKS.afterRender.forEach(function (fn) { fn(); });
  }

  function renderCrumbs() {
    var html = '<button data-crumb="root"' + (view === 'root' ? ' aria-current="page"' : '') + '>' + t('crumb.root') + '</button>';
    var m = VIEWS[view].machine;
    if (m) {
      var n = NODES[m];
      if (n.place) html += '<span class="sep">/</span><button data-crumb="root" data-place="' + n.place + '">' + t('place.' + n.place) + '</button>';
      html += '<span class="sep">/</span><button aria-current="page">' + nodeName(n) + '</button>';
    }
    $('crumbs').innerHTML = html;
  }

  function go(v, select) {
    view = v;
    if (select !== undefined) { selected = select; selectedLink = null; }
    render();
    fit();
    world.classList.remove('enter');
    void world.offsetWidth; // restart the entry animation
    world.classList.add('enter');
  }

  function enter(id) { if (KIDS[id]) go('in-' + id, id); }

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
    if (e.target.closest('.canvas-tools, .zoom, .legend, .float-card, .drawer, .minimap, .timeline, .overlay')) return;
    var enterEl = e.target.closest('[data-enter]');
    if (enterEl) { enter(enterEl.dataset.enter); return; }
    var linkEl = e.target.closest('[data-link]');
    if (linkEl) {
      selectedLink = [linkEl.dataset.link, linkEl.dataset.from, linkEl.dataset.to];
      selected = null;
      render();
      return;
    }
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
    if (drag.type === 'node' && !drag.moved) { selected = drag.id; selectedLink = null; render(); }
    if (drag.type === 'node' && drag.moved) drag.el.classList.remove('dragging');
    if (drag.type === 'pan' && Math.abs(panX - drag.ox) + Math.abs(panY - drag.oy) < 3) { selected = null; selectedLink = null; render(); }
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

  // Double-click a machine to go inside; double-click a dashed outside node to go back to where it lives.
  canvas.addEventListener('dblclick', function (e) {
    var nodeEl = e.target.closest('.node');
    if (!nodeEl) return;
    var id = nodeEl.dataset.id;
    if (KIDS[id] && view === 'root') enter(id);
    else if (nodeEl.classList.contains('portal')) go(viewOf(id), id);
  });

  $('crumbs').addEventListener('click', function (e) {
    var b = e.target.closest('[data-crumb]');
    if (b && view !== 'root') go('root', VIEWS[view].machine);
  });

  $('inspector').addEventListener('click', function (e) {
    if (e.target.closest('#insp-close')) { selected = null; selectedLink = null; render(); return; }
    var enterBtn = e.target.closest('[data-enter]');
    if (enterBtn) { enter(enterBtn.dataset.enter); return; }
    var gotoEl = e.target.closest('[data-goto]');
    if (gotoEl) {
      var id = gotoEl.dataset.goto;
      if (!pos[view][id]) { go(viewOf(id), id); return; } // the node lives on another level: travel there
      selected = id; selectedLink = null; render(); return;
    }
    var act = e.target.closest('[data-act]');
    if (act) runAction(selected, act.dataset.act, act.dataset.label, act.dataset.risk);
  });

  // Every action goes through here: safe ones run at once, others explain themselves and ask first.
  function runAction(id, act, label, risk) {
    for (var i = 0; i < HOOKS.action.length; i++) if (HOOKS.action[i](id, act)) return; // e.g. logs/terminal open the drawer
    if (act === 'move') { openDialog('dlg-move'); return; }
    var name = NODES[id] ? nodeName(NODES[id]) : id;
    confirmAction({
      title: t(label) + ' · ' + name,
      risk: risk || 'careful',
      lead: t(label + '.tip'),
      warn: risk === 'danger' ? t('confirm.danger.warn') : '',
      undo: t('confirm.undo'),
      name: risk === 'danger' ? name : null,
      go: t(label),
    });
  }

  // Generic confirmation: what happens, risk, optional "type the name", then a journal entry.
  function confirmAction(o) {
    var d = $('dlg-confirm');
    d.querySelector('.dialog').innerHTML =
      '<div class="dialog-head"><span class="risk ' + o.risk + '">' + t('risk.' + o.risk) + '</span><h2>' + o.title + '</h2><button class="icon-btn" data-close>' + glIcon('x') + '</button></div>' +
      '<div class="dialog-body"><p style="margin:0">' + o.lead + '</p>' +
      (o.steps ? '<ol class="steps">' + o.steps.map(function (s) { return '<li>' + s + '</li>'; }).join('') + '</ol>' : '') +
      (o.warn ? '<div class="callout warn" style="margin-top:12px"><span>' + o.warn + '</span></div>' : '') +
      (o.undo ? '<p class="faint" style="margin:10px 0 0;font-size:var(--fs-12)">' + o.undo + '</p>' : '') +
      (o.name ? '<p style="margin:14px 0 6px">' + t('confirm.type') + '</p><input class="input mono" style="width:100%" placeholder="' + attr(o.name) + '" autocomplete="off">' : '') +
      '</div><div class="dialog-foot"><button class="btn btn-ghost" data-close>' + t('dlg.cancel') + '</button>' +
      '<button class="btn ' + (o.risk === 'danger' ? 'btn-danger' : 'btn-primary') + '" data-go' + (o.name ? ' disabled' : '') + '>' + o.go + '</button></div>';
    var input = d.querySelector('input'), goBtn = d.querySelector('[data-go]');
    if (input) input.addEventListener('input', function () { goBtn.disabled = input.value.trim() !== o.name; });
    goBtn.addEventListener('click', function () {
      d.classList.remove('open');
      HOOKS.journal.forEach(function (fn) { fn(o.title); });
      if (o.onGo) o.onGo();
    });
    d.classList.add('open');
    if (input) setTimeout(function () { input.focus(); }, 30);
  }

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
    if (e.key === 'Escape') {
      var open = document.querySelectorAll('.scrim.open');
      if (open.length) open.forEach(function (s) { s.classList.remove('open'); });
      else if (view !== 'root') go('root', VIEWS[view].machine); // Esc = one level up
    }
    if (e.key === 'Enter' && selected && KIDS[selected] && view === 'root' && document.activeElement.tagName !== 'INPUT') enter(selected);
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

  // Live demo: traffic drifts every second, like counters read from interfaces would.
  setInterval(function () {
    if (state.paused) return; // looking at the past on the timeline: numbers stay frozen
    Object.keys(LINKS).forEach(function (id) {
      var L = LINKS[id], j = function (v) { return Math.max(0, v * (0.9 + Math.random() * 0.2)); };
      if (L.rate != null) { L.rate = Math.round(j(L.rate)) || 1; L.hist.push(L.rate); L.hist.shift(); }
      else if (hasSpeed(L)) { L.down = j(L.down); L.up = j(L.up); L.hist.push(L.down); L.hist.shift(); }
    });
    HOOKS.tick.forEach(function (fn) { fn(); });
    // Update only the numbers: re-creating the paths would restart the running dots.
    document.querySelectorAll('[data-pill]').forEach(function (el) {
      var L = LINKS[el.dataset.pill];
      el.textContent = (L.state === 'warn' || L.state === 'crit' ? '! ' : '') + linkSummary(L);
    });
    document.querySelectorAll('.edge-hit[data-link], .edge-pill[data-link]').forEach(function (el) { el.dataset.tip = linkTip(LINKS[el.dataset.link]); });
    if (selectedLink && !document.querySelector('.scrim.open')) {
      var scroll = $('inspector').scrollTop;
      renderInspector();
      $('inspector').scrollTop = scroll;
    }
  }, 1000);

  // ---------- API for feature files (features/*.js) ----------
  window.GLAPP = {
    NODES: NODES, LINKS: LINKS, VIEWS: VIEWS, DETAILS: DETAILS, KIDS: KIDS, HOOKS: HOOKS, state: state,
    t: t, txt: txt, attr: attr, $: $, nodeName: nodeName, viewOf: viewOf, fmtSpeed: fmtSpeed, linkSummary: linkSummary,
    get view() { return view; },
    get selected() { return selected; },
    get selectedLink() { return selectedLink; },
    get zoom() { return zoom; },
    get pan() { return [panX, panY]; },
    positions: function () { return pos[view]; },
    nodeSize: nodeSize,
    select: function (id) { if (!pos[view][id]) { go(viewOf(id), id); return; } selected = id; selectedLink = null; render(); },
    selectLink: function (id) {
      var found = null;
      Object.keys(VIEWS).forEach(function (v) { VIEWS[v].edges.forEach(function (e) { if (e[4] === id && !found) found = [v, e]; }); });
      if (!found) return;
      if (found[0] !== view) go(found[0]);
      selectedLink = [id, found[1][0], found[1][1]]; selected = null; render();
    },
    go: go, enter: enter, render: render, renderEdges: renderEdges, renderInspector: renderInspector, renderRail: renderRail,
    fit: fit, openDialog: openDialog, confirm: confirmAction, runAction: runAction,
    // Add a node (and its links) to a level at runtime — used by discovery and manual add.
    addNode: function (id, n, v, xy, edges) {
      NODES[id] = n;
      VIEWS[v].nodes[id] = xy.slice();
      pos[v][id] = xy.slice();
      (edges || []).forEach(function (e) { VIEWS[v].edges.push(e); });
      if (n.on) (KIDS[n.on] = KIDS[n.on] || []).push(id);
      render();
    },
    panTo: function (x, y, z) { zoom = z || zoom; var r = canvas.getBoundingClientRect(); panX = r.width / 2 - x * zoom; panY = r.height / 2 - y * zoom; applyTransform(); },
  };

  renderRail();
  renderLegend();
  render();
  GL.apply();
  fit();
  window.addEventListener('resize', fit);
  // Feature scripts load after this file; run their setup once every script on the page has executed.
  document.addEventListener('DOMContentLoaded', function () { HOOKS.ready.forEach(function (fn) { fn(); }); render(); GL.apply(); });
})();
