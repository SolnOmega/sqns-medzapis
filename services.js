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
 *   teethCards — карточка на каждый зуб со своими полями;
 *   group — раскрывающийся блок (выключатель в заголовке), его поля помечены grp: '<key>'; sub — подпункт с отступом;
 *   stock — плашки-счётчики (кость, мембраны); toothSet — мини-формула для одной услуги (compact, auto, autoText, hl).
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
    117: { code: 'A16.07.006', name: 'Абатмент временный', term: 'аббатмента временного' },
    119: { code: 'A16.07.006', name: 'Абатмент стандартный', term: 'аббатмента стандартного' },
    124: { code: 'A16.07.006', name: 'Мультиюнит', term: 'мультиюнита' },
    184: { code: 'A16.07.097', name: 'Наложение шва на слизистую оболочку рта', term: 'Наложение шва на слизистую' },
    185: { code: 'A16.07.097', name: 'Наложение шва PTFE', term: 'Наложение шва на слизистую' },
    187: { code: 'A16.07.001.002', name: 'Удаление постоянного зуба', term: 'Удаление постоянного зуба' },
    188: { code: 'A16.07.001.003', name: 'Удаление зуба сложное с разъединением корней', term: 'Удаление зуба сложное' },
    189: { code: 'A16.07.024', name: 'Удаление ретенированного / дистопированного зуба', term: 'ретенированного' },
    211: { code: 'A16.07.089', name: 'Гингивопластика', term: 'Гингивопластика' },
    212: { code: 'A16.07.054', name: 'Имплантат Osstem', term: 'имплантат Osstem' },
    213: { code: 'A16.07.054', name: 'Имплантат Dentium', term: 'имплантат Dentium' },
    215: { code: 'A16.07.054', name: 'Установка формирователя десны', term: 'формирователя десны' },
    218: { code: 'A16.07.054', name: 'Хирургический шаблон пилотный / навигационный', term: 'пилотного/навигационного' },
    219: { code: 'A16.07.054', name: 'Хирургический шаблон, полный протокол (до 5 имплантатов)', term: 'до 5 имплантатов' },
    220: { code: 'A16.07.054', name: 'Хирургический шаблон, полный протокол (более 5 имплантатов)', term: 'более 5 имплантатов' },
    221: { code: 'A16.23.042.001', name: 'Забор аутокости', term: 'забор аутокости' },
    222: { code: 'A16.07.055', name: 'Закрытый синус-лифтинг', term: 'закрытого типа' },
    225: { code: 'A16.07.041', name: 'НКР в области 1 зуба при имплантации', term: 'при установке дентального имплантата' },
    226: { code: 'A16.07.041.001', name: 'Bio-Oss 0,5 см³', term: 'Bio-Oss' },
    227: { code: 'A16.07.041.001', name: 'Xenograft 0,5 см³', term: 'Xenograft' },
    228: { code: 'A16.07.041.001', name: 'Xenograft 1,0 см³', term: 'Xenograft' },
    229: { code: 'A16.07.041.001', name: 'Xenograft 3,0 см³', term: 'Xenograft' },
    230: { code: 'A16.07.041.001', name: 'Мембрана Биопласт-Дент', term: 'Биопласт-Дент' },
    231: { code: 'A16.07.041.001', name: 'Мембрана Bioplate Contur', term: 'Bioplate Contur' },
    232: { code: 'A16.07.041.001', name: 'Мембрана Bio-Gide', term: 'BioGuide' },
    233: { code: 'A16.07.041', name: 'Титановая сетка', term: 'титановой сетки' },
    234: { code: 'A16.07.041', name: 'Нерезорбируемая мембрана', term: 'нерезорбируемой мембраны' },
    235: { code: 'A16.07.041', name: 'Пин для фиксации', term: 'пина для фиксации' },
    236: { code: 'A16.07.041', name: 'Винт для фиксации', term: 'винта для фиксации' },
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
  // teethOf(teeth, p) — по каким зубам считать карпулы (например, имплантаты + удаляемые зубы)
  const ANEST = (on, teethOf) => {
    const tt = (teeth, p) => (teethOf ? teethOf(teeth, p) : teeth);
    return [
      { key: 'anest', label: 'Анестезия', type: 'toggle', default: on },
      { key: 'appl', label: 'Аппликационная', type: 'toggle', default: false },
      { key: 'infil', label: 'Инфильтрационная', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth, p) => anestDefaults(tt(teeth, p)).infil },
      { key: 'cond', label: 'Проводниковая', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth, p) => anestDefaults(tt(teeth, p)).cond },
    ];
  };
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
  const EXT_METHODS = [opt('simple', 'Обычное'), opt('complex', 'Сложное'), opt('impacted', 'Ретенированного')];

  /* ---------------- хирургия: общие секции (подключаются в любой сценарий) ---------------- */
  const SURG_VISIT = { key: 'visit', label: 'Приём хирурга', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' };
  const surgVisitLine = (p) => ({ id: p.visit === 'first' ? 3 : 4, qty: 1, skipIfCode: 'B01.067' });
  const uniq = (a) => [...new Set((a || []).map(String))].sort();
  const sorted = (a) => (a || []).map(String).sort();
  const UPPER_LAT = (t) => /^[12][4-7]$/.test(String(t));
  const teethLine = (id, tt) => (tt.length ? { id, qty: tt.length, teeth: tt } : null);
  const push = (L, x) => { if (x) L.push(x); };

  // Швы: по умолчанию 1 обычный; PTFE — на выбор
  const SUTURES = (on) => [
    { key: 'sut', label: 'Швы', type: 'toggle', default: on },
    { key: 'sutN', label: 'Количество', unit: 'шт.', type: 'counter', min: 1, max: 20, default: 1, sub: true, show: (p) => p.sut },
    { key: 'sutType', label: 'Шов', type: 'seg', options: [opt('184', 'Обычный'), opt('185', 'PTFE')], default: '184', sub: true, show: (p) => p.sut },
  ];
  const sutLines = (p, L) => { if (p.sut && +p.sutN > 0) L.push({ id: +p.sutType || 184, qty: +p.sutN }); };

  // Удаление зубов внутри другого сценария: свой набор зубов (ничего не предвыбрано) и способ по каждому зубу
  function EXTRACT(o) {
    o = o || {};
    const params = [
      { key: 'ext', label: o.label || 'Удаление зуба', type: 'group', default: false, summary: (p) => sorted(p.extTeeth).map(fmt).join(', ') },
      { key: 'extTeeth', label: 'Удаляемые зубы', type: 'toothSet', grp: 'ext', compact: true, hl: o.hl, hlText: o.hlText },
      { key: 'extMethod', label: 'Удаление', type: 'perTooth', grp: 'ext', teethFrom: 'extTeeth', options: EXT_METHODS, default: 'simple' },
    ];
    const lines = (p, L) => {
      if (!p.ext) return;
      const tt = sorted(p.extTeeth);
      Object.keys(EXT).forEach((m) => push(L, teethLine(EXT[m], tt.filter((t) => ((p.extMethod || {})[t] || 'simple') === m))));
    };
    const check = (p, teeth, X, out) => { if (p.ext && !(p.extTeeth || []).length) out.push({ lvl: 'bad', text: 'Удаление зуба: отметьте удаляемые зубы' }); };
    return { params, lines, check };
  }

  // Костная пластика: набор позиций (items) и id услуги НКР задаются при подключении.
  const BONE = [
    { l: 'Bio-Oss', items: [{ id: 226, l: '0,5 см³', vol: 0.5 }] },
    { l: 'Xenograft', items: [{ id: 227, l: '0,5 см³', vol: 0.5 }, { id: 228, l: '1,0 см³', vol: 1 }, { id: 229, l: '3,0 см³', vol: 3 }] },
  ];
  const MEMB = [
    { l: 'Резорбируемые', items: [{ id: 230, l: 'Биопласт-Дент' }, { id: 231, l: 'Bioplate Contur' }, { id: 232, l: 'Bio-Gide' }] },
    { l: 'Нерезорбируемые', items: [{ id: 233, l: 'Титановая сетка' }, { id: 234, l: 'Нерезорбируемая' }] },
  ];
  const stockIds = (rows) => rows.flatMap((r) => r.items.map((x) => x.id));
  function GRAFT(o) {
    o = Object.assign({ nkr: 225, nkrLabel: 'НКР в области 1 зуба', items: ['nkr', 'sinus', 'autoBone', 'bone', 'memb', 'prf', 'pins', 'screws', 'gingivo'] }, o || {});
    const G = 'graft', has = (k) => o.items.includes(k), on = (k) => (p) => !!p[k];
    const tg = (key, label) => ({ key, label, type: 'toggle', default: false, grp: G });
    const one = (teeth) => (teeth.length === 1 ? sorted(teeth) : []);
    const all = [];
    if (has('nkr')) all.push(tg('nkr', o.nkrLabel),
      { key: 'nkrTeeth', label: 'Зубы', type: 'toothSet', grp: G, sub: true, compact: true, show: on('nkr'), auto: one, autoText: 'единственный имплантат' });
    if (has('sinus')) all.push(tg('sinus', 'Закрытый синус-лифтинг'),
      { key: 'sinusTeeth', label: 'Зубы', type: 'toothSet', grp: G, sub: true, compact: true, show: on('sinus'),
        auto: (teeth) => (teeth.length === 1 ? sorted(teeth) : sorted(teeth).filter(UPPER_LAT)),
        autoText: (p, teeth) => (teeth.length === 1 ? 'единственный имплантат' : 'верхние боковые имплантаты') });
    if (has('autoBone')) all.push(tg('autoBone', 'Забор аутокости'));
    if (has('bone')) all.push(tg('bone', 'Кость'), { key: 'boneStock', label: 'Кость', type: 'stock', rows: BONE, unit: 'см³', total: true, needText: 'выберите материал и объём', grp: G, sub: true, show: on('bone') });
    if (has('memb')) all.push(tg('memb', 'Мембрана'), { key: 'membStock', label: 'Мембрана', type: 'stock', rows: MEMB, needText: 'выберите мембрану', grp: G, sub: true, show: on('memb') });
    if (has('prf')) all.push(tg('prf', 'PRF'), { key: 'tubes', label: 'Пробирок', unit: 'шт.', type: 'counter', min: 1, max: 8, default: 1, grp: G, sub: true, show: on('prf') });
    if (has('pins')) all.push(tg('pins', 'Пины'), { key: 'pinsN', label: 'Количество', unit: 'шт.', type: 'counter', min: 1, max: 20, default: null, need: true, grp: G, sub: true, show: on('pins') });
    if (has('screws')) all.push(tg('screws', 'Винты'), { key: 'screwsN', label: 'Количество', unit: 'шт.', type: 'counter', min: 1, max: 20, default: null, need: true, grp: G, sub: true, show: on('screws') });
    if (has('gingivo')) all.push(tg('gingivo', 'Гингивопластика'));
    const params = [{ key: G, label: o.label || 'Костная пластика', type: 'group', default: false }].concat(all);
    const stockLines = (m, rows, L) => stockIds(rows).forEach((id) => { if (+(m || {})[id] > 0) L.push({ id, qty: +m[id] }); });
    // основная часть (до формирователей/абатментов) и мягкие ткани — отдельно, чтобы строки шли по ходу операции
    const lines = (p, L) => {
      if (!p[G]) return;
      if (p.nkr) push(L, teethLine(o.nkr, sorted(p.nkrTeeth)));
      if (p.sinus) push(L, teethLine(222, sorted(p.sinusTeeth)));
      if (p.autoBone) L.push({ id: 221, qty: 1 });
      if (p.bone) stockLines(p.boneStock, BONE, L);
      if (p.memb) stockLines(p.membStock, MEMB, L);
      if (p.prf) { L.push({ id: 237, qty: 1 }); if (+p.tubes > 1) L.push({ id: 238, qty: +p.tubes - 1 }); }
      if (p.pins && +p.pinsN > 0) L.push({ id: 235, qty: +p.pinsN });
      if (p.screws && +p.screwsN > 0) L.push({ id: 236, qty: +p.screwsN });
    };
    const soft = (p, L) => { if (p[G] && p.gingivo) L.push({ id: 211, qty: 1 }); };
    const check = (p, teeth, X, out) => {
      if (!p[G]) return;
      const T = (X && X.touched) || {}, empty = (m) => !Object.values(m || {}).some((n) => +n > 0);
      if (p.nkr && !(p.nkrTeeth || []).length) out.push({ lvl: 'bad', text: 'НКР: отметьте зубы' });
      if (p.sinus && !(p.sinusTeeth || []).length) out.push({ lvl: 'bad', text: 'Закрытый синус-лифтинг: отметьте зубы' });
      else if (p.sinus && teeth.length > 1 && !T.sinusTeeth) out.push({ lvl: 'warn', text: 'Закрытый синус-лифтинг: проверьте выбранные области' });
      if (p.bone && empty(p.boneStock)) out.push({ lvl: 'bad', text: 'Кость: выберите материал и объём' });
      if (p.memb && empty(p.membStock)) out.push({ lvl: 'bad', text: 'Мембрана: выберите мембрану' });
      if (p.pins && !(+p.pinsN > 0)) out.push({ lvl: 'bad', text: 'Пины: укажите количество' });
      if (p.screws && !(+p.screwsN > 0)) out.push({ lvl: 'bad', text: 'Винты: укажите количество' });
      if (!all.some((x) => x.type === 'toggle' && p[x.key])) out.push({ lvl: 'warn', text: 'Костная пластика включена, но ничего не выбрано' });
    };
    return { params, lines, soft, check };
  }

  /* ---------------- имплантация ---------------- */
  const IMPL_SYS = { osstem: 212, dentium: 213 };
  const ABUT = { temp: 117, std: 119, mu: 124 };
  const IMPL_EXT = EXTRACT({ hl: (p, teeth) => teeth, hlText: 'зубы имплантатов' });
  const IMPL_GRAFT = GRAFT();
  // шаблон — по одному на челюсть с имплантатами; полный протокол: до 5 / более 5 имплантатов на челюсти
  function guideLines(p, teeth, L) {
    if (!p.guide) return;
    const jaws = [teeth.filter((t) => /^[12]/.test(t)), teeth.filter((t) => /^[34]/.test(t))].filter((j) => j.length);
    if (!jaws.length) jaws.push([]);
    const by = {};
    jaws.forEach((j) => { const id = p.guide === 'pilot' ? 218 : j.length > 5 ? 220 : 219; by[id] = (by[id] || 0) + 1; });
    Object.keys(by).forEach((id) => L.push({ id: +id, qty: by[id] }));
  }

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
        { key: 'polishTeeth', label: 'Полирование — зубы', type: 'toothSet', auto: (teeth) => teeth.slice(), autoText: 'те же зубы, что в УЗ-удалении', show: (p) => p.scope === 'teeth' && p.polish },
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
        SURG_VISIT,
        ...ANEST(true),
        { key: 'method', label: 'Удаление', type: 'perTooth', options: EXT_METHODS, default: 'simple' },
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
    {
      id: 'implant', title: 'Установка имплантатов', icon: '🔩', cat: 'surg', needTeeth: true, teethTitle: 'Зубы имплантатов',
      params: [
        SURG_VISIT,
        ...ANEST(true, (teeth, p) => uniq(teeth.concat(p.ext ? p.extTeeth || [] : []))),
        { key: 'iso', label: 'Изоляция', type: 'opt', options: [opt('optra', 'OptraGate')], default: 'optra' },
        { key: 'guide', label: 'Шаблон', type: 'opt', options: [opt('pilot', 'Пилотный'), opt('full', 'Полный протокол')], default: null, onDefault: 'pilot' },
        { key: 'sys', label: 'Система', type: 'seg', options: [opt('osstem', 'Osstem'), opt('dentium', 'Dentium')], default: 'osstem' },
        ...SUTURES(true),
        ...IMPL_EXT.params,
        { key: 'fdm', label: 'Формирователь десны', type: 'toggle', default: false },
        { key: 'fdmTeeth', label: 'Зубы', type: 'toothSet', sub: true, compact: true, show: (p) => p.fdm, auto: (teeth) => sorted(teeth), autoText: 'все имплантаты' },
        { key: 'abut', label: 'Абатмент', type: 'opt', options: [opt('temp', 'Временный'), opt('std', 'Стандартный'), opt('mu', 'Мультиюнит')], default: null, onDefault: 'temp' },
        { key: 'abutTeeth', label: 'Зубы', type: 'toothSet', sub: true, compact: true, show: (p) => !!p.abut,
          auto: (teeth, p) => sorted(teeth).filter((t) => !(p.fdm && (p.fdmTeeth || []).includes(t))),
          autoText: (p) => (p.fdm ? 'имплантаты без формирователя' : 'все имплантаты') },
        ...IMPL_GRAFT.params,
      ],
      check: (p, teeth, X) => {
        const out = [];
        if (!teeth.length) out.push({ lvl: 'bad', text: 'Отметьте зубы имплантатов' });
        if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' });
        IMPL_EXT.check(p, teeth, X, out);
        const F = p.fdm ? sorted(p.fdmTeeth) : [], A = p.abut ? sorted(p.abutTeeth) : [];
        if (p.fdm && !F.length) out.push({ lvl: 'bad', text: 'Формирователь десны: отметьте зубы' });
        if (p.abut && !A.length) out.push({ lvl: 'bad', text: 'Абатмент: отметьте зубы' });
        F.filter((t) => A.includes(t)).forEach((t) => out.push({ lvl: 'bad', text: 'Зуб ' + fmt(t) + ': отмечены и формирователь, и абатмент' }));
        const foreign = uniq(F.concat(A)).filter((t) => !teeth.includes(t));
        if (foreign.length) out.push({ lvl: 'warn', text: 'Формирователь / абатмент на ' + foreign.map(fmt).join(', ') + ' — эти зубы не отмечены как имплантаты' });
        IMPL_GRAFT.check(p, teeth, X, out);
        return out;
      },
      build: (p, teeth) => {
        const L = [surgVisitLine(p)];
        anestLines(p, L);
        if (p.iso) L.push({ id: 9, qty: 1 });
        guideLines(p, teeth, L);
        IMPL_EXT.lines(p, L);
        push(L, teethLine(IMPL_SYS[p.sys] || 212, sorted(teeth)));
        IMPL_GRAFT.lines(p, L);
        if (p.fdm) push(L, teethLine(215, sorted(p.fdmTeeth)));
        if (p.abut) push(L, teethLine(ABUT[p.abut], sorted(p.abutTeeth)));
        IMPL_GRAFT.soft(p, L);
        sutLines(p, L);
        return L;
      },
    },
  ];

  globalThis.SQNSMZ_SERVICES = { SVC, CATS, SCENARIOS, SECTIONS: { ANEST, SUTURES, EXTRACT, GRAFT }, _test: { anestDefaults, canalsDefault, fillSvc, perToothLines, splitCounts, guideLines } };
})();
