/* SQNS · Помощник медзаписи — ОРТОПЕДИЯ во вкладке «Услуги».
 * Подключается после services.js: добавляет услуги в SVC, сценарий «Ортопедия» в SCENARIOS
 * и новый тип поля orthoMap (рисованная формула с кистями) в SQNSMZ_SERVICES.TYPES — его рисует svc-engine.js.
 *
 * Зуб на формуле — набор слоёв: корень (свой / нет / имплантат + супраструктура), основа (культевая вкладка),
 * постоянная (коронка, промежуточная, винир, керам. вкладка), временная, керамическая десна, «снять», зуб в съёмном протезе.
 * Новая кисть меняет только свой слой. Мост — цепочка соседних зубов, соединённых перемычками.
 * Формула SQNS — только подсказка: из неё берутся имплантаты, отсутствующие зубы и уже стоящие конструкции (серым).
 */
(function () {
  'use strict';
  const D = globalThis.SQNSMZ_SERVICES;
  if (!D) { console.error('[Медзапись] ortho.js: services.js не загружен'); return; }
  const { SVC, SCENARIOS, SECTIONS } = D;

  /* ---------------- услуги прайса (id = колонка «№») ---------------- */
  const S = (id, code, name, term) => { SVC[id] = { code, name, term }; };
  S(6, 'B01.066.001', 'Приём ортопеда первичный', 'врача-стоматолога-ортопеда первичный');
  S(7, 'B01.066.001', 'Приём ортопеда первичный с планом лечения', 'врача-стоматолога-ортопеда первичный');
  S(8, 'B01.066.002', 'Приём ортопеда повторный', 'врача-стоматолога-ортопеда повторный');
  S(11, 'A02.07.001', 'Ретракция десневого края (1 зуб)', 'ретракция десневого края');
  S(12, 'A02.07.001', 'Двойная ретракция десневого края (1 зуб)', 'двойная ретракция');
  S(70, 'A16.07.053', 'Снятие коронки штампованной (1 ед.)', 'штампованной, 1 ед');
  S(71, 'A16.07.053', 'Снятие коронки цельнолитой / МК (1 ед.)', 'Снятие несъемной ортопедической');
  S(76, 'A16.07.094', 'Удаление стекловолоконного штифта', 'Удаление внутриканального');
  S(77, 'A16.07.094', 'Удаление металлического штифта', 'Удаление внутриканального');
  S(78, 'A16.07.094', 'Удаление культевой вкладки', 'Удаление внутриканального');
  S(79, 'A02.07.010', 'Оттиск альгинатный (1 челюсть)', 'Снятие оттиска');
  S(80, 'A02.07.010', 'Оттиск силиконовый (1 челюсть)', 'Снятие оттиска');
  S(81, 'A02.07.010', 'Цифровой оттиск, 3D-скан (1 челюсть)', 'Снятие оттиска');
  S(82, 'A23.07.002.052', 'Контрольная модель с цоколем', 'контрольной модели');
  S(83, 'A02.07.010', 'Wax-up (1 зуб)', 'восковой моделировкой');
  S(84, 'A02.07.010', 'Wax-up / 3D-печать (1 челюсть)', 'восковой моделировкой');
  S(85, 'A16.07.004', 'Временная коронка пластмассовая, лаб. (1 ед.)', 'коронкой (временной');
  S(86, 'A16.07.004', 'Временная коронка пластмассовая в полости рта (1 ед.)', 'коронкой (временной');
  S(87, 'A16.07.004', 'Временная коронка пластмассовая со штифтом (1 ед.)', 'коронкой (временной');
  S(89, 'A16.07.004', 'Временная коронка PMMA, лаб. (1 ед.)', 'коронкой (временной');
  S(90, 'A16.07.004', 'Временная коронка металлопластмассовая (1 ед.)', 'коронкой (временной');
  S(91, 'A16.07.005', 'Временная промежуточная часть пластмассовая (1 ед.)', 'промежуточной части временной');
  S(92, 'A16.07.005', 'Временная промежуточная часть металлопластмассовая (1 ед.)', 'промежуточной части временной');
  S(93, 'A16.07.003', 'Временный винир — mockup (1 ед.)', 'виниром временным');
  S(94, 'A16.07.003', 'Временный винир, лаб. (1 ед.)', 'виниром временным');
  S(95, 'A16.07.003', 'Культевая вкладка неразборная в полости рта', 'вкладкой культевой');
  S(96, 'A16.07.003', 'Культевая вкладка неразборная, лаб.', 'вкладкой культевой');
  S(97, 'A16.07.003', 'Культевая вкладка разборная', 'вкладкой культевой');
  S(98, 'A16.07.003', 'Культевая вкладка из оксида циркония', 'вкладкой культевой');
  S(99, 'A16.07.003', 'Культевая вкладка композитная на СВШ', 'вкладкой культевой');
  S(240, 'A16.07.003', 'Культевая вкладка из драгоценных металлов', 'вкладкой культевой');
  S(100, 'A16.07.004', 'Коронка цельнолитая (1 ед.)', 'коронкой (цельнолитой');
  S(101, 'A16.07.004', 'Коронка МК без плечевой массы (1 ед.)', 'коронкой (металлокерамической');
  S(102, 'A16.07.004', 'Коронка МК с плечевой массой (1 ед.)', 'коронкой (металлокерамической');
  S(103, 'A16.07.004', 'Коронка МК на ЛСП без плечевой массы (1 ед.)', 'коронкой (металлокерамической');
  S(104, 'A16.07.004', 'Коронка МК на ЛСП с плечевой массой (1 ед.)', 'коронкой (металлокерамической');
  S(105, 'A16.07.004', 'Искусственная керамическая десна (1 ед.)', 'керамической десны');
  S(106, 'A16.07.004', 'Коронка из диоксида циркония (1 ед.)', 'коронкой (на основе диоксида');
  S(107, 'A16.07.004', 'Коронка цирконий с керамическим нанесением (1 ед.)', 'с керамическим нанесением');
  S(108, 'A16.07.004', 'Коронка цельнокерамическая E-max (1 ед.)', 'E-Max');
  S(109, 'A16.07.003', 'Винир керамический (1 ед.)', 'виниром керамическим');
  S(110, 'A16.07.003', 'Вкладка керамическая (1 ед.)', 'вкладкой керамической');
  S(111, 'A16.07.005', 'Промежуточная часть цельнолитая (1 ед.)', 'использование промежуточной части');
  S(112, 'A16.07.005', 'Промежуточная часть МК (1 ед.)', 'использование промежуточной части');
  S(113, 'A16.07.005', 'Промежуточная часть МК на ЛСП (1 ед.)', 'использование промежуточной части');
  S(114, 'A16.07.005', 'Промежуточная часть из диоксида циркония (1 ед.)', 'использование промежуточной части');
  S(115, 'A16.07.005', 'Промежуточная часть цирконий с керамикой (1 ед.)', 'использование промежуточной части');
  S(116, 'A16.07.005', 'Стекловолоконный адгезивный протез (1 ед.)', 'стекловолоконного адгезивного');
  S(118, 'A16.07.006', 'Титановое основание (1 ед.)', 'титанового основания');
  S(120, 'A16.07.006', 'Абатмент индивидуальный (1 ед.)', 'индивидуального моделируемого');
  S(122, 'A16.07.006', 'Абатмент индивидуальный из оксида циркония (1 ед.)', 'индивидуального моделируемого');
  S(124, 'A16.07.006', 'Мультиюнит', 'мультиюнита');
  S(125, 'A16.07.006', 'Титановая балка на 4 имплантатах', 'титановой балки');
  S(126, 'A16.07.006', 'Титановая балка на 6 имплантатах', 'титановой балки');
  S(127, 'A16.07.006', 'Шариковый абатмент (1 ед.)', 'шарикового абатмента');
  S(128, 'A16.07.006', 'Ретенционный колпачок / кольцо O-Ring (1 ед.)', 'O-Ring');
  S(129, 'A16.07.006', 'Временная коронка на имплантате пластмассовая', 'использованием имплантата (коронкой');
  S(130, 'A16.07.006', 'Временная коронка на имплантате, винтовая', 'использованием имплантата (коронкой');
  S(131, 'A16.07.006', 'Временная коронка на имплантате PMMA', 'использованием имплантата (коронкой');
  S(132, 'A16.07.006', 'Временная коронка на имплантате металлопластмассовая', 'использованием имплантата (коронкой');
  S(133, 'A16.07.006', 'Коронка на имплантате МК', 'использованием имплантата (коронкой');
  S(134, 'A16.07.006', 'Коронка на имплантате цирконий (цементная)', 'использованием имплантата (керамической');
  S(136, 'A16.07.006', 'Коронка на имплантате цирконий, винтовая', 'использованием имплантата (коронкой');
  S(137, 'A16.07.006', 'Полный несъёмный акриловый протез на имплантатах, 1 кат.', 'полным несъемным');
  S(138, 'A16.07.006', 'Полный несъёмный акриловый протез на имплантатах, 2 кат.', 'полным несъемным');
  S(139, 'A16.07.006', 'Полный несъёмный протез из циркония на имплантатах, 1 кат.', 'полным несъемным');
  S(140, 'A16.07.006', 'Полный несъёмный протез из циркония на имплантатах, 2 кат.', 'полным несъемным');
  S(142, 'A16.07.023', 'Полный съёмный протез на балочной фиксации, 1 кат.', 'балочной фиксации');
  S(143, 'A16.07.023', 'Полный съёмный протез на балочной фиксации, 2 кат.', 'балочной фиксации');
  S(144, 'A16.07.023', 'Покрывной протез на шаровидных абатментах', 'шаровидных абатментах');
  S(146, 'A16.07.023', 'Условно-съёмный акриловый протез all-on-4', 'all-on-4');
  S(149, 'A16.07.035', 'Частичный съёмный пластиночный протез (1–3 зуба)', 'частичными съемными пластиночными');
  S(150, 'A16.07.035', 'Частичный иммедиат-протез (4–13 зубов)', 'иммедиат-протез 4-13');
  S(151, 'A16.07.035', 'Частичный съёмный пластиночный протез (4–13 зубов)', 'частичными съемными пластиночными');
  S(152, 'A16.07.035', 'Частичный акриловый протез с нейлоновыми кламмерами', 'нейлоновыми кламмерами 1 протез');
  S(153, 'A23.07.002.009', 'Частичный протез из термопласта (1–3 зуба)', 'термопластического материала');
  S(154, 'A23.07.002.009', 'Частичный протез из термопласта (4–13 зубов)', 'термопластического материала');
  S(155, 'A16.07.023', 'Индивидуальная ложка', 'индивидуальной ложки');
  S(156, 'A16.07.023', 'Полный съёмный иммедиат-протез', 'иммедиат-протез 1ед');
  S(157, 'A16.07.023', 'Полный съёмный пластиночный протез', 'полными съемными пластиночными протезами (1ед');
  S(158, 'A23.07.002.009', 'Полный протез из термопласта', 'термопластического материала');
  S(159, 'A16.07.023', 'Армирование протеза', 'армирование');
  S(160, 'A16.07.023', 'Цельнолитой металлический базис', 'металлический базис');
  S(161, 'A16.07.036', 'Бюгельный протез с литыми кламмерами', 'бюгельными протезами');
  S(162, 'A16.07.036', 'Бюгельный протез с литыми кламмерами и литым базисом', 'бюгельными протезами');
  S(163, 'A16.07.036', 'Бюгельный протез с литыми кламмерами на ЛСП', 'бюгельными протезами');
  S(164, 'A16.07.036', 'Бюгельный протез с нейлоновыми кламмерами', 'бюгельными протезами');
  S(165, 'A16.07.036', 'Бюгельный протез с термопластическим базисом', 'бюгельными протезами');
  S(166, 'A16.07.036', 'Бюгельный протез шинирующий', 'бюгельными протезами');
  S(167, 'A16.07.036', 'Бюгельный протез с замковыми креплениями', 'бюгельными протезами');
  S(168, 'A16.07.036', 'Бюгельный протез с замковыми креплениями на ЛСП', 'бюгельными протезами');
  S(169, 'A23.07.002.046', 'Замковое крепление — аттачмент (1 ед.)', 'замкового крепления');
  S(170, 'A23.07.002.046', 'Замковое крепление «МК», «Рейн» (1 ед.)', 'замкового крепления');

  /* ---------------- материалы, кисти ---------------- */
  const o = (v, l) => ({ v, l });
  // g — группа цвета: zr цирконий, em E-max/керамика, mk металлокерамика, metal металл, comp композит
  const MAT = {
    zr: { l: 'цирконий', g: 'zr' }, zrc: { l: 'цирконий + керамика', g: 'zr' }, em: { l: 'E-max', g: 'em' },
    mkp: { l: 'МК с плечом', g: 'mk' }, mk: { l: 'МК', g: 'mk' }, mklp: { l: 'МК на ЛСП с плечом', g: 'mk' }, mkl: { l: 'МК на ЛСП', g: 'mk' },
    cl: { l: 'цельнолитая', g: 'metal' }, adh: { l: 'адгезивный стекловолоконный', g: 'comp' },
  };
  const CROWN = { cl: 100, mk: 101, mkp: 102, mkl: 103, mklp: 104, zr: 106, zrc: 107, em: 108 };
  const PONT = { cl: 111, mk: 112, mkp: 112, mkl: 113, mklp: 113, zr: 114, zrc: 115, adh: 116 };
  const CORE = { mouth: 95, nrz: 96, razb: 97, zr: 98, svsh: 99, gold: 240 };
  const CORE_G = { mouth: 'metal', nrz: 'metal', razb: 'metal', gold: 'metal', zr: 'zr', svsh: 'comp' };
  const CORE_L = { mouth: 'вкладка в полости рта', nrz: 'вкладка неразборная', razb: 'вкладка разборная', zr: 'вкладка из циркония', svsh: 'вкладка на СВШ', gold: 'вкладка из драгметалла' };
  const TEMP_T = { mouth: 86, lab: 85, post: 87, pmma: 89, mp: 90, scr: 86, vmock: 93, vlab: 94 };
  const TEMP_I = { mouth: 129, lab: 129, post: 129, scr: 130, pmma: 131, mp: 132 };
  const TEMP_L = { mouth: 'временная в полости рта', lab: 'временная лаб.', post: 'временная со штифтом', pmma: 'временная PMMA', mp: 'временная металлопластмассовая', scr: 'временная винтовая', vmock: 'mockup', vlab: 'временный винир' };
  const TAKE = { st: 70, mk: 71, fib: 76, met: 77, core: 78 };
  const TAKE_L = { st: 'снять штампованную', mk: 'снять цельнолитую / МК', fib: 'удалить СВШ', met: 'удалить металл. штифт', core: 'удалить вкладку' };
  const SUP_L = { tb: 'Ti-основание', mu: 'мультиюнит', zab: 'цирк. абатмент', ind: 'инд. абатмент' };
  const crownOpts = [o('zr', 'Цирконий'), o('zrc', 'Цирконий + керамика'), o('em', 'E-max'), o('mkp', 'МК с плечом'), o('mk', 'МК без плеча'), o('mklp', 'МК на ЛСП с плечом'), o('mkl', 'МК на ЛСП'), o('cl', 'Цельнолитая')];
  const BRUSHES = [
    { k: 'crown', l: 'Коронка', o: crownOpts },
    { k: 'bridge', l: 'Мост', o: crownOpts.filter((x) => x.v !== 'em') },
    { k: 'pont', l: 'Промежуточная', o: [o('zr', 'Цирконий'), o('zrc', 'Цирконий + керамика'), o('mk', 'МК'), o('mkl', 'МК на ЛСП'), o('cl', 'Цельнолитая'), o('adh', 'Адгезивный стекловолоконный')] },
    { k: 'core', l: 'Вкладка', o: [o('svsh', 'Композит на СВШ'), o('mouth', 'В полости рта'), o('nrz', 'Неразборная (лаб.)'), o('razb', 'Разборная'), o('zr', 'Цирконий'), o('gold', 'Драгметалл')] },
    { k: 'ven', l: 'Винир / вкладка', o: [o('ven', 'Винир керамический'), o('inl', 'Вкладка керамическая')] },
    { k: 'temp', l: 'Временная', o: [o('lab', 'Пластмасса (лаб.)'), o('mouth', 'Пластмасса (в полости рта)'), o('pmma', 'PMMA'), o('mp', 'Металлопластмасса'), o('post', 'Со штифтом'), o('scr', 'Винтовая (имплантат)'), o('vlab', 'Винир временный (лаб.)')] },
    { k: 'icrown', l: 'На имплантате', o: [o('zr|tb', 'Цирконий (Ti-основание)'), o('zr|mu', 'Цирконий (мультиюнит)'), o('zr|zab', 'Цирконий (вклеиваемая)'), o('mk|ind', 'МК (инд. абатмент)')] },
    { k: 'take', l: 'Снять', o: [o('mk', 'Коронку цельнолитую / МК'), o('st', 'Коронку штампованную'), o('core', 'Культевую вкладку'), o('fib', 'Штифт СВШ'), o('met', 'Штифт металлический')] },
    { k: 'gum', l: 'Керам. десна', o: [o('on', '1 ед. на зуб')] },
    { k: 'rem', l: 'Зуб в протезе', o: [o('on', 'Частичный съёмный')] },
    { k: 'erase', l: 'Ластик', o: [o('all', 'Очистить зуб')], icon: true },
  ];

  /* ---------------- зубы, челюсти, соседи ---------------- */
  const r = (a, n, d) => Array.from({ length: n }, (_, i) => String(a + d * i));
  const SEQ = { U: r(18, 8, -1).concat(r(21, 8, 1)), L: r(48, 8, -1).concat(r(31, 8, 1)) };
  const JAW_N = { U: 'ВЧ', L: 'НЧ' };
  const jawOf = (t) => (/^[12]/.test(t) ? 'U' : 'L');
  const fmt = (t) => t[0] + '.' + t[1];
  const fmtL = (a) => a.map(fmt).join(', ');
  const lk = (a, b) => { const s = SEQ[jawOf(a)]; return s.indexOf(a) < s.indexOf(b) ? a + '-' + b : b + '-' + a; };
  const next = (t) => { const s = SEQ[jawOf(t)], i = s.indexOf(t); return s[i + 1] || null; };
  const prev = (t) => { const s = SEQ[jawOf(t)], i = s.indexOf(t); return i > 0 ? s[i - 1] : null; };
  const get = (M, t) => (M.t[t] = M.t[t] || { root: 'nat' });
  const peek = (M, t) => M.t[t] || { root: 'nat' };
  const hasFix = (x) => !!(x.perm && (x.perm.k === 'crown' || x.perm.k === 'pont'));
  const lossOn = (p, J) => !!(p && p['loss' + J]);

  // цепочки соединённых зубов: [{ teeth, abut, pont }]
  function chains(M) {
    const out = [];
    ['U', 'L'].forEach((J) => {
      let cur = null;
      SEQ[J].forEach((t, i) => {
        const pv = SEQ[J][i - 1];
        if (cur && pv && M.links[lk(pv, t)]) cur.push(t);
        else { if (cur && cur.length > 1) out.push(cur); cur = [t]; }
      });
      if (cur && cur.length > 1) out.push(cur);
    });
    return out.map((ch) => ({ teeth: ch, abut: ch.filter((t) => (peek(M, t).perm || {}).k === 'crown'), pont: ch.filter((t) => (peek(M, t).perm || {}).k === 'pont') }));
  }
  const chainOf = (M, t) => chains(M).find((c) => c.teeth.includes(t)) || null;
  // перемычка остаётся только между зубами с коронкой / промежуточной
  function cleanLinks(M) {
    Object.keys(M.links).forEach((k) => { const [a, b] = k.split('-'); if (!M.links[k] || !hasFix(peek(M, a)) || !hasFix(peek(M, b))) delete M.links[k]; });
  }
  const implTeeth = (M, J) => SEQ[J].filter((t) => peek(M, t).root === 'impl').sort();
  // Полная потеря на имплантатах: имплантаты не рисуются кистью — врач задаёт количество (2–8), схема расставляет сама:
  // 2 — четвёрки, 3–4 — + двойки, 5–6 — + шестёрки, 7–8 — + семёрки. Если в формуле SQNS ровно столько имплантатов — берём их места.
  const POS = { U: ['14', '24', '12', '22', '16', '26', '17', '27'], L: ['44', '34', '42', '32', '46', '36', '47', '37'] };
  const lossImpl = (p, J) => lossOn(p, J) && (p['lk' + J] === 'rem' || p['lk' + J] === 'fix');
  const formImpl = (M, J) => (M ? SEQ[J].filter((t) => { const x = peek(M, t); return x.known && x.root === 'impl' && !x.uImpl; }) : []);
  const lossN = (p, J) => Math.max(2, Math.min(8, +p['ln' + J] || 4));
  function implPos(p, J) {
    if (!lossImpl(p, J)) return [];
    const n = lossN(p, J), fi = formImpl(p.omap, J);
    return (fi.length === n ? fi : POS[J].slice(0, n)).slice().sort();
  }
  // что стоит на имплантате при полной потере: tb / mu / bar / ball (смешанные Ti + мульты — мульты на последних по порядку местах)
  function lossSup(p, J, t) {
    const k = p['lk' + J];
    if (k === 'rem') return p['lr' + J] === 'ball' ? 'ball' : p['lr' + J] === 'bar' ? 'bar' : null;
    const s2 = p['lsup' + J];
    if (s2 !== 'mix') return s2 || null;
    const it = implPos(p, J), order = POS[J].filter((x) => it.includes(x)).concat(it.filter((x) => !POS[J].includes(x)));
    const mu = muN(p, J);
    return order.indexOf(t) >= order.length - mu ? 'mu' : 'tb';
  }
  const muN = (p, J) => Math.max(1, Math.min(lossN(p, J) - 1, +p['lmuN' + J] || 1));
  const remTeeth = (M, J) => SEQ[J].filter((t) => peek(M, t).rem).sort();
  // мост на имплантатах: хотя бы одна опора — имплантат
  const implBridge = (M, ch) => !!ch && ch.abut.some((a) => peek(M, a).root === 'impl');

  /* ---------------- кисти: изменение формулы ---------------- */
  function paint(M, t, k, v, p) {
    const x = get(M, t), J = jawOf(t);
    if (lossOn(p, J) && !['take', 'erase'].includes(k)) return 'На ' + JAW_N[J] + ' включена полная потеря зубов: конструкция и количество имплантатов — в блоке «Полная потеря зубов»; на схеме работают только «Снять» и «Ластик»';
    if (k !== 'bridge') M.anchor = null;
    if (k === 'crown') { x.perm = { k: 'crown', m: v }; delete x.rem; if (x.root === 'none') x.root = 'nat'; if (x.root === 'impl') x.sup = (MAT[v] || {}).g === 'mk' ? 'ind' : (x.sup && x.sup !== 'ind' ? x.sup : 'tb'); }
    if (k === 'pont') {
      x.perm = { k: 'pont', m: v }; delete x.rem; delete x.core; delete x.sup;
      if (x.root !== 'none') x.root = 'none';
      [prev(t), next(t)].forEach((n) => { if (n && hasFix(peek(M, n))) M.links[lk(t, n)] = true; });
    }
    if (k === 'bridge') {
      if (!M.anchor || jawOf(M.anchor) !== J) { M.anchor = t; return ''; }
      if (M.anchor === t) { M.anchor = null; return ''; }
      const s = SEQ[J], a = s.indexOf(M.anchor), b = s.indexOf(t), span = s.slice(Math.min(a, b), Math.max(a, b) + 1);
      span.forEach((u, i) => {
        const y = get(M, u), end = i === 0 || i === span.length - 1;
        const abut = end || y.root === 'impl' || (y.known && y.root === 'nat');
        delete y.rem;
        if (abut) { y.perm = { k: 'crown', m: v }; if (y.root === 'none') y.root = 'nat'; }
        else { y.perm = { k: 'pont', m: v }; y.root = 'none'; delete y.core; delete y.sup; }
        if (i) M.links[lk(span[i - 1], u)] = true;
      });
      M.anchor = null;
    }
    if (k === 'core') { if (x.root === 'impl') return 'На имплантат вкладка не ставится'; x.core = v; if (x.root === 'none') x.root = 'nat'; if (x.perm && x.perm.k === 'pont') delete x.perm; }
    if (k === 'ven') { x.perm = { k: v, m: 'em' }; delete x.rem; if (x.root === 'none') x.root = 'nat'; }
    if (k === 'temp') x.temp = x.temp === v ? null : v;
    // коронка на имплантате: имплантат подразумевается (стоит или будет); на челюсти с полной потерей — только отметить имплантат
    if (k === 'icrown') {
      const [m, sup] = v.split('|');
      if (lossOn(p, J)) {
        if (x.root === 'impl') { if (x.uImpl) { x.root = 'none'; delete x.sup; delete x.uImpl; } else return 'Имплантат ' + fmt(t) + ' есть в формуле пациента'; }
        else { x.root = 'impl'; x.sup = sup; x.uImpl = true; }
      } else if (x.root === 'impl' && x.perm && x.perm.k === 'crown' && x.perm.m === m && x.sup === sup) {
        delete x.perm; if (x.uImpl) { x.root = 'none'; delete x.sup; delete x.uImpl; }
      } else {
        if (x.root !== 'impl') x.uImpl = true;
        x.root = 'impl'; x.sup = sup; x.perm = { k: 'crown', m }; delete x.core; delete x.rem; delete x.gum;
      }
    }
    if (k === 'take') { const a = x.take || []; x.take = a.includes(v) ? a.filter((y) => y !== v) : a.concat(v); }
    if (k === 'gum') x.gum = !x.gum;
    if (k === 'rem') { x.rem = !x.rem; if (x.rem) { delete x.perm; delete x.temp; delete x.core; delete x.gum; if (x.root === 'nat') x.root = 'none'; } }
    if (k === 'erase') { eraseLayer(x, 'all'); eraseLayer(x, 'impl'); }
    cleanLinks(M);
    return '';
  }
  function eraseLayer(x, v) {
    if (v === 'all') { ['perm', 'temp', 'core', 'take', 'gum', 'rem'].forEach((y) => delete x[y]); }
    else if (v === 'impl') { if (x.root === 'impl' && x.uImpl) { x.root = x.known ? 'nat' : 'none'; delete x.sup; delete x.uImpl; } }
    else delete x[v];
  }

  /* ---------------- формула SQNS → подсказки на схеме ---------------- */
  // info: { 'зуб': ['участок:состояние', …] } или null (формулы нет)
  function loadFormula(M, info) {
    M.loaded = true; M.noF = !info;
    if (!info) return;
    ['U', 'L'].forEach((J) => SEQ[J].forEach((t) => {
      const st = info[t] || [], x = get(M, t), has = (s) => st.includes(s);
      const impl = st.some((s) => /^implantation\w*:dental_implantation$/.test(s));
      x.known = true;
      x.ex = { crown: has('crown:artificial_crown'), pont: has('crown:bridge_intermediate'), core: has('crown:stump_crown'), temp: has('crown:temporary_crown') };
      if (x.uImpl || x.perm || x.rem) { if (impl && x.root !== 'impl') { x.root = 'impl'; x.sup = x.sup || 'tb'; } return; }
      if (impl) { x.root = 'impl'; x.sup = x.sup || 'tb'; }
      else if (has('default:removed') || x.ex.pont) x.root = 'none';
      else x.root = 'nat';
    }));
  }
  function unloadFormula(M) {
    M.loaded = false; M.noF = false;
    Object.keys(M.t).forEach((t) => {
      const x = M.t[t]; delete x.known; delete x.ex;
      if (x.root === 'impl' && !x.uImpl) { x.root = (x.perm && x.perm.k === 'pont') || x.rem ? 'none' : 'nat'; delete x.sup; }
      else if (x.root === 'none' && !(x.perm && x.perm.k === 'pont') && !x.rem) x.root = 'nat';
    });
  }
  // челюсть без своих зубов по формуле → включаем «Полную потерю»
  const autoLoss = (p, J) => { const M = p.omap; return !!(M && M.loaded && !M.noF && SEQ[J].every((t) => { const x = peek(M, t); return x.known && x.root !== 'nat'; })); };

  /* ---------------- расчёт услуг ---------------- */
  // виниры на формуле (для Wax-up и mockup под формулой)
  const venTeeth = (p) => { const M = p.omap; return M ? Object.keys(M.t).filter((t) => !lossOn(p, jawOf(t)) && (M.t[t].perm || {}).k === 'ven').sort() : []; };
  // зубы, которые препарируем (для анестезии по умолчанию)
  const prepTeeth = (p) => { const M = p.omap; if (!M) return []; return Object.keys(M.t).filter((t) => { const x = M.t[t]; return !lossOn(p, jawOf(t)) && x.root === 'nat' && x.perm && x.perm.k !== 'pont'; }).sort(); };
  // проблемы и строки по зубам: add(id, зуб)
  function toothWork(p, add, out) {
    const M = p.omap; if (!M) return;
    const CH = chains(M);
    Object.keys(M.t).sort().forEach((t) => {
      const x = M.t[t], J = jawOf(t), Z = 'Зуб ' + fmt(t) + ': ';
      (x.take || []).forEach((v) => add(TAKE[v], t));
      if (lossOn(p, J)) return;                                   // челюсть — полная потеря: считается блоком челюсти
      if (x.core) add(CORE[x.core], t);
      const ch = CH.find((c) => c.teeth.includes(t)), onImpl = x.root === 'impl';
      const pm = x.perm;
      if (pm) {
        const g = (MAT[pm.m] || {}).g;
        if (pm.k === 'crown' && onImpl) {
          if (g === 'zr') { if (x.sup === 'zab') { add(134, t); add(122, t); } else { add(136, t); add(x.sup === 'mu' ? 124 : 118, t); } }
          else if (g === 'mk') { add(133, t); add(120, t); }
          else out.push({ lvl: 'bad', text: Z + 'коронки на имплантате «' + MAT[pm.m].l + '» нет в прайсе' });
        } else if (pm.k === 'crown') add(CROWN[pm.m], t);
        else if (pm.k === 'pont') {
          if (!ch || !ch.abut.length) out.push({ lvl: 'bad', text: Z + 'промежуточная часть без опоры — соедините с соседней коронкой' });
          if (ch && implBridge(M, ch)) {
            if (g === 'zr') add(ch.abut.some((a) => peek(M, a).sup === 'zab') ? 134 : 136, t);
            else if (g === 'mk') add(133, t);
            else out.push({ lvl: 'bad', text: Z + 'промежуточной «' + MAT[pm.m].l + '» в мосту на имплантатах нет в прайсе' });
          } else if (PONT[pm.m]) add(PONT[pm.m], t);
          else out.push({ lvl: 'bad', text: Z + 'промежуточной части «' + MAT[pm.m].l + '» нет в прайсе' });
          if (ch && ch.abut.length && ch.abut.some((a) => (MAT[(peek(M, a).perm || {}).m] || {}).g !== g)) out.push({ lvl: 'warn', text: Z + 'материал промежуточной не совпадает с опорами' });
        } else if (pm.k === 'ven') add(109, t);
        else if (pm.k === 'inl') add(110, t);
      }
      if (x.temp) {
        const v = x.temp, ib = onImpl || (pm && pm.k === 'pont' && ch && implBridge(M, ch));
        if (ib) { if (TEMP_I[v]) add(TEMP_I[v], t); else out.push({ lvl: 'bad', text: Z + 'временный винир на имплантате невозможен' }); }
        else if (pm && pm.k === 'pont') add(v === 'mp' ? 92 : 91, t);
        else add(TEMP_T[v], t);
      }
      if (x.gum) add(105, t);
    });
  }
  const ORDER = [70, 71, 76, 77, 78, 95, 96, 97, 98, 99, 240, 85, 86, 87, 89, 90, 91, 92, 93, 94, 129, 130, 131, 132,
    100, 101, 102, 103, 104, 106, 107, 108, 109, 110, 111, 112, 113, 114, 115, 116, 133, 134, 136, 118, 124, 122, 120, 105];
  const partLine = (p, J, tt) => {
    const n = tt.length, k = p['pk' + J];
    if (k === 'plast') return n <= 3 ? 149 : 151;
    if (k === 'imm') return 150;
    if (k === 'nylon') return 152;
    if (k === 'thermo') return n <= 3 ? 153 : 154;
    if (k === 'bug') return +p['pb' + J] || 161;
    return null;
  };
  function build(p) {
    const L = [], M = p.omap || { t: {}, links: {} };
    [[6, 'v1p'], [7, 'v1pp'], [8, 'v2']].forEach(([id, k]) => { if (+p[k] > 0) L.push({ id, qty: +p[k] }); });
    [9, 10].forEach((id) => { if (+(p.isoS || {})[id] > 0) L.push({ id, qty: +p.isoS[id] }); });
    if (p.anest && p.appl) L.push({ id: 13, qty: 1 });
    if (p.anest && +p.infil > 0) L.push({ id: 14, qty: +p.infil });
    if (p.anest && +p.cond > 0) L.push({ id: 15, qty: +p.cond });
    const vt = venTeeth(p), vq = (n) => (n === vt.length ? vt : undefined);
    if (vt.length && p.vwax && +p.waxV > 0) L.push({ id: 83, qty: +p.waxV, teeth: vq(+p.waxV) });
    if (vt.length && p.vmock && +p.mockN > 0) L.push({ id: 93, qty: +p.mockN, teeth: vq(+p.mockN) });
    [[79, 'alg'], [80, 'sil'], [81, 'scan'], [82, 'model'], [83, vt.length ? '' : 'waxT'], [84, 'waxJ'], [11, 'retr'], [12, 'retr2']].forEach(([id, k]) => { if (k && +p[k] > 0) L.push({ id, qty: +p[k] }); });
    const map = {};
    toothWork(p, (id, t) => { if (!id) return; (map[id] = map[id] || []).push(t); }, []);
    Object.keys(map).map(Number).sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)).forEach((id) => { const tt = [...new Set(map[id])].sort(); L.push({ id, qty: map[id].length, teeth: tt }); });
    // частичный съёмный — по челюстям
    ['U', 'L'].forEach((J) => {
      if (lossOn(p, J)) return;
      const tt = remTeeth(M, J); if (!tt.length) return;
      const id = partLine(p, J, tt); if (id) L.push({ id, qty: 1, teeth: tt });
      const k = p['pk' + J];
      if (p['parm' + J] && (k === 'plast' || k === 'imm')) L.push({ id: 159, qty: 1 });
      if (p['pbase' + J] && k === 'plast') L.push({ id: 160, qty: 1 });
      if (k === 'bug' && +p['plk' + J] > 0) L.push({ id: 169, qty: +p['plk' + J] });
      if (k === 'bug' && +p['plk2' + J] > 0) L.push({ id: 170, qty: +p['plk2' + J] });
    });
    // полная потеря — по челюстям
    ['U', 'L'].forEach((J) => {
      if (!lossOn(p, J)) return;
      const k = p['lk' + J], it = implPos(p, J), q = (id) => L.push({ id, qty: 1, teeth: it.length ? it : undefined });
      if (k === 'full') {
        L.push({ id: +p['lf' + J] || 157, qty: 1 });
        if (p['larm' + J]) L.push({ id: 159, qty: 1 });
        if (p['lbase' + J]) L.push({ id: 160, qty: 1 });
        if (p['lspoon' + J]) L.push({ id: 155, qty: 1 });
      }
      if ((k === 'rem' || k === 'fix') && p['lspoonR' + J]) L.push({ id: 155, qty: 1 });
      if (k === 'rem' && p['lr' + J] === 'bar') { q(p['lc' + J] === '2' ? 143 : 142); if (p['lb' + J]) q(p['lb' + J] === '6' ? 126 : 125); }
      if (k === 'rem' && p['lr' + J] === 'ball') { q(144); if (it.length) L.push({ id: +p['ls' + J] || 127, qty: it.length, teeth: it }); }
      if (k === 'fix') {
        const m = p['lm' + J];
        q(m === 'a4' ? 146 : m === 'ac' ? (p['lc' + J] === '2' ? 138 : 137) : (p['lc' + J] === '2' ? 140 : 139));
        const sp = p['lsup' + J], n = it.length;
        if (sp === 'bar') { if (p['lb' + J]) q(p['lb' + J] === '6' ? 126 : 125); }
        else if (sp === 'tb') L.push({ id: 118, qty: n, teeth: it });
        else if (sp === 'mu') L.push({ id: 124, qty: n, teeth: it });
        else if (sp === 'mix') {
          const tb = it.filter((t) => lossSup(p, J, t) === 'tb'), mu = it.filter((t) => lossSup(p, J, t) === 'mu');
          L.push({ id: 118, qty: tb.length, teeth: tb }); L.push({ id: 124, qty: mu.length, teeth: mu });
        }
      }
    });
    return L;
  }
  function check(p) {
    const out = [], M = p.omap || { t: {}, links: {} };
    toothWork(p, () => {}, out);
    if (p.anest && !(+p.infil + +p.cond)) out.push({ lvl: 'warn', text: 'Анестезия включена, но карпул 0' });
    if (p.imp && !(+p.alg + +p.sil + +p.scan)) out.push({ lvl: 'warn', text: 'Оттиски: не указано ни одного оттиска или скана' });
    if (M.anchor) out.push({ lvl: 'warn', text: 'Мост: отметьте вторую крайнюю опору (первая — ' + fmt(M.anchor) + ')' });
    ['U', 'L'].forEach((J) => {
      const N = JAW_N[J] + ': ', it = implPos(p, J);
      if (lossOn(p, J)) {
        const k = p['lk' + J];
        if (!k) out.push({ lvl: 'bad', text: N + 'выберите конструкцию при полной потере зубов' });
        if (k === 'rem' && !p['lr' + J]) out.push({ lvl: 'bad', text: N + 'выберите фиксацию — балка или локаторы / шарики' });
        const bar = (k === 'rem' && p['lr' + J] === 'bar') || (k === 'fix' && p['lsup' + J] === 'bar'), lb = p['lb' + J];
        if (k === 'fix' && !p['lsup' + J]) out.push({ lvl: 'bad', text: N + 'выберите супраструктуры' });
        if (bar && !lb) out.push({ lvl: 'bad', text: N + 'выберите балку — на 4 или на 6 имплантатах' });
        if (bar && lb && +lb !== it.length) out.push({ lvl: 'warn', text: N + 'балка на ' + lb + ' имплантатах, а имплантатов ' + it.length });
      }
    });
    return out;
  }

  /* ---------------- запись в зубную формулу SQNS ---------------- */
  // Формат op — как в services.js (FX): { t, set: [[участок, состояние]], clear: [[участок, состояние]], wipe }.
  // Коронка на имплантате — как клик «Имплантация» в SQNS: все 4 участка имплантации + «удалён».
  const IMPL_SET = ['implantationSurface', 'implantationCrown', 'implantationImplant', 'implantationAbutment'].map((l) => [l, 'dental_implantation']).concat([['default', 'removed'], ['crown', 'removed']]);
  const CAR = [/^(crown|surface)/, /caries/];
  function formula(p) {
    const M = p.omap, ops = []; if (!M) return ops;
    Object.keys(M.t).sort().forEach((t) => {
      const x = M.t[t], J = jawOf(t), pm = x.perm, op = (o2) => ops.push(Object.assign({ t }, o2));
      (x.take || []).forEach((v) => {
        if (v === 'st' || v === 'mk') op({ clear: [['crown', 'artificial_crown']] });
        if (v === 'core') op({ clear: [['crown', 'stump_crown']] });
        if (v === 'fib' || v === 'met') op({ clear: [[/^canal/, /^(post|fiber_post|metal_post)$/], [/^root/, 'post']] });
      });
      if (lossOn(p, J)) return;
      if (x.rem) { op({ set: [['crown', 'construct_removable']] }); return; }
      if (x.root === 'impl' && (pm && pm.k === 'crown' || x.temp || x.uImpl)) op({ wipe: !!x.uImpl, set: IMPL_SET });
      if (x.core) op({ set: [['crown', 'stump_crown']] });
      if (pm && pm.k === 'crown' && x.root !== 'impl') op({ clear: [['default', 'removed'], ['crown', 'removed'], ['crown', 'temporary_crown'], ['crown', 'bridge_intermediate'], CAR], set: [['crown', 'artificial_crown']] });
      else if (pm && pm.k === 'pont') op({ clear: [['crown', 'artificial_crown'], ['crown', 'temporary_crown']], set: [['crown', 'bridge_intermediate']] });
      else if (pm && (pm.k === 'ven' || pm.k === 'inl')) op({ clear: [CAR], set: [['crown', 'indirect_restoration']] });
      else if (!pm && x.temp && x.root !== 'impl') op({ clear: [['default', 'removed'], ['crown', 'removed']], set: [['crown', 'temporary_crown']] });
    });
    // полная потеря: имплантаты на своих местах, остальные зубы челюсти — конструкция съёмная / несъёмная
    ['U', 'L'].forEach((J) => {
      if (!lossOn(p, J) || !p['lk' + J]) return;
      const it = implPos(p, J), st = p['lk' + J] === 'fix' ? 'construct_unremovable' : 'construct_removable';
      SEQ[J].forEach((t) => {
        if (it.includes(t)) { const x = peek(M, t); ops.push({ t, wipe: !(x.known && x.root === 'impl'), set: IMPL_SET }); }
        else ops.push({ t, set: [['crown', st]] });
      });
    });
    return ops;
  }

  /* ---------------- рисунок ---------------- */
  const COL = {
    nat: ['#ffffff', '#cbd5e1'], zr: ['#ecd194', '#ad8532'], em: ['#fcf5e2', '#cfb57a'], mk: ['#f7f1e6', '#a8a29e'],
    metal: ['#6b7280', '#374151'], comp: ['#d49558', '#97602c'], ex: ['#e5e7eb', '#9ca3af'], impl: ['#cbd5e1', '#64748b'],
    base: ['#fbcfe0', '#e879a6'], gum: '#f4a7b9', temp: '#475569', red: '#dc2626', ac: ['#ffffff', '#94a3b8'],
  };
  const SUP_C = { tb: '#94a3b8', mu: '#475569', zab: COL.zr[0], bar: '#64748b', ind: '#94a3b8' };
  const rect = (x, y, w, h, rx, c, extra) => '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '" fill="' + c[0] + '" stroke="' + c[1] + '" stroke-width="1.2"' + (extra || '') + '/>';
  const metalLayer = (y, h) => '<rect x="6.5" y="' + y + '" width="17" height="' + h + '" rx="5" fill="none" stroke="#475569" stroke-width="1.6"/>';
  // зуб в локальных координатах: коронка сверху (y 6–40), корень снизу (40–88); верхняя челюсть отражается
  function toothSvg(x, p, J, t) {
    let h = '';
    const loss = lossOn(p, J), lk2 = p['lk' + J];
    const root = loss ? (implPos(p, J).includes(t) ? 'impl' : 'none') : (x.root || 'nat');
    if ((loss && lk2 !== 'fix') || (!loss && x.rem)) h += '<rect x="0" y="30" width="30" height="14" fill="' + COL.base[0] + '"/><line x1="0" y1="30" x2="30" y2="30" stroke="' + COL.base[1] + '"/><line x1="0" y1="44" x2="30" y2="44" stroke="' + COL.base[1] + '"/>';
    if (root === 'nat' && !loss) h += '<path d="M9 40 L12 83 Q15 90 18 83 L21 40 Z" fill="#fff" stroke="#cbd5e1" stroke-width="1.2"/>';
    if (root === 'impl') {
      h += rect(11, 50, 8, 36, 3, COL.impl);
      for (let y = 55; y < 84; y += 6) h += '<line x1="11" y1="' + y + '" x2="19" y2="' + (y + 2.5) + '" stroke="#64748b" stroke-width="1"/>';
      const sup = loss ? lossSup(p, J, t) : (x.perm && x.perm.k === 'crown' ? x.sup : null);
      if (sup === 'ball') h += '<circle cx="15" cy="44" r="5" fill="#94a3b8" stroke="#475569" stroke-width="1"/>';
      else if (sup) h += '<rect x="11.5" y="38" width="7" height="12" rx="1.5" fill="' + (SUP_C[sup] || '#94a3b8') + '" stroke="#475569" stroke-width="1"/>';
    }
    if (loss) {
      if (lk2 === 'fix') {
        const m = p['lm' + J], c = m === 'zr' ? COL.zr : COL.ac;
        h += '<rect x="0" y="34" width="30" height="8" fill="' + (m === 'zr' ? '#f3c6d2' : COL.gum) + '"/>' + rect(3, 6, 24, 30, 7, c);
      } else {
        h += rect(5, 8, 20, 26, 6, COL.ac);
      }
    } else if (x.rem) {
      h += rect(5, 8, 20, 26, 6, COL.ac);
    } else {
      const pm = x.perm, ex = x.ex || {};
      if (!pm || pm.k === 'ven' || pm.k === 'inl') {
        if (root === 'nat') h += ex.crown ? rect(3, 6, 24, 34, 7, COL.ex) : rect(4, 8, 22, 32, 7, COL.nat);
        else if (root === 'none' && ex.pont) h += rect(3, 10, 24, 26, 11, COL.ex);
        else if (root === 'none') h += '<line x1="4" y1="40" x2="26" y2="40" stroke="#cbd5e1" stroke-dasharray="2 2"/>';
        if (root === 'nat' && ex.core && !x.core && !ex.crown) h += rect(9, 22, 12, 20, 3, COL.ex);
      }
      if (pm && (pm.k === 'crown' || pm.k === 'pont')) {
        const g = (MAT[pm.m] || {}).g || 'zr', c = COL[g] || COL.zr, pnt = pm.k === 'pont';
        h += pnt ? rect(3, 10, 24, 26, 11, c) + (g === 'mk' ? metalLayer(14, 18) : '') : rect(3, 6, 24, 34, 7, c) + (g === 'mk' ? metalLayer(10, 27) : '');
      }
      if (pm && pm.k === 'ven') h += rect(3, 5, 24, 16, 5, COL.em);
      if (pm && pm.k === 'inl') h += rect(9, 9, 12, 15, 3, COL.em);
      if (x.core) h += rect(13.5, 40, 3, 30, 1.5, COL[CORE_G[x.core]]) + rect(9, 20, 12, 22, 3, COL[CORE_G[x.core]]);
      if (x.gum) h += '<rect x="3" y="37" width="24" height="6" rx="3" fill="' + COL.gum + '"/>';
      if (x.temp) h += '<rect x="1" y="2" width="28" height="42" rx="8" fill="none" stroke="' + COL.temp + '" stroke-width="1.5" stroke-dasharray="3.5 2.5"/>';
    }
    if ((x.take || []).length) h += '<g stroke="' + COL.red + '" stroke-width="2.2" stroke-linecap="round"><line x1="21" y1="3" x2="28" y2="10"/><line x1="28" y1="3" x2="21" y2="10"/></g>';
    return h;
  }
  const CELL = 30, MID = 8, PAD = 4, UY = 96, LY = 118;
  const cx = (J, t) => { const i = SEQ[J].indexOf(t); return PAD + i * CELL + (i >= 8 ? MID : 0); };
  function svgMap(p) {
    const M = p.omap; let h = '';
    ['U', 'L'].forEach((J) => {
      const loss = lossOn(p, J), fix = loss && p['lk' + J] === 'fix';
      // перемычки (под зубами)
      const ly = J === 'U' ? UY - 23 : LY + 23;
      SEQ[J].forEach((t, i) => {
        const n = SEQ[J][i + 1]; if (!n) return;
        const x1 = cx(J, t) + CELL - 4, x2 = cx(J, n) + 4;
        if (fix || (!loss && M.links[lk(t, n)])) h += '<rect x="' + x1 + '" y="' + (ly - 3) + '" width="' + (x2 - x1) + '" height="6" rx="2" fill="#94a3b8"/>';
      });
      SEQ[J].forEach((t) => {
        const x = peek(M, t), X = cx(J, t);
        const tf = J === 'U' ? 'translate(' + X + ',' + UY + ') scale(1,-1)' : 'translate(' + X + ',' + LY + ')';
        h += '<g class="ot' + (M.anchor === t ? ' anc' : '') + '" data-ot="' + t + '"><rect class="otb" x="' + X + '" y="' + (J === 'U' ? 4 : LY) + '" width="' + CELL + '" height="92" rx="5"/>' +
          '<g transform="' + tf + '">' + toothSvg(x, p, J, t) + '</g></g>';
      });
      // кружки-перемычки между зубами с коронкой / промежуточной
      if (!loss) SEQ[J].forEach((t, i) => {
        const n = SEQ[J][i + 1]; if (!n || !hasFix(peek(M, t)) || !hasFix(peek(M, n))) return;
        const on = !!M.links[lk(t, n)], X = (cx(J, t) + CELL + cx(J, n)) / 2;
        h += '<circle class="olk" data-olk="' + lk(t, n) + '" cx="' + X + '" cy="' + ly + '" r="5.5" fill="' + (on ? '#4f46e5' : '#fff') + '" stroke="' + (on ? '#3730a3' : '#94a3b8') + '" stroke-width="1.2"' + (on ? '' : ' stroke-dasharray="2 1.5"') + '><title>' + (on ? 'Разъединить' : 'Соединить') + '</title></circle>';
      });
    });
    // номера зубов — между челюстями
    ['U', 'L'].forEach((J) => {
      const it = implPos(p, J); if (it.length < 2 || !it.every((t) => lossSup(p, J, t) === 'bar')) return;
      const xs = it.map((t) => cx(J, t)), y = J === 'U' ? UY - 46 : LY + 42;
      h += '<rect x="' + (Math.min(...xs) + 8) + '" y="' + y + '" width="' + (Math.max(...xs) - Math.min(...xs) + 14) + '" height="5" rx="2" fill="#64748b" stroke="#334155" stroke-width="1"/>';
    });
    let nums = '';
    ['U', 'L'].forEach((J) => SEQ[J].forEach((t) => { nums += '<text x="' + (cx(J, t) + 15) + '" y="' + (J === 'U' ? 105 : 115) + '" class="otn" text-anchor="middle">' + t + '</text>'; }));
    const W = PAD * 2 + CELL * 16 + MID;
    return '<svg class="omap" viewBox="0 -2 ' + W + ' ' + (LY + 96) + '" width="100%">' +
      '<line x1="' + (PAD + CELL * 8 + MID / 2) + '" y1="2" x2="' + (PAD + CELL * 8 + MID / 2) + '" y2="' + (LY + 92) + '" stroke="#cbd5e1" stroke-width="1.5"/>' + h + nums + '</svg>';
  }

  /* ---------------- панель: кисти, формула, сводка ---------------- */
  const LSK = 'sqnsmz.orthoBrush';
  const BR = (() => { try { return Object.assign({ act: 'crown', sel: {} }, JSON.parse(localStorage.getItem(LSK) || '{}')); } catch (e) { return { act: 'crown', sel: {} }; } })();
  const saveBR = () => { try { localStorage.setItem(LSK, JSON.stringify(BR)); } catch (e) { /* */ } };
  const selOf = (b) => (b.o.some((x) => x.v === BR.sel[b.k]) ? BR.sel[b.k] : b.o[0].v);
  let MSG = '';
  // история действий на формуле (отменить / вернуть); сбрасывается при новом сценарии
  let H = { ref: null, past: [], fut: [] };
  const hist = (M) => { if (H.ref !== M) H = { ref: M, past: [], fut: [] }; return H; };
  const snap = (M) => JSON.stringify({ t: M.t, links: M.links });
  // поля сценария, которые ✕ возвращает к исходному: полная потеря, частичный протез, виниры
  const RESET_RE = /^(loss|lk|lf|larm|lbase|lspoonR?|ln|lr|lm|lc|ls|lsup|lmuN|lb|pk|pb|parm|pbase|plk2?)[UL]$|^(vwax|waxV|vmock|mockN)$/;
  // снимок с полями (P) — только у сброса; при отмене поля возвращаются и считаются заданными врачом
  const restore = (M, s, p, ctx) => { const o2 = JSON.parse(s); M.t = o2.t; M.links = o2.links; M.anchor = null; if (o2.P && p) { Object.assign(p, o2.P); if (ctx) ctx.touch(Object.keys(o2.P)); } };
  const remember = (M) => { const h = hist(M); h.past.push(snap(M)); if (h.past.length > 60) h.past.shift(); h.fut = []; };
  const ERASER = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#475569" stroke-width="1.8" stroke-linejoin="round"><path d="M3.5 14.5 13 5a2 2 0 0 1 2.8 0l3.7 3.7a2 2 0 0 1 0 2.8L11 20H7.5z" fill="#fbcfe0"/><path d="M8 10l6.5 6.5"/><path d="M11 20h9.5"/></svg>';

  function layers(M, t, p) {
    const x = peek(M, t), out = [], J = jawOf(t);
    (x.take || []).forEach((v) => out.push(['take:' + v, TAKE_L[v], 'tk']));
    if (x.root === 'impl') out.push(['impl', 'имплантат' + (x.perm && x.perm.k === 'crown' && !lossOn(p, J) ? ' → ' + ((MAT[x.perm.m] || {}).g === 'mk' ? 'инд. абатмент' : SUP_L[x.sup] || '') : ''), 'im']);
    if (lossOn(p, J)) return out;
    if (x.core) out.push(['core', CORE_L[x.core], CORE_G[x.core]]);
    if (x.perm) {
      const pm = x.perm, g = (MAT[pm.m] || {}).g;
      const nm = pm.k === 'crown' ? (x.root === 'impl' ? 'коронка на имплантате ' : 'коронка ') + MAT[pm.m].l : pm.k === 'pont' ? 'промежуточная ' + MAT[pm.m].l : pm.k === 'ven' ? 'винир керамический' : 'вкладка керамическая';
      out.push(['perm', nm, g]);
    }
    if (x.temp) out.push(['temp', TEMP_L[x.temp], 'tp']);
    if (x.gum) out.push(['gum', 'керам. десна', 'gm']);
    if (x.rem) out.push(['rem', 'зуб в протезе', 'rm']);
    return out;
  }
  function summary(p, esc) {
    const M = p.omap; let h = '';
    chains(M).forEach((c) => {
      if (lossOn(p, jawOf(c.teeth[0]))) return;
      const m = (peek(M, c.abut[0] || c.teeth[0]).perm || {}).m, ib = implBridge(M, c);
      h += '<div class="osb"><b>' + (c.pont.length ? 'Мост' + (ib ? ' на имплантатах' : '') : 'Блок коронок') + ' ' + fmt(c.teeth[0]) + '–' + fmt(c.teeth[c.teeth.length - 1]) + '</b>' + (m ? ' · ' + esc(MAT[m].l) : '') +
        '<br><span>опоры ' + (c.abut.length ? fmtL(c.abut) : '—') + (c.pont.length ? ' · промежуточная ' + fmtL(c.pont) : '') + '</span></div>';
    });
    ['U', 'L'].forEach((J) => {
      if (lossOn(p, J)) {
        const it = implPos(p, J), k = p['lk' + J], sp = p['lsup' + J];
        const supT = k === 'fix' ? ({ tb: 'Ti-основания', mu: 'мультиюниты', bar: 'балка', mix: 'Ti-основания ' + (it.length - muN(p, J)) + ' + мультиюниты ' + muN(p, J) })[sp] : k === 'rem' ? ({ bar: 'балка', ball: 'локаторы / шарики' })[p['lr' + J]] : '';
        h += '<div class="osb"><b>' + JAW_N[J] + ': полная потеря зубов</b>' + (it.length ? '<br><span>имплантатов ' + it.length + ': ' + fmtL(it) + (supT ? ' · ' + supT : '') + '</span>' : '') + '</div>';
      } else if (remTeeth(M, J).length) h += '<div class="osb"><b>' + JAW_N[J] + ': частичный съёмный протез</b><br><span>замещает ' + fmtL(remTeeth(M, J)) + '</span></div>';
    });
    const rows = Object.keys(M.t).sort().map((t) => {
      const ls = layers(M, t, p); if (!ls.length) return '';
      return '<div class="osr"><span class="tchip">' + fmt(t) + '</span><span class="osl">' + ls.map(([k, l, g]) =>
        '<span class="osp g-' + g + '">' + esc(l) + '<button data-oxl="' + t + '|' + k + '" title="Убрать">×</button></span>').join('') + '</span></div>';
    }).join('');
    return h + rows;
  }
  function render(pr, p, ctx) {
    const { esc, badge } = ctx, M = p.omap;
    const brushes = BRUSHES.filter((b) => !b.show || b.show(p));
    if (!brushes.some((b) => b.k === BR.act)) BR.act = 'crown';
    const hs = hist(M);
    const pal = '<div class="opal">' + brushes.map((b) => {
      const v = selOf(b), on = b.k === BR.act ? ' on' : '';
      if (b.icon) return '<div class="obr oer' + on + '" data-obr="' + b.k + '" title="Ластик — очистить всё на зубе">' + ERASER + '<b>' + esc(b.l) + '</b></div>';
      return '<div class="obr' + on + '" data-obr="' + b.k + '"><b>' + esc(b.l) + '</b>' + (b.o.length > 1 ? '<select data-obs="' + b.k + '">' + b.o.map((x) => '<option value="' + x.v + '"' + (x.v === v ? ' selected' : '') + '>' + esc(x.l) + '</option>').join('') + '</select>' : '<span class="obs1">' + esc(b.o[0].l) + '</span>') + '</div>';
    }).join('') +
      '<div class="ohist"><button data-oundo="1" title="Отменить действие"' + (hs.past.length ? '' : ' disabled') + '>↶</button><button data-oredo="1" title="Вернуть действие"' + (hs.fut.length ? '' : ' disabled') + '>↷</button>' +
      '<button class="oclr" data-oclr="1" title="Сбросить всё на формуле">✕</button></div></div>';
    const fromH = '<div class="row" style="grid-template-columns:1fr auto;margin:0 0 8px"><label>Взять из формулы пациента' + (M.fromF && M.noF ? '<br><span class="auto" style="color:#b45309">формула на странице не найдена</span>' : M.fromF && M.loaded ? '<br><span class="auto">● имплантаты, отсутствующие зубы, конструкции (серым)</span>' : '') + '</label><div><button class="tg ' + (M.fromF ? 'on' : '') + '" data-ofrom="1"></button></div></div>';
    const hint = M.anchor ? '<div class="ohint">Мост от ' + fmt(M.anchor) + ': нажмите последнюю опору · <button class="link" data-oanc="1">отмена</button></div>'
      : BR.act === 'bridge' ? '<div class="ohint">Мост: нажмите первую и последнюю опору — между ними станут промежуточные</div>'
        : '<div class="ohint">Нажмите на зуб — применить «' + esc((BRUSHES.find((b) => b.k === BR.act) || {}).l) + '». Кружок между коронками — соединить / разъединить.</div>';
    const legend = '<div class="oleg">' + [['zr', 'цирконий'], ['em', 'E-max'], ['mk', 'МК'], ['metal', 'металл'], ['comp', 'композит'], ['ex', 'есть по формуле']].map(([g, l]) => '<span><i style="background:' + COL[g][0] + ';border-color:' + COL[g][1] + '"></i>' + l + '</span>').join('') +
      '<span><i style="border:1.5px dashed #475569;background:transparent"></i>временная</span><span><i style="background:' + COL.base[0] + ';border-color:' + COL.base[1] + '"></i>протез</span></div>';
    const msg = MSG ? '<div style="margin:6px 0">' + badge('warn', MSG) + '</div>' : ''; MSG = '';
    const sum = summary(p, esc);
    return '<div class="oblk"><div class="flbl" style="font-size:13px;margin-bottom:6px">' + esc(pr.label || 'Конструкции') + '</div>' + fromH + pal + hint + msg + svgMap(p) + legend +
      (sum ? '<div class="osum">' + sum + '</div>' : '') + '</div>';
  }
  function bind(P, pr, p, re, ctx) {
    const M = p.omap;
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    on('[data-obr]', 'click', (e) => {
      const k = e.currentTarget.dataset.obr; if (BR.act === k) return;
      BR.act = k; M.anchor = null; saveBR();
      if (e.target.tagName === 'SELECT') { P.querySelectorAll('[data-obr]').forEach((d) => d.classList.toggle('on', d.dataset.obr === k)); return; }
      re();
    });
    on('[data-obs]', 'change', (e) => { const k = e.currentTarget.dataset.obs; BR.sel[k] = e.currentTarget.value; BR.act = k; saveBR(); re(); });
    on('[data-ot]', 'click', (e) => {
      const t = e.currentTarget.dataset.ot, b = BRUSHES.find((x) => x.k === BR.act), before = snap(M);
      MSG = paint(M, t, BR.act, selOf(b), p) || '';
      if (snap(M) !== before) { const h = hist(M); h.past.push(before); if (h.past.length > 60) h.past.shift(); h.fut = []; }
      re();
    });
    on('[data-olk]', 'click', (e) => { e.stopPropagation(); remember(M); const k = e.currentTarget.dataset.olk; M.links[k] = !M.links[k]; cleanLinks(M); re(); });
    const keysP = () => Object.keys(p).filter((k) => RESET_RE.test(k));
    const snapP = () => { const o2 = JSON.parse(snap(M)); o2.P = {}; keysP().forEach((k) => { o2.P[k] = p[k]; }); return JSON.stringify(o2); };
    on('[data-oundo]', 'click', () => { const h = hist(M); if (!h.past.length) return; const prev = h.past.pop(); h.fut.push(JSON.parse(prev).P ? snapP() : snap(M)); restore(M, prev, p, ctx); re(); });
    on('[data-oredo]', 'click', () => { const h = hist(M); if (!h.fut.length) return; const nx = h.fut.pop(); h.past.push(JSON.parse(nx).P ? snapP() : snap(M)); restore(M, nx, p, ctx); re(); });
    // ✕ — всё к исходному: схема, полная потеря, частичный протез, виниры (формула пациента подтягивается заново)
    on('[data-oclr]', 'click', () => {
      const h = hist(M); h.past.push(snapP()); h.fut = [];
      M.t = {}; M.links = {}; M.anchor = null; M.loaded = false;
      if (ctx) ctx.reset(keysP());
      re();
    });
    on('[data-oxl]', 'click', (e) => {
      remember(M);
      const [t, k] = e.currentTarget.dataset.oxl.split('|'), x = get(M, t);
      if (k.startsWith('take:')) { const v = k.slice(5); x.take = (x.take || []).filter((y) => y !== v); }
      else eraseLayer(x, k);
      if (k === 'rem' && x.root === 'none' && !x.known) x.root = 'nat';
      cleanLinks(M); re();
    });
    on('[data-oanc]', 'click', () => { M.anchor = null; re(); });
    on('[data-ofrom]', 'click', () => { M.fromF = !M.fromF; if (M.fromF) M.loaded = false; else unloadFormula(M); re(); });
  }
  // перед рендером: подтянуть формулу SQNS (один раз; true — параметры пересчитать)
  function prepare(M, getInfo) {
    if (!M.fromF || M.loaded) return false;
    loadFormula(M, getInfo());
    return true;
  }
  const CSS = `
  .oblk{margin:6px 0 8px}
  .opal{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin-bottom:6px}
  .obr{border:1.5px solid #e2e8f0;border-radius:10px;padding:5px 6px;background:#fff;cursor:pointer;min-width:0}
  .obr:hover{border-color:#a5b4fc} .obr.on{border-color:#6366f1;background:#eef2ff;box-shadow:0 0 0 2px rgba(99,102,241,.15)}
  .obr b{display:block;font-size:12px;color:#334155;margin-bottom:3px} .obr.on b{color:#3730a3}
  .obr select{width:100%;padding:3px 4px;font-size:11.5px;border-radius:7px} .obs1{font-size:11px;color:#64748b}
  .oer{display:flex;align-items:center;gap:6px} .oer b{margin:0}
  .ohist{display:flex;gap:4px} .ohist button{flex:1;border:1.5px solid #e2e8f0;border-radius:10px;background:#fff;font-size:18px;font-weight:700;color:#334155;cursor:pointer}
  .ohist button:hover:not(:disabled){border-color:#a5b4fc;color:#3730a3} .ohist button:disabled{opacity:.35;cursor:default}
  .ohist .oclr{color:#b91c1c;font-size:15px} .ohist .oclr:hover{border-color:#fca5a5!important;color:#b91c1c!important;background:#fef2f2}
  .ohint{font-size:11.5px;color:#4338ca;background:#eef2ff;border-radius:8px;padding:5px 8px;margin:2px 0 6px}
  .omap{display:block;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;user-select:none}
  .omap .ot{cursor:pointer} .omap .otb{fill:transparent} .omap .ot:hover .otb{fill:#eef2ff} .omap .ot.anc .otb{fill:#c7d2fe}
  .omap .otn{font-size:9.5px;fill:#64748b;font-weight:700;font-family:inherit} .omap .olk{cursor:pointer}
  .oleg{display:flex;flex-wrap:wrap;gap:4px 10px;margin:6px 2px 0;font-size:11px;color:#64748b}
  .oleg span{display:inline-flex;align-items:center;gap:4px} .oleg i{display:inline-block;width:12px;height:12px;border-radius:4px;border:1.2px solid}
  .osum{margin-top:8px;border-top:1px dashed #e2e8f0;padding-top:6px;font-size:12.5px}
  .osb{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:6px 8px;margin:4px 0;color:#334155} .osb span{color:#64748b;font-size:12px}
  .osr{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px dashed #eef2f7} .osr:last-child{border:0}
  .osr .tchip{min-width:40px;text-align:center} .osl{display:flex;flex-wrap:wrap;gap:4px}
  .osp{display:inline-flex;align-items:center;gap:3px;border-radius:8px;padding:2px 3px 2px 7px;font-size:11.5px;background:#f1f5f9;color:#334155;border:1px solid #e2e8f0}
  .osp button{border:0;background:transparent;color:#94a3b8;cursor:pointer;font-size:13px;line-height:1;padding:0 3px} .osp button:hover{color:#b91c1c}
  .osp.g-zr{background:#f5e3b8;border-color:#d4b064} .osp.g-em{background:#fdf8ea;border-color:#e3cf9e} .osp.g-mk{background:#f5efe4;border-color:#cfc6b8}
  .osp.g-metal{background:#e5e7eb;border-color:#9ca3af} .osp.g-comp{background:#f0d2b0;border-color:#c38a50} .osp.g-tp{border-style:dashed;border-color:#64748b;background:#fff}
  .osp.g-tk{background:#fef2f2;border-color:#fecaca;color:#991b1b} .osp.g-im{background:#e2e8f0;border-color:#94a3b8} .osp.g-rm,.osp.g-gm{background:#fdebf2;border-color:#f0a8c4}
  `;

  D.TYPES = D.TYPES || {};
  D.TYPES.orthoMap = { render, bind, prepare, css: CSS };

  /* ---------------- сценарий ---------------- */
  const seg = (key, label, options, def, show, extra) => Object.assign({ key, label, type: 'seg', options, default: def, show }, extra || {});
  const cnt = (key, label, unit, def, extra) => Object.assign({ key, label, unit, type: 'counter', min: 0, max: 30, default: def }, extra || {});
  const LOSS = (J) => {
    const G = 'loss' + J, k = (p) => p['lk' + J];
    const isFull = (p) => k(p) === 'full', isRem = (p) => k(p) === 'rem', isFix = (p) => k(p) === 'fix';
    const bar = (p) => (isRem(p) && p['lr' + J] === 'bar') || (isFix(p) && p['lsup' + J] === 'bar');
    const g = { grp: G };
    return [
      { key: G, label: 'Полная потеря зубов — ' + JAW_N[J], type: 'group', default: false, auto: (teeth, p) => autoLoss(p, J), summary: (p) => ({ full: 'полный съёмный', rem: 'съёмный на имплантатах', fix: 'несъёмный на имплантатах' })[k(p)] || '' },
      seg('lk' + J, 'Конструкция', [o('full', 'Полный съёмный'), o('rem', 'Съёмный на имплантатах'), o('fix', 'Несъёмный на имплантатах')], null, null, Object.assign({ wide: true }, g)),
      seg('lf' + J, 'Протез', [o('157', 'Пластиночный'), o('158', 'Термопласт'), o('156', 'Иммедиат')], '157', isFull, g),
      Object.assign({ key: 'larm' + J, label: 'Армирование', type: 'toggle', default: false, show: isFull }, g),
      Object.assign({ key: 'lbase' + J, label: 'Литой металлический базис', type: 'toggle', default: false, show: isFull }, g),
      Object.assign({ key: 'lspoon' + J, label: 'Индивидуальная ложка', type: 'toggle', default: true, show: isFull }, g),
      Object.assign({ key: 'ln' + J, label: 'Укажите количество имплантатов', type: 'counter', min: 2, max: 8, default: 4, show: (p) => isRem(p) || isFix(p),
        auto: (teeth, p) => { const n = formImpl(p.omap, J).length; return n >= 2 && n <= 8 ? n : 4; } }, g),
      Object.assign({ key: 'lspoonR' + J, label: 'Индивидуальная ложка', type: 'toggle', default: false, show: (p) => isRem(p) || isFix(p) }, g),
      seg('lr' + J, 'Фиксация', [o('bar', 'Балка'), o('ball', 'Локаторы / шарики')], null, isRem, g),
      seg('lm' + J, 'Материал', [o('zr', 'Цирконий'), o('ac', 'Акрил'), o('a4', 'All-on-4')], 'zr', isFix, g),
      seg('lc' + J, 'Категория', [o('1', '1 категория'), o('2', '2 категория')], '1', (p) => (isRem(p) && p['lr' + J] === 'bar') || (isFix(p) && p['lm' + J] !== 'a4'), g),
      seg('ls' + J, 'На имплантаты', [o('127', 'Шариковый абатмент'), o('128', 'O-Ring')], '127', (p) => isRem(p) && p['lr' + J] === 'ball', Object.assign({ sub: true }, g)),
      seg('lsup' + J, 'Супраструктуры', [o('tb', 'Ti-основания'), o('mu', 'Мультиюниты'), o('mix', 'Ti + мультиюниты'), o('bar', 'Балка')], 'tb', isFix, Object.assign({ wide: true }, g)),
      cnt('lmuN' + J, 'Из них мультиюнитов', 'шт.', 2, Object.assign({ min: 1, max: 7, sub: true, show: (p) => isFix(p) && p['lsup' + J] === 'mix' }, g)),
      seg('lb' + J, 'Балка', [o('4', 'На 4 имплантатах'), o('6', 'На 6 имплантатах')], null, bar, Object.assign({ sub: true, auto: (teeth, p) => (lossN(p, J) >= 6 ? '6' : '4') }, g)),
    ];
  };
  const PART = (J) => {
    const has = (p) => !!(p.omap && remTeeth(p.omap, J).length) && !p['loss' + J], kind = (p) => p['pk' + J], g = {};
    return [
      seg('pk' + J, 'Частичный съёмный протез — ' + JAW_N[J], [o('plast', 'Пластиночный'), o('bug', 'Бюгельный'), o('imm', 'Иммедиат'), o('nylon', 'Нейлон. кламмеры'), o('thermo', 'Термопласт')], 'plast', has, Object.assign({ wide: true }, g)),
      seg('pb' + J, 'Бюгельный', [o('161', 'Литые кламмеры'), o('162', '+ литой базис'), o('163', 'На ЛСП'), o('164', 'Нейлон. кламмеры'), o('165', 'Термопласт. базис'), o('166', 'Шинирующий'), o('167', 'С замками'), o('168', 'С замками, ЛСП')], '161', (p) => has(p) && kind(p) === 'bug', Object.assign({ wide: true, sub: true }, g)),
      Object.assign({ key: 'parm' + J, label: 'Армирование', type: 'toggle', default: false, sub: true, show: (p) => has(p) && (kind(p) === 'plast' || kind(p) === 'imm') }, g),
      Object.assign({ key: 'pbase' + J, label: 'Литой металлический базис', type: 'toggle', default: false, sub: true, show: (p) => has(p) && kind(p) === 'plast' }, g),
      cnt('plk' + J, 'Замки — аттачмент', 'шт.', 0, Object.assign({ sub: true, show: (p) => has(p) && kind(p) === 'bug' }, g)),
      cnt('plk2' + J, 'Замки «МК», «Рейн»', 'шт.', 0, Object.assign({ sub: true, show: (p) => has(p) && kind(p) === 'bug' }, g)),
    ];
  };

  const ANEST = SECTIONS && SECTIONS.ANEST ? SECTIONS.ANEST(false, (teeth, p) => prepTeeth(p)) : [];
  SCENARIOS.push({
    id: 'ortho', title: 'Ортопедия', icon: '👑', cat: 'ortho',
    params: [
      cnt('v1p', 'Приём первичный', '', 1, { max: 5 }),
      cnt('v1pp', 'Первичный с планом лечения', '', 0, { max: 5 }),
      cnt('v2', 'Приём повторный', '', 0, { max: 20 }),
      { key: 'isoS', label: 'Изоляция', type: 'stock', rows: [{ l: 'Изоляция', items: [{ id: 9, l: 'OptraGate' }, { id: 10, l: 'Коффердам' }] }], optional: true },
      ...ANEST,
      { key: 'imp', label: 'Оттиски', type: 'group', default: true },
      cnt('alg', 'Альгинатный', 'чел.', 0, { grp: 'imp' }),
      cnt('sil', 'Силиконовый', 'чел.', 0, { grp: 'imp' }),
      cnt('scan', '3D-скан', 'чел.', 0, { grp: 'imp' }),
      ...LOSS('U'), ...LOSS('L'),
      { key: 'omap', label: 'Конструкции', type: 'orthoMap', default: { t: {}, links: {}, fromF: true, loaded: false, anchor: null } },
      ...PART('U'), ...PART('L'),
      // виниры: Wax-up и mockup под формулой, по числу виниров (можно выключить или поправить)
      { key: 'vwax', label: 'Wax-up под виниры', type: 'toggle', default: true, show: (p) => venTeeth(p).length > 0 },
      cnt('waxV', 'Wax-up', 'зуб.', 0, { sub: true, show: (p) => venTeeth(p).length > 0 && p.vwax, auto: (teeth, p) => venTeeth(p).length }),
      { key: 'vmock', label: 'Mockup под виниры', type: 'toggle', default: true, show: (p) => venTeeth(p).length > 0 },
      cnt('mockN', 'Mockup', 'зуб.', 0, { sub: true, show: (p) => venTeeth(p).length > 0 && p.vmock, auto: (teeth, p) => venTeeth(p).length }),
      { key: 'more', label: 'Ещё: модели, Wax-up, ретракция', type: 'group', default: false },
      cnt('model', 'Контрольная модель', 'шт.', 0, { grp: 'more' }),
      cnt('waxT', 'Wax-up', 'зуб.', 0, { grp: 'more', show: (p) => !venTeeth(p).length }),
      cnt('waxJ', 'Wax-up / 3D-печать', 'чел.', 0, { grp: 'more' }),
      cnt('retr', 'Ретракция', 'зуб.', 0, { grp: 'more' }),
      cnt('retr2', 'Двойная ретракция', 'зуб.', 0, { grp: 'more' }),
    ],
    check, build, formula,
  });
  const oc = (D.CATS || []).find((c) => c.id === 'ortho'); if (oc) delete oc.empty;

  D._ortho = { paint, chains, build, check, loadFormula, unloadFormula, autoLoss, SEQ, BR };
})();
