/* SQNS · Помощник медзаписи — СЦЕНАРИИ УСЛУГ (вкладка «Услуги»).
 * Каждый сценарий: параметры (что спрашиваем у врача) + build() → какие услуги добавить в визит.
 * Услуги указываются по id из прайса SQNS (колонка «№» в выгрузке «Список услуг»): один код МКБ-услуги
 * часто соответствует нескольким позициям прайса, поэтому только id.
 * Цены здесь не хранятся — помощник берёт актуальные из SQNS.
 *
 * Типы параметров сценария:
 *   seg — выбор из вариантов; toggle — да/нет; counter — счётчик;
 *   opt — выключатель + выбор варианта (значение null = выключено);
 *   perTooth — один выбор на каждый зуб;
 *   canals — счётчик каналов у каждого зуба (по умолчанию по номеру зуба);
 *   teethCards — карточка на каждый зуб со своими полями.
 * Поля карточки зуба: toggle, opt, seg, heading (подзаголовок), fillings (пломбы с классом),
 *   split (каналы по видам: «все — один вид» или «разные» со счётчиками), count (сколько каналов из N).
 *   show(c) — поле видно только при условии; скрытое поле в расчёт не попадает. adv — под «Ещё».
 */
(function () {
  'use strict';

  // id → код, короткое название для корзины, term — по каким словам искать карточку в SQNS
  const SVC = {
    1:   { code: 'B01.065.001', name: 'Приём терапевта первичный', term: 'врача-стоматолога-терапевта' },
    2:   { code: 'B01.065.002', name: 'Приём терапевта повторный', term: 'врача-стоматолога-терапевта' },
    3:   { code: 'B01.067.001', name: 'Приём хирурга первичный', term: 'врача-стоматолога-хирурга' },
    4:   { code: 'B01.067.002', name: 'Приём хирурга повторный', term: 'врача-стоматолога-хирурга' },
    13:  { code: 'B01.003.004.004', name: 'Аппликационная анестезия', term: 'Аппликационная анестезия' },
    9:   { code: 'A02.07.001', name: 'Изоляция: ретрактор OptraGate', term: 'OptraGate' },
    10:  { code: 'A02.07.001', name: 'Изоляция: коффердам', term: 'коффердам' },
    14:  { code: 'B01.003.004.005', name: 'Инфильтрационная анестезия (1 карпула)', term: 'Инфильтрационная анестезия' },
    15:  { code: 'B01.003.004.002', name: 'Проводниковая анестезия (1 карпула)', term: 'Проводниковая анестезия' },
    16:  { code: 'A16.07.082', name: 'Сошлифовывание твёрдых тканей зуба', term: 'Сошлифовывание' },
    19:  { code: 'A16.07.092', name: 'Трепанация зуба с полным удалением старой пломбы', term: 'Трепанация зуба' },
    20:  { code: 'A16.07.092', name: 'Трепанация цельнолитой / металлокерамической коронки', term: 'Трепанация зуба' },
    21:  { code: 'A16.07.091', name: 'Снятие временной пломбы', term: 'Снятие временной пломбы' },
    22:  { code: 'A16.07.002.009', name: 'Временная пломба', term: 'Наложение временной пломбы' },
    23:  { code: 'A16.07.002.009', name: 'Временная пломба светоотверждаемая', term: 'Наложение временной пломбы' },
    24:  { code: 'A16.07.002.009', name: 'Временная пломба из СИЦ', term: 'Наложение временной пломбы' },
    26:  { code: 'A16.07.002', name: 'Лечебная прокладка', term: 'лечебной прокладки' },
    27:  { code: 'A16.07.002', name: 'Изолирующая прокладка', term: 'изолирующей прокладки' },
    28:  { code: 'A16.07.002.001', name: 'Пломба из цемента (I, II, III, V, VI кл.)', term: 'стоматологических цементов' },
    29:  { code: 'A16.07.002.010', name: 'Пломба фотополимер I, V, VI кл.', term: 'фотополимеров' },
    30:  { code: 'A16.07.002.011', name: 'Пломба фотополимер II, III кл.', term: 'фотополимеров' },
    31:  { code: 'A16.07.002.012', name: 'Пломба фотополимер IV кл.', term: 'фотополимеров' },
    32:  { code: 'A16.07.002', name: 'Эстетическая реставрация', term: 'эстетическая реставрация' },
    33:  { code: 'A16.07.002', name: 'Композитный винир', term: 'композитный винир' },
    34:  { code: 'A16.07.031', name: 'Восстановление с анкерным штифтом (металл)', term: 'анкерных штифтов' },
    35:  { code: 'A16.07.031', name: 'Восстановление со стекловолоконным штифтом', term: 'анкерных штифтов' },
    36:  { code: 'A16.07.025.001', name: 'Избирательное полирование зуба', term: 'Избирательное полирование' },
    37:  { code: 'A16.07.009', name: 'Пульпотомия (ампутация коронковой пульпы)', term: 'Пульпотомия' },
    38:  { code: 'A16.07.010', name: 'Экстирпация пульпы (1 канал)', term: 'Экстирпация пульпы' },
    40:  { code: 'A16.07.082.001', name: 'Распломбировка канала: паста (1 канал)', term: 'Распломбировка' },
    41:  { code: 'A16.07.082.001', name: 'Распломбировка канала: гуттаперча (1 канал)', term: 'Распломбировка' },
    42:  { code: 'A16.07.082.002', name: 'Распломбировка канала: резорцин / фосфат-цемент (1 канал)', term: 'Распломбировка' },
    43:  { code: 'A22.07.004', name: 'УЗ-расширение канала, извлечение фрагмента инструмента', term: 'Ультразвуковое расширение' },
    44:  { code: 'A16.07.030.001', name: 'Обработка хорошо проходимого канала (1 канал)', term: 'проходимого корневого канала' },
    45:  { code: 'A16.07.030.002', name: 'Обработка плохо проходимого канала (1 канал)', term: 'проходимого корневого канала' },
    46:  { code: 'A16.07.030', name: 'Обработка инструментами высокой конусности (1 канал)', term: 'высокой конусности' },
    47:  { code: 'A16.07.002', name: 'Временное восстановление стенки зуба (эндо)', term: 'восстановление стенки' },
    48:  { code: 'A16.07.030.003', name: 'Временное пломбирование канала лекарственным препаратом', term: 'Временное пломбирование' },
    49:  { code: 'A16.07.008.002', name: 'Пломбирование канала гуттаперчей (1 канал)', term: 'гуттаперчевыми' },
    50:  { code: 'A16.07.008.002', name: 'Пломбирование гуттаперчей: два канала', term: 'гуттаперчевыми' },
    51:  { code: 'A16.07.008.002', name: 'Пломбирование гуттаперчей: три канала', term: 'гуттаперчевыми' },
    52:  { code: 'A16.07.008.002', name: 'Пломбирование гуттаперчей: четыре канала', term: 'гуттаперчевыми' },
    53:  { code: 'A16.07.008.003', name: 'Закрытие перфорации стенки корневого канала', term: 'Закрытие перфорации' },
    54:  { code: 'A16.07.008', name: 'Закрытие перфорации дна полости зуба', term: 'Закрытие перфорации' },
    55:  { code: 'A16.07.051', name: 'Профгигиена: полный комплекс', term: 'Профессиональная гигиена' },
    56:  { code: 'A16.07.051', name: 'Профгигиена: менее 14 зубов', term: 'Профессиональная гигиена' },
    57:  { code: 'A22.07.002', name: 'УЗ-удаление зубных отложений (1 зуб)', term: 'Ультразвуковое удаление' },
    184: { code: 'A16.07.097', name: 'Наложение шва на слизистую оболочку рта', term: 'Наложение шва на слизистую' },
    187: { code: 'A16.07.001.002', name: 'Удаление постоянного зуба', term: 'Удаление постоянного зуба' },
    188: { code: 'A16.07.001.003', name: 'Удаление зуба сложное с разъединением корней', term: 'Удаление зуба сложное' },
    189: { code: 'A16.07.024', name: 'Удаление ретенированного / дистопированного зуба', term: 'ретенированного' },
    237: { code: 'A11.12.009', name: 'PRF: забор крови, 1 пробирка', term: 'фибриновой мембраны' },
    238: { code: 'A11.12.009', name: 'PRF: дополнительная пробирка', term: 'фибриновой мембраны' },
  };

  // Разделы вкладки «Услуги»; sub — подгруппа внутри раздела
  const CATS = [
    { id: 'ther', title: 'Терапия', icon: '🦷' },
    { id: 'surg', title: 'Хирургия', icon: '🔧' },
    { id: 'ortho', title: 'Ортопедия', icon: '👑', empty: 'Сценарии ортопедии добавим позже.' },
  ];

  const opt = (v, l) => ({ v, l });
  const fmt = (t) => (String(t).length === 2 ? t[0] + '.' + t[1] : String(t));

  /* ---------------- анестезия ---------------- */
  const lowerPost = (t) => /^[34][4-8]$/.test(String(t));          // нижние премоляры и моляры
  // По умолчанию: по одной карпуле на сторону челюсти; нижние премоляры/моляры → проводниковая на эту сторону.
  function anestDefaults(teeth) {
    const cond = new Set(teeth.filter(lowerPost).map((t) => String(t)[0]));
    const infil = new Set(teeth.filter((t) => !cond.has(String(t)[0])).map((t) => String(t)[0]));
    return { cond: cond.size, infil: teeth.length ? infil.size : 1 };
  }
  const ANEST = (on) => [
    { key: 'anest', label: 'Анестезия', type: 'toggle', default: on },
    { key: 'appl', label: 'Аппликационная', type: 'toggle', default: false },
    { key: 'infil', label: 'Инфильтрационная', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).infil },
    { key: 'cond', label: 'Проводниковая', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).cond },
  ];
  const anestLines = (p, L) => {
    if (p.appl) L.push({ id: 13, qty: 1 });
    if (p.anest && +p.infil > 0) L.push({ id: 14, qty: +p.infil });
    if (p.anest && +p.cond > 0) L.push({ id: 15, qty: +p.cond });
  };
  const ISO = { key: 'iso', label: 'Изоляция', type: 'opt', options: [opt('dam', 'Коффердам'), opt('optra', 'OptraGate')], default: 'dam' };
  const THER_VISIT = { key: 'visit', label: 'Приём терапевта', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' };

  /* ---------------- каналы ---------------- */
  // По умолчанию: резцы, клыки, верхние 5, нижние премоляры — 1; верхние 4 — 2; верхние 7–8 и нижние моляры — 3; верхние 6 — 4.
  function canalsDefault(t) {
    const q = +String(t)[0], n = +String(t)[1], upper = q === 1 || q === 2;
    if (n <= 3) return 1;
    if (upper) return n === 4 ? 2 : n === 5 ? 1 : n === 6 ? 4 : 3;
    return n <= 5 ? 1 : 3;
  }
  const CANALS = { key: 'canals', label: 'Каналов', type: 'canals', min: 1, max: 6, auto: canalsDefault };
  // пломбирование каналов: одна услуга на зуб по числу каналов; больше 4 — «четыре» + по одному
  const OBT = { 1: 49, 2: 50, 3: 51, 4: 52 };

  /* ---------------- пломба ---------------- */
  const FILL_MAT = [opt('photo', 'Фотополимер'), opt('cem', 'Цемент'), opt('aesth', 'Эстетическая реставрация'), opt('veneer', 'Композитный винир')];
  const CLASSES = { photo: ['I', 'II', 'III', 'IV', 'V', 'VI'], cem: ['I', 'II', 'III', 'V', 'VI'] };
  const fillNeedsClass = (f) => !!CLASSES[f.mat];
  function fillSvc(f) {
    if (f.mat === 'aesth') return 32;
    if (f.mat === 'veneer') return 33;
    if (!f.cls) return null;
    if (f.mat === 'cem') return 28;
    return f.cls === 'IV' ? 31 : f.cls === 'II' || f.cls === 'III' ? 30 : 29;
  }
  const LINER = { gic: [27], cal: [26], both: [26, 27] };
  const POST = { fiber: 35, metal: 34 };
  const PASS = { bad: 45, good: 44 };
  const RETREAT = { paste: 40, gutta: 41, res: 42 };

  // split: { mode: вариант | 'mix' | null, n: { вариант: кол-во } } → сколько каналов каждого вида
  function splitCounts(s, N) {
    if (!s || !s.mode) return null;
    if (s.mode !== 'mix') return { [s.mode]: N };
    return Object.assign({}, s.n);
  }

  // ---- поля карточки зуба (общие для кариеса и эндо) ----
  const f = {
    grind: { key: 'grind', label: 'Сошлифовывание', type: 'toggle', default: true },
    oldFill: { key: 'oldFill', label: 'Удаление старой пломбы', type: 'toggle', default: false },
    liner: (show) => ({ key: 'liner', label: 'Прокладка', type: 'opt', options: [opt('gic', 'Изолирующая'), opt('cal', 'Лечебная'), opt('both', 'Обе')], default: null, onDefault: 'gic', show }),
    post: (show) => ({ key: 'post', label: 'Штифт', type: 'opt', options: [opt('fiber', 'СВШ'), opt('metal', 'Металл')], default: null, onDefault: 'fiber', show }),
    fills: (show, label) => ({ key: 'fills', label: label || 'Пломба', type: 'fillings', materials: FILL_MAT, classes: CLASSES, max: 3, show }),
    polish: (show) => ({ key: 'polish', label: 'Полирование', type: 'toggle', default: true, show }),
    tempOff: { key: 'tempOff', label: 'Снятие временной пломбы', type: 'toggle', default: true },
    pass: (show) => ({ key: 'pass', label: 'Обработка каналов', type: 'split', options: [{ v: 'bad', l: 'Плохо проходимые', s: 'Все плохо' }, { v: 'good', l: 'Хорошо проходимые', s: 'Все хорошо' }], default: 'bad', show }),
    taper: (show) => ({ key: 'taper', label: 'Высокая конусность', type: 'count', unit: 'кан.', show }),
    tempFill: (show) => ({ key: 'tempFill', label: 'Временное пломбирование каналов', type: 'toggle', default: true, show }),
    tmat: (show) => ({ key: 'tmat', label: 'Временная пломба', type: 'seg', options: [opt('22', 'Обычная'), opt('23', 'Светоотверждаемая'), opt('24', 'СИЦ')], default: '22', show }),
    obtur: (show) => ({ key: 'obtur', label: 'Пломбирование каналов', type: 'toggle', default: true, show }),
    resto: (show) => ({ key: 'resto', label: 'Пломба', type: 'seg', options: [opt('perm', 'Постоянная'), opt('temp', 'Временная')], default: 'perm', show }),
    rare: [
      { key: 'wall', label: 'Восстановление стенки зуба', type: 'toggle', default: false, adv: true },
      { key: 'usFrag', label: 'УЗ-извлечение фрагмента инструмента', type: 'toggle', default: false, adv: true },
      { key: 'perfWall', label: 'Закрытие перфорации стенки канала', type: 'toggle', default: false, adv: true },
      { key: 'perfFloor', label: 'Закрытие перфорации дна', type: 'toggle', default: false, adv: true },
    ],
  };
  // постоянная реставрация после эндо / кариеса
  const permFields = (show) => [f.liner(show), f.post(show), f.fills(show, 'Постоянная пломба'), f.polish(show)];
  // ветка после обработки каналов (пульпит, периодонтит)
  const afterCanals = (def) => {
    const ca = (c) => c.next === 'ca', obt = (c) => c.next === 'obt';
    return [
      { key: 'h2', label: 'После обработки', type: 'heading' },
      { key: 'next', label: '', type: 'seg', wide: true, options: [opt('ca', 'Кальций + временная пломба'), opt('obt', 'Пломбирование каналов')], default: def },
      f.tempFill(ca),
      f.obtur(obt),
      f.resto(obt),
      f.tmat((c) => ca(c) || (obt(c) && c.resto === 'temp')),
      ...permFields((c) => obt(c) && c.resto === 'perm'),
    ];
  };

  // Порядок строк в визите — по ходу лечения
  const ORDER = [21, 20, 19, 16, 47, 37, 38, 40, 41, 42, 43, 45, 44, 46, 53, 54, 48, 49, 50, 51, 52, 22, 23, 24, 26, 27, 35, 34, 28, 29, 30, 31, 32, 33, 36];
  // Все услуги по зубу из (видимых) полей карточки. N — каналов у зуба.
  function toothServices(c, N, add) {
    if (c.tempOff) add(21);
    if (c.crownTrep) add(20);
    if (c.oldFill) add(19);
    if (c.grind) add(16);
    if (c.wall) add(47);
    if (c.amput) add(37);
    if (c.extirp) add(38, N);
    if (c.retreat) { const s = splitCounts(c.rtype, N) || {}; Object.keys(s).forEach((k) => add(RETREAT[k], s[k])); }
    if (c.usFrag) add(43);
    { const s = splitCounts(c.pass, N); if (s) Object.keys(s).forEach((k) => add(PASS[k], s[k])); }
    if (+c.taper > 0) add(46, +c.taper);
    if (c.perfWall) add(53);
    if (c.perfFloor) add(54);
    if (c.tempFill) add(48, N);
    if (c.obtur) { add(OBT[Math.min(N, 4)]); if (N > 4) add(49, N - 4); }
    if (c.tmat) add(+c.tmat);
    (LINER[c.liner] || []).forEach((id) => add(id));
    if (c.post) add(POST[c.post]);
    (c.fills || []).forEach((x) => add(fillSvc(x)));
    if (c.polish) add(36);
  }
  // Услуги по зубам → строки визита. Одна услуга на несколько зубов — одна строка; разное кол-во на зуб — разные строки.
  function perToothLines(map) {            // map: id → { зуб: кол-во }
    const L = [];
    Object.keys(map).forEach((id) => {
      const byN = {};
      Object.keys(map[id]).forEach((t) => { const n = map[id][t]; (byN[n] = byN[n] || []).push(t); });
      Object.keys(byN).sort().forEach((n) => { const tt = byN[n].sort(); L.push({ id: +id, qty: tt.length * +n, teeth: tt }); });
    });
    return L.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  }
  // общий build для терапевтических сценариев
  function therBuild(p, teeth) {
    const L = [{ id: p.visit === 'first' ? 1 : 2, qty: 1, skipIfCode: 'B01.065' }];
    anestLines(p, L);
    if (p.iso) L.push({ id: p.iso === 'optra' ? 9 : 10, qty: 1 });
    const M = {};
    teeth.forEach((t) => {
      const c = (p.tooth || {})[t]; if (!c) return;
      const N = Math.max(1, +((p.canals || {})[t]) || 1);
      toothServices(c, N, (id, n) => { if (!id || n === 0) return; M[id] = M[id] || {}; M[id][t] = (M[id][t] || 0) + (n || 1); });
    });
    return L.concat(perToothLines(M));
  }
  // общая проверка
  function therCheck(p, teeth) {
    const out = [];
    if (!teeth.length) out.push({ lvl: 'bad', text: 'Отметьте зубы' });
    if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' });
    teeth.slice().sort().forEach((t) => {
      const c = (p.tooth || {})[t]; if (!c) return;
      const Z = 'Зуб ' + fmt(t) + ': ', N = Math.max(1, +((p.canals || {})[t]) || 1);
      (c.fills || []).forEach((x, i) => { if (fillNeedsClass(x) && !x.cls) out.push({ lvl: 'bad', text: Z + 'выберите класс пломбы' + ((c.fills || []).length > 1 ? ' ' + (i + 1) : '') }); });
      if (c.retreat && !(c.rtype && c.rtype.mode)) out.push({ lvl: 'bad', text: Z + 'выберите вид распломбировки' });
      [['rtype', 'распломбировка', c.retreat], ['pass', 'обработка каналов', true]].forEach(([k, nm, on]) => {
        const s = c[k]; if (!on || !s || s.mode !== 'mix') return;
        const sum = Object.values(s.n || {}).reduce((a, b) => a + (+b || 0), 0);
        if (sum !== N) out.push({ lvl: 'bad', text: Z + nm + ' — по видам ' + sum + ' кан., а каналов ' + N });
      });
    });
    return out;
  }

  /* ---------------- удаление ---------------- */
  const EXT = { simple: 187, complex: 188, impacted: 189 };

  const SCENARIOS = [
    {
      id: 'caries', title: 'Кариес', icon: '🦷', cat: 'ther', needTeeth: true,
      params: [
        THER_VISIT, ...ANEST(true), ISO,
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          f.grind, f.oldFill, f.liner(), f.post(), f.fills(), f.polish(),
          { key: 'crownTrep', label: 'Трепанация коронки (цельнолитой, МК)', type: 'toggle', default: false, adv: true },
          { key: 'tempOff', label: 'Снятие временной пломбы', type: 'toggle', default: false, adv: true },
        ] },
      ],
      check: therCheck, build: therBuild,
    },
    {
      id: 'hygiene', title: 'Гигиена', icon: '✨', cat: 'ther',
      params: [
        THER_VISIT, ...ANEST(false),
        { key: 'iso', label: 'Изоляция', type: 'opt', options: [opt('optra', 'OptraGate')], default: 'optra' },
        { key: 'scope', label: 'Гигиена', type: 'seg', wide: true, options: [opt('full', 'Полный комплекс'), opt('partial', 'Менее 14 зубов'), opt('teeth', 'УЗ по зубам')], default: 'full' },
        { key: 'teethPick', label: 'УЗ-удаление отложений — зубы', type: 'teethPick', show: (p) => p.scope === 'teeth' },
        { key: 'polish', label: 'Избирательное полирование', type: 'toggle', default: false, show: (p) => p.scope === 'teeth' },
        { key: 'polishTeeth', label: 'Полирование — зубы', type: 'toothSet', auto: (teeth) => teeth.slice(), show: (p) => p.scope === 'teeth' && p.polish },
      ],
      check: (p, teeth) => {
        const out = [];
        if (p.scope === 'teeth' && !teeth.length) out.push({ lvl: 'bad', text: 'Отметьте зубы для УЗ-удаления отложений' });
        if (p.scope === 'teeth' && p.polish && !(p.polishTeeth || []).length) out.push({ lvl: 'bad', text: 'Отметьте зубы для полирования' });
        if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' });
        return out;
      },
      build: (p, teeth) => {
        const L = [{ id: p.visit === 'first' ? 1 : 2, qty: 1, skipIfCode: 'B01.065' }];
        anestLines(p, L);
        if (p.iso) L.push({ id: 9, qty: 1 });
        if (p.scope === 'full') L.push({ id: 55, qty: 1 });
        if (p.scope === 'partial') L.push({ id: 56, qty: 1 });
        if (p.scope === 'teeth' && teeth.length) L.push({ id: 57, qty: teeth.length, teeth: teeth.slice() });
        const pt = (p.polishTeeth || []).slice().sort();
        if (p.scope === 'teeth' && p.polish && pt.length) L.push({ id: 36, qty: pt.length, teeth: pt });
        return L;
      },
    },
    {
      id: 'pulpitis', title: 'Пульпит', icon: '🔴', cat: 'ther', sub: 'Эндодонтия', needTeeth: true,
      params: [
        CANALS, THER_VISIT, ...ANEST(true), ISO,
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          f.grind, f.oldFill,
          { key: 'h1', label: 'Каналы', type: 'heading' },
          { key: 'amput', label: 'Ампутация', type: 'toggle', default: true },
          { key: 'extirp', label: 'Экстирпация', type: 'toggle', default: true, perCanal: true },
          f.pass(), f.taper(),
          ...afterCanals('obt'), ...f.rare,
        ] },
      ],
      check: therCheck, build: therBuild,
    },
    {
      id: 'periodontitis', title: 'Периодонтит', icon: '🟣', cat: 'ther', sub: 'Эндодонтия', needTeeth: true,
      params: [
        CANALS, THER_VISIT, ...ANEST(false), ISO,
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          f.grind, f.oldFill,
          { key: 'h1', label: 'Каналы', type: 'heading' },
          { key: 'retreat', label: 'Распломбировка', type: 'toggle', default: true },
          { key: 'rtype', label: 'Ранее пломбированы', type: 'split', options: [opt('paste', 'Паста'), opt('gutta', 'Гуттаперча'), opt('res', 'Резорцин / фосфат')], default: null, show: (c) => c.retreat },
          f.pass(), f.taper(),
          ...afterCanals('ca'), ...f.rare,
        ] },
      ],
      check: therCheck, build: therBuild,
    },
    {
      id: 'recalc', title: 'Смена кальция', icon: '🔁', cat: 'ther', sub: 'Эндодонтия', needTeeth: true,
      params: [
        CANALS, THER_VISIT, ...ANEST(false), ISO,
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          f.tempOff,
          { key: 'h1', label: 'Каналы', type: 'heading' },
          { key: 'proc', label: 'Обработка каналов', type: 'toggle', default: false },
          f.pass((c) => c.proc), f.taper((c) => c.proc),
          f.tempFill(), f.tmat(),
        ] },
      ],
      check: therCheck, build: therBuild,
    },
    {
      id: 'obturation', title: 'Пломбировка каналов', icon: '✅', cat: 'ther', sub: 'Эндодонтия', needTeeth: true,
      params: [
        CANALS, THER_VISIT, ...ANEST(false), ISO,
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          f.tempOff,
          { key: 'h1', label: 'Каналы', type: 'heading' },
          { key: 'proc', label: 'Обработка каналов', type: 'toggle', default: false },
          f.pass((c) => c.proc), f.taper((c) => c.proc),
          f.obtur(),
          { key: 'h2', label: 'Пломба', type: 'heading' },
          { key: 'resto', label: '', type: 'seg', wide: true, options: [opt('perm', 'Постоянная'), opt('temp', 'Временная')], default: 'perm' },
          f.tmat((c) => c.resto === 'temp'),
          ...permFields((c) => c.resto === 'perm'),
        ] },
      ],
      check: therCheck, build: therBuild,
    },
    {
      id: 'extraction', title: 'Удаление зуба', icon: '🔧', cat: 'surg', needTeeth: true,
      params: [
        { key: 'visit', label: 'Приём хирурга', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' },
        ...ANEST(true),
        { key: 'method', label: 'Удаление', type: 'perTooth', options: [opt('simple', 'Обычное'), opt('complex', 'Сложное'), opt('impacted', 'Ретенированного')], default: 'simple' },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false, auto: (teeth, p) => teeth.some((t) => (p.method || {})[t] && p.method[t] !== 'simple') },
        { key: 'prf', label: 'PRF', type: 'toggle', default: false },
        { key: 'tubes', label: 'Пробирок', unit: 'шт.', type: 'counter', min: 1, max: 8, default: 1, show: (p) => p.prf },
      ],
      check: (p, teeth) => {
        const out = [];
        if (!teeth.length) out.push({ lvl: 'bad', text: 'Отметьте удаляемые зубы' });
        if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' });
        return out;
      },
      build: (p, teeth) => {
        const L = [];
        L.push({ id: p.visit === 'first' ? 3 : 4, qty: 1, skipIfCode: 'B01.067' });
        anestLines(p, L);
        Object.keys(EXT).forEach((m) => {
          const tt = teeth.filter((t) => ((p.method || {})[t] || 'simple') === m);
          if (tt.length) L.push({ id: EXT[m], qty: tt.length, teeth: tt });
        });
        if (p.sutures) L.push({ id: 184, qty: 1 });
        if (p.prf) { L.push({ id: 237, qty: 1 }); if (+p.tubes > 1) L.push({ id: 238, qty: +p.tubes - 1 }); }
        return L;
      },
    },
  ];

  globalThis.SQNSMZ_SERVICES = { SVC, CATS, SCENARIOS, _test: { anestDefaults, canalsDefault, fillSvc, perToothLines, splitCounts } };
})();
