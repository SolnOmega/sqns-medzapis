/* SQNS · Помощник медзаписи — СЦЕНАРИИ УСЛУГ (вкладка «Услуги»).
 * Каждый сценарий: параметры (что спрашиваем у врача) + build() → какие услуги добавить в визит.
 * Услуги указываются по id из прайса SQNS (колонка «№» в выгрузке «Список услуг»): один код МКБ-услуги
 * часто соответствует нескольким позициям прайса, поэтому только id.
 * Цены здесь не хранятся — помощник берёт актуальные из SQNS.
 *
 * Типы параметров:
 *   seg — выбор из вариантов; toggle — да/нет; counter — счётчик;
 *   opt — выключатель + выбор варианта (значение null = выключено);
 *   perTooth — один выбор на каждый зуб;
 *   teethCards — карточка на каждый зуб со своими полями (toggle / opt / fillings), adv — под «Ещё».
 */
(function () {
  'use strict';

  // id → код, короткое название для корзины, term — по каким словам искать карточку в SQNS
  const SVC = {
    1:   { code: 'B01.065.001', name: 'Приём терапевта первичный', term: 'врача-стоматолога-терапевта' },
    2:   { code: 'B01.065.002', name: 'Приём терапевта повторный', term: 'врача-стоматолога-терапевта' },
    3:   { code: 'B01.067.001', name: 'Приём хирурга первичный', term: 'врача-стоматолога-хирурга' },
    4:   { code: 'B01.067.002', name: 'Приём хирурга повторный', term: 'врача-стоматолога-хирурга' },
    9:   { code: 'A02.07.001', name: 'Изоляция: ретрактор OptraGate', term: 'OptraGate' },
    10:  { code: 'A02.07.001', name: 'Изоляция: коффердам', term: 'коффердам' },
    14:  { code: 'B01.003.004.005', name: 'Инфильтрационная анестезия (1 карпула)', term: 'Инфильтрационная анестезия' },
    15:  { code: 'B01.003.004.002', name: 'Проводниковая анестезия (1 карпула)', term: 'Проводниковая анестезия' },
    16:  { code: 'A16.07.082', name: 'Сошлифовывание твёрдых тканей зуба', term: 'Сошлифовывание' },
    19:  { code: 'A16.07.092', name: 'Трепанация зуба с полным удалением старой пломбы', term: 'Трепанация зуба' },
    20:  { code: 'A16.07.092', name: 'Трепанация цельнолитой / металлокерамической коронки', term: 'Трепанация зуба' },
    21:  { code: 'A16.07.091', name: 'Снятие временной пломбы', term: 'Снятие временной пломбы' },
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
    36:  { code: 'A16.07.025.001', name: 'Полирование композитной реставрации', term: 'Избирательное полирование' },
    184: { code: 'A16.07.097', name: 'Наложение шва на слизистую оболочку рта', term: 'Наложение шва на слизистую' },
    187: { code: 'A16.07.001.002', name: 'Удаление постоянного зуба', term: 'Удаление постоянного зуба' },
    188: { code: 'A16.07.001.003', name: 'Удаление зуба сложное с разъединением корней', term: 'Удаление зуба сложное' },
    189: { code: 'A16.07.024', name: 'Удаление ретенированного / дистопированного зуба', term: 'ретенированного' },
    237: { code: 'A11.12.009', name: 'PRF: забор крови, 1 пробирка', term: 'фибриновой мембраны' },
    238: { code: 'A11.12.009', name: 'PRF: дополнительная пробирка', term: 'фибриновой мембраны' },
  };

  const opt = (v, l) => ({ v, l });
  const fmt = (t) => (String(t).length === 2 ? t[0] + '.' + t[1] : String(t));
  const lowerPost = (t) => /^[34][4-8]$/.test(String(t));          // нижние премоляры и моляры
  // Анестезия по умолчанию: по одной карпуле на сторону челюсти.
  // Нижние премоляры/моляры → проводниковая на эту сторону; остальные стороны → инфильтрационная.
  function anestDefaults(teeth) {
    const cond = new Set(teeth.filter(lowerPost).map((t) => String(t)[0]));
    const infil = new Set(teeth.filter((t) => !cond.has(String(t)[0])).map((t) => String(t)[0]));
    return { cond: cond.size, infil: teeth.length ? infil.size : 1 };
  }
  // общие параметры анестезии (хирургия, терапия)
  const ANEST = [
    { key: 'anest', label: 'Анестезия', type: 'toggle', default: true },
    { key: 'infil', label: 'Инфильтрационная', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).infil },
    { key: 'cond', label: 'Проводниковая', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).cond },
  ];
  const anestLines = (p, L) => {
    if (p.anest && +p.infil > 0) L.push({ id: 14, qty: +p.infil });
    if (p.anest && +p.cond > 0) L.push({ id: 15, qty: +p.cond });
  };
  const anestCheck = (p, out) => { if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' }); };

  /* ---------------- удаление ---------------- */
  const EXT = { simple: 187, complex: 188, impacted: 189 };

  /* ---------------- кариес ---------------- */
  // Пломба: материал → услуга; для фотополимера услуга зависит от класса по Блэку
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

  // Услуги по зубам → строки визита. Один зуб с двумя одинаковыми пломбами → отдельная строка с кол-вом 2.
  function perToothLines(map) {            // map: id → { зуб: кол-во }
    const L = [];
    Object.keys(map).forEach((id) => {
      const byN = {};
      Object.keys(map[id]).forEach((t) => { const n = map[id][t]; (byN[n] = byN[n] || []).push(t); });
      Object.keys(byN).sort().forEach((n) => { const tt = byN[n].sort(); L.push({ id: +id, qty: tt.length * +n, teeth: tt }); });
    });
    return L;
  }

  const SCENARIOS = [
    {
      id: 'caries', title: 'Кариес', icon: '🦷', cat: 'Терапия', needTeeth: true,
      params: [
        { key: 'visit', label: 'Приём терапевта', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' },
        ...ANEST,
        { key: 'iso', label: 'Изоляция', type: 'opt', options: [opt('dam', 'Коффердам'), opt('optra', 'OptraGate')], default: 'dam' },
        { key: 'tooth', label: 'По зубам', type: 'teethCards', fields: [
          { key: 'grind', label: 'Сошлифовывание', type: 'toggle', default: true },
          { key: 'oldFill', label: 'Удаление старой пломбы', type: 'toggle', default: false },
          { key: 'liner', label: 'Прокладка', type: 'opt', options: [opt('gic', 'Изолирующая'), opt('cal', 'Лечебная'), opt('both', 'Обе')], default: null, onDefault: 'gic' },
          { key: 'post', label: 'Штифт', type: 'opt', options: [opt('fiber', 'СВШ'), opt('metal', 'Металл')], default: null, onDefault: 'fiber' },
          { key: 'fills', label: 'Пломба', type: 'fillings', materials: FILL_MAT, classes: CLASSES, max: 3 },
          { key: 'polish', label: 'Полирование', type: 'toggle', default: true },
          { key: 'crownTrep', label: 'Трепанация коронки (цельнолитой, МК)', type: 'toggle', default: false, adv: true },
          { key: 'tempOff', label: 'Снятие временной пломбы', type: 'toggle', default: false, adv: true },
        ] },
      ],
      check: (p, teeth) => {
        const out = [];
        if (!teeth.length) out.push({ lvl: 'bad', text: 'Отметьте зубы' });
        anestCheck(p, out);
        teeth.slice().sort().forEach((t) => {
          const c = (p.tooth || {})[t]; if (!c) return;
          (c.fills || []).forEach((f, i) => {
            if (fillNeedsClass(f) && !f.cls) out.push({ lvl: 'bad', text: 'Зуб ' + fmt(t) + ': выберите класс пломбы' + ((c.fills || []).length > 1 ? ' ' + (i + 1) : '') });
          });
        });
        return out;
      },
      build: (p, teeth) => {
        const L = [];
        L.push({ id: p.visit === 'first' ? 1 : 2, qty: 1, skipIfCode: 'B01.065' });
        anestLines(p, L);
        if (p.iso) L.push({ id: p.iso === 'optra' ? 9 : 10, qty: 1 });
        // по зубам — в порядке выполнения
        const M = {}; const add = (id, t, n) => { if (!id) return; M[id] = M[id] || {}; M[id][t] = (M[id][t] || 0) + (n || 1); };
        const ORDER = [21, 20, 19, 16, 26, 27, 35, 34, 28, 29, 30, 31, 32, 33, 36];
        teeth.forEach((t) => {
          const c = (p.tooth || {})[t]; if (!c) return;
          if (c.tempOff) add(21, t);
          if (c.crownTrep) add(20, t);
          if (c.oldFill) add(19, t);
          if (c.grind) add(16, t);
          (LINER[c.liner] || []).forEach((id) => add(id, t));
          if (c.post) add(POST[c.post], t);
          (c.fills || []).forEach((f) => add(fillSvc(f), t));
          if (c.polish) add(36, t);
        });
        const per = perToothLines(M).sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
        return L.concat(per);
      },
    },
    {
      id: 'extraction', title: 'Удаление зуба', icon: '🔧', cat: 'Хирургия', needTeeth: true,
      params: [
        { key: 'visit', label: 'Приём хирурга', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' },
        ...ANEST,
        { key: 'method', label: 'Удаление', type: 'perTooth', options: [opt('simple', 'Обычное'), opt('complex', 'Сложное'), opt('impacted', 'Ретенированного')], default: 'simple' },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false, auto: (teeth, p) => teeth.some((t) => (p.method || {})[t] && p.method[t] !== 'simple') },
        { key: 'prf', label: 'PRF', type: 'toggle', default: false },
        { key: 'tubes', label: 'Пробирок', unit: 'шт.', type: 'counter', min: 1, max: 8, default: 1, show: (p) => p.prf },
      ],
      check: (p, teeth) => {
        const out = [];
        if (!teeth.length) out.push({ lvl: 'bad', text: 'Отметьте удаляемые зубы' });
        anestCheck(p, out);
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

  globalThis.SQNSMZ_SERVICES = { SVC, SCENARIOS, _test: { anestDefaults, fillSvc, perToothLines } };
})();
