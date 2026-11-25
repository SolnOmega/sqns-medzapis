/* SQNS · Помощник медзаписи — НАСТРОЙКИ И ШАБЛОНЫ
 * Этот файл можно править отдельно от движка (engine.js).
 * После правки увеличьте @version и ?v= в sqns-medzapis.user.js, чтобы Tampermonkey подтянул изменения.
 */
(function () {
  'use strict';
  /* =====================================================================
   *  1. НАСТРОЙКИ
   * ===================================================================== */

  // Должности ЕГИСЗ (справочник МИС). id === null → код не подтверждён, скрипт поле не трогает.
  const POSITIONS = {
    therapist:   { name: 'Врач-стоматолог-терапевт', id: '103' },
    orthopedist: { name: 'Врач-стоматолог-ортопед',  id: '102' },
    surgeon:     { name: 'Врач-стоматолог-хирург',   id: '104' },
  };
  // Подсказка должности по услуге приёма (если она есть в визите)
  const POSITION_BY_CODE = [['B01.065', 'therapist'], ['B01.066', 'orthopedist'], ['B01.067', 'surgeon']];

  // Услуги-модификаторы и услуги, создающие блоки с нужными параметрами.
  // code — начало кода услуги, name — дополнительно по названию (если коды совпадают).
  // mod: меняет параметр у блока шаблона tpl (на тех же зубах, если они указаны в услуге)
  // block: создаёт блок шаблона tpl с заданными параметрами (одинаковые объединяются, кол-во суммируется в qty)
  // Системы имплантатов: диаметр → доступные длины (мм). Сверьте с вашим складом и правьте здесь.
  const L_OSS = [7, 8.5, 10, 11.5, 13, 15], L_DEN = [7, 8, 10, 12, 14], L_ANY = [7, 8.5, 10, 11.5, 13, 15];
  const IMPLANT_SYSTEMS = {
    osstem:   { name: 'Osstem TSIII', sizes: { '3.5': [8.5, 10, 11.5, 13, 15], '4.0': L_OSS, '4.5': L_OSS, '5.0': [6].concat(L_OSS), '6.0': [6, 7, 8.5, 10, 11.5, 13], '7.0': [6, 7, 8.5, 10, 11.5, 13] } },
    dentium:  { name: 'Dentium SuperLine', sizes: { '3.6': L_DEN, '4.0': L_DEN, '4.5': L_DEN, '5.0': L_DEN, '6.0': [7, 8, 10, 12], '7.0': [7, 8, 10, 12] } },
    anyridge: { name: 'MegaGen AnyRidge', sizes: { '3.5': L_ANY, '4.0': L_ANY, '4.5': L_ANY, '5.0': L_ANY, '5.5': [7, 8.5, 10, 11.5, 13], '6.0': [7, 8.5, 10, 11.5, 13], '6.5': [7, 8.5, 10, 11.5, 13], '7.0': [7, 8.5, 10, 11.5, 13] } },
    mini:     { name: 'Мини-имплантат', sizes: { '1.8': [10, 11.5, 13, 15], '2.0': [10, 11.5, 13, 15], '2.5': [10, 11.5, 13, 15], '3.0': [10, 11.5, 13] } },
  };
  const allMini = (p) => { const r = Object.values(p.imp || {}); return r.length > 0 && r.every((x) => x.sys === 'mini'); };
  const mm = (x) => String(x).replace('.', ',');
  const sysHint = (sys) => (b, s) => { b.hints.placed = true; b.hints.sys = b.hints.sys || {}; s.teeth.forEach((t) => { b.hints.sys[t] = sys; }); b.hints.sysDefault = sys; };

  // сколько каналов указано в услугах (берётся максимум) — для сверки с отмеченными каналами
  const canalHint = (b, n) => { b.hints.count = Math.max(b.hints.count || 0, +n || 0); };
  const countFromName = (name) => (/четыр/i.test(name) ? 4 : /тр[её]х/i.test(name) ? 3 : /двух/i.test(name) ? 2 : 0);

  const SERVICE_RULES = [
    // изоляция и прокладки
    { code: 'A02.07.001', name: /optra/i,           mod: { tpl: ['caries', 'endo', 'hygiene', 'extraction', 'implant'], key: 'isol', value: 'ретрактором OptraGate' }, label: 'Изоляция OptraGate' },
    { code: 'A02.07.001', name: /коффердам/i,       mod: { tpl: ['caries', 'endo'], key: 'isol', value: 'коффердамом' }, label: 'Изоляция коффердам' },
    { code: 'A16.07.002', name: /лечебн\S* прокладк/i,   mod: { tpl: ['caries', 'endo'], key: 'liner', add: 'cal' }, label: 'Лечебная прокладка' },
    { code: 'A16.07.002', name: /изолирующ\S* прокладк/i, mod: { tpl: ['caries', 'endo'], key: 'liner', add: 'gic' }, label: 'Изолирующая прокладка' },
    // профессиональная гигиена
    { code: 'A16.07.051', name: /менее 14/i, block: { tpl: 'hygiene', merge: true, mergeAll: true, params: { scope: 'partial' } }, label: 'Гигиена (менее 14 зубов)' },
    { code: 'A16.07.051', block: { tpl: 'hygiene', merge: true, mergeAll: true, params: { scope: 'full' } }, label: 'Гигиена (полный комплекс)' },
    { code: 'A22.07.002', block: { tpl: 'hygiene', merge: true, mergeAll: true, qtyIsTeeth: true, params: { scope: 'teeth' } }, label: 'Гигиена: УЗ в области зуба' },
    // трепанация, временные пломбы, сошлифовывание, штифты, тип пломбы (меняют параметры блоков кариеса/эндо)
    { code: 'A16.07.092', name: /пломб/i, mod: { tpl: ['caries', 'endo'], set: { prev: 'old' } }, label: 'Удаление старой пломбы' },
    { code: 'A16.07.092', name: /цельнолит|металлокерам/i, mod: { tpl: ['endo'], set: { prev: 'crown' } }, label: 'Трепанация коронки' },
    { code: 'A16.07.092', info: true, label: 'Трепанация зуба' },
    { code: 'A16.07.091', mod: { tpl: ['caries', 'endo'], set: { tempOff: true, visit: 'repeat' } }, label: 'Снятие временной пломбы' },
    { code: 'A16.07.002.009', mod: { tpl: ['caries', 'endo'], set: { tempOn: true, finish: 'temp' } }, label: 'Временная пломба' },
    { code: 'A16.07.031', name: /стекловолок/i, pass: true, mod: { tpl: ['caries', 'endo'], set: { post: 'fiber' } }, label: 'Реставрация со стекловолоконным штифтом' },
    { code: 'A16.07.031', pass: true, mod: { tpl: ['caries', 'endo'], set: { post: 'metal' } }, label: 'Реставрация с анкерным штифтом' },
    { code: 'A16.07.002.001', pass: true, mod: { tpl: ['caries', 'endo'], set: { material: 'стеклоиономерным цементом' } }, label: 'Пломба (цемент)' },
    { code: 'A16.07.002.011', pass: true, mod: { tpl: ['caries'], set: { black: 'II' } }, label: 'Пломба II–III класс' },
    { code: 'A16.07.002.012', pass: true, mod: { tpl: ['caries'], set: { black: 'IV' } }, label: 'Пломба IV класс' },
    { code: 'A16.07.002', name: /эстетическ/i, pass: true, mod: { tpl: ['caries'], set: { resto: 'aesthetic' } }, label: 'Эстетическая реставрация' },
    { code: 'A16.07.002', name: /винир/i, unmatched: true, label: 'Композитный винир' },
    { code: 'A16.07.025.001', info: true, label: 'Полирование реставраций' },
    // имплантация
    { code: 'A16.07.054', name: /полный протокол/i, mod: { tpl: ['implant'], set: { guide: 'full', diag: 'full' } }, label: 'Хирургический шаблон (полный протокол)' },
    { code: 'A16.07.054', name: /пилотн|навигац/i, mod: { tpl: ['implant'], set: { guide: 'pilot' } }, label: 'Хирургический шаблон' },
    { code: 'A16.07.054', name: /мини/i, block: { tpl: 'implant', merge: true, mergeAll: true, qtyIsTeeth: true, params: { stage: 'place', access: 'flapless' }, hint: sysHint('mini') }, label: 'Мини-имплантат' },
    { code: 'A16.07.054', name: /osstem/i, block: { tpl: 'implant', merge: true, mergeAll: true, qtyIsTeeth: true, params: { stage: 'place' }, hint: sysHint('osstem') }, label: 'Имплантат Osstem' },
    { code: 'A16.07.054', name: /dentium/i, block: { tpl: 'implant', merge: true, mergeAll: true, qtyIsTeeth: true, params: { stage: 'place' }, hint: sysHint('dentium') }, label: 'Имплантат Dentium' },
    { code: 'A16.07.054', name: /anyridge|megagen/i, block: { tpl: 'implant', merge: true, mergeAll: true, qtyIsTeeth: true, params: { stage: 'place' }, hint: sysHint('anyridge') }, label: 'Имплантат AnyRidge' },
    { code: 'A16.07.054', name: /формировател/i, block: { tpl: 'implant', merge: true, mergeAll: true, params: { supra: 'healing' }, hint: (b) => { b.hints.healing = true; } }, label: 'Формирователь десны' },
    { code: 'A16.07.054', name: /временн\S* а+б+атмент/i, block: { tpl: 'implant', merge: true, mergeAll: true, params: { supra: 'temp' }, hint: (b) => { b.hints.tempAbut = true; } }, label: 'Временный абатмент' },
    { code: 'A16.07.006', name: /временн/i, block: { tpl: 'implant', merge: true, mergeAll: true, params: { supra: 'temp' }, hint: (b) => { b.hints.tempAbut = true; } }, label: 'Временный абатмент' },
    { code: 'A16.30.026', block: { tpl: 'implant', merge: true, mergeAll: true, qtyIsTeeth: true, params: { stage: 'removal' }, hint: (b) => { b.hints.removal = true; } }, label: 'Удаление имплантата' },
    // удаление зубов, швы, PRF
    { code: 'A16.07.001.003', pass: true, mod: { tpl: ['extraction'], set: { method: 'complex' } }, label: 'Удаление сложное' },
    { code: 'A16.07.024', pass: true, mod: { tpl: ['extraction'], set: { method: 'impacted', flap: true, mkb: 'K01.1' } }, label: 'Удаление ретенир./дистопир.' },
    { code: 'A16.07.097', name: /ptfe/i, mod: { tpl: ['extraction', 'implant'], set: { sutures: true, sutMat: 'PTFE' } }, label: 'Швы PTFE' },
    { code: 'A16.07.097', mod: { tpl: ['extraction', 'implant'], set: { sutures: true } }, label: 'Швы' },
    { code: 'A11.12.009', mod: { tpl: ['extraction', 'implant'], set: { socket: 'prf', prf: true } }, label: 'PRF' },
    // герметизация, ICON, фторирование
    { code: 'A16.07.057', block: { tpl: 'prevent', merge: true, mergeBy: 'method', qtyIsTeeth: true, params: { method: 'seal' } }, label: 'Герметизация фиссур' },
    { code: 'A16.07.002', name: /icon/i, block: { tpl: 'prevent', merge: true, mergeBy: 'method', qtyIsTeeth: true, params: { method: 'icon' } }, label: 'ICON' },
    { code: 'A11.07.012', block: { tpl: 'prevent', merge: true, mergeBy: 'method', params: { method: 'fluor' } }, label: 'Глубокое фторирование' },
    // эндодонтия: каждая услуга отмечает этап в блоке «Эндодонтия» того же зуба
    { code: 'A16.07.002', name: /этапе эндолечения/i, block: { tpl: 'endo', merge: true, params: { stages: ['wall'] } }, label: 'Эндо: восстановление стенки' },
    { code: 'A16.07.009', block: { tpl: 'endo', merge: true, params: { stages: ['pulpotomy'] } }, label: 'Эндо: пульпотомия' },
    { code: 'A16.07.010', block: { tpl: 'endo', merge: true, params: { stages: ['extirp'] }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: экстирпация' },
    { code: 'A16.07.082.001', name: /гуттаперч/i, block: { tpl: 'endo', merge: true, params: { stages: ['retreat'], retreatMat: 'gutta' }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: распломбировка' },
    { code: 'A16.07.082.001', block: { tpl: 'endo', merge: true, params: { stages: ['retreat'], retreatMat: 'paste' }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: распломбировка' },
    { code: 'A16.07.082.002', block: { tpl: 'endo', merge: true, params: { stages: ['retreat'], retreatMat: 'resorcin' }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: распломбировка' },
    { code: 'A16.07.030.003', block: { tpl: 'endo', merge: true, params: { stages: ['tempfill'] } }, label: 'Эндо: временное пломбирование каналов' },
    { code: 'A16.07.030.002', block: { tpl: 'endo', merge: true, params: { stages: ['shaping'], hard: true }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: обработка (плохо проходимые)' },
    { code: 'A16.07.030', name: /конусност/i, block: { tpl: 'endo', merge: true, params: { stages: ['shaping'], instr: 'rotary' }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: обработка NiTi' },
    { code: 'A16.07.030', block: { tpl: 'endo', merge: true, params: { stages: ['shaping'] }, hint: (b, s) => canalHint(b, s.qty) }, label: 'Эндо: обработка каналов' },
    { code: 'A16.07.008.002', block: { tpl: 'endo', merge: true, params: { stages: ['obtur'] }, hint: (b, s) => canalHint(b, countFromName(s.name) || s.qty) }, label: 'Эндо: пломбирование каналов' },
    { code: 'A16.07.082', mod: { tpl: ['caries', 'endo'], set: { grind: true } }, label: 'Сошлифовывание' },
    { code: 'B01.003.004.004', block: { tpl: 'anesthesia', params: { kind: 'Аппликационная', drug: 'гель Lidocaini 10%' }, sort: 1 }, label: 'Аппликационная' },
    { code: 'B01.003.004.005', block: { tpl: 'anesthesia', params: { kind: 'Инфильтрационная' }, sort: 2 }, label: 'Инфильтрационная' },
    { code: 'B01.003.004.002', block: { tpl: 'anesthesia', params: { kind: 'Проводниковая мандибулярная' }, sort: 3 }, label: 'Проводниковая' },
  ];

  const DEFAULT_DURATION = 60;           // минут: начало приёма = окончание − длительность
  const ADMISSION_CONDITION = '1';       // «Удовлетворительное»
  const DIAG_DEFAULTS = { nosologicalDiagnosisType: '1', diseaseNatureType: '2' }; // как в вашем образце

  const fmtTooth = (t) => (String(t).length === 2 ? t[0] + '.' + t[1] : String(t)); // 36 → 3.6

  /* =====================================================================
   *  2. ШАБЛОНЫ
   *  Поля текста: complaints, anamnesisMorbi, anamnesisVitae, objective,
   *  statusLocalis, xray, diagnosis, treatment, recommendations, prognosis
   * ===================================================================== */

  const opt = (v, l, extra) => Object.assign({ v, l: l || v }, extra || {});
  const LINERS = { cal: 'Наложение лечебной прокладки на основе гидроксида кальция. ', gic: 'Наложение изолирующей прокладки из стеклоиономерного цемента. ', flow: 'Наложение изолирующей прокладки из текучего композита. ' };
  const linerText = (arr) => ['cal', 'gic', 'flow'].filter((k) => (arr || []).includes(k)).map((k) => LINERS[k]).join('');

  const ADHESIVES = [opt('тотальное протравливание, адгезивная система 5-го поколения', 'Тотальное травление + 5 пок.'), opt('самопротравливающая адгезивная система', 'Самопротравливающий'), opt('универсальная адгезивная система', 'Универсальный')];
  const MATERIALS = [opt('светоотверждаемым композиционным материалом'), opt('текучим и пакуемым светоотверждаемым композитом'), opt('стеклоиономерным цементом'), opt('компомером')];
  const LINER_OPTS = [opt('cal', 'Лечебная (Ca(OH)₂)'), opt('gic', 'Изолирующая СИЦ'), opt('flow', 'Изолирующая текучий')];

  // каналы по умолчанию по группе зуба (FDI)
  function canalsForTooth(t) {
    const q = +String(t)[0], n = +String(t)[1], upper = [1, 2, 5, 6].includes(q);
    if (q >= 5) return n >= 4 ? (upper ? ['МЩ', 'ДЩ', 'Н'] : ['МЩ', 'МЯ', 'Д']) : ['К'];
    if (upper) return n === 4 ? ['Щ', 'Н'] : n >= 6 ? ['МЩ', 'ДЩ', 'Н'] : ['К'];
    return n >= 6 ? ['МЩ', 'МЯ', 'Д'] : ['К'];
  }
  // «корневого канала» / «канала Н» / «каналов МЩ, МЯ, Д»
  const canalsGen = (c) => (!c || !c.length ? 'корневых каналов' : c.length === 1 ? (c[0] === 'К' ? 'корневого канала' : 'канала ' + c[0]) : 'каналов ' + c.join(', '));
  const overlap = (a, b) => a.teeth.some((t) => b.teeth.includes(t));

  // Назначения после хирургических вмешательств — тексты можно править здесь
  const RX = {
    pain: 'При болях — Нимесил (1 пакетик) или Найз (1 таблетка).',
    abx: {
      amx500: { l: 'Амоксиклав 500+125', t: 'Амоксиклав 500 мг + 125 мг по 1 таблетке 2 раза в день в течение 5 дней.' },
      cif: { l: 'Цифран СТ 500', t: 'Цифран СТ 500 мг по 1 таблетке 2 раза в день в течение 5 дней.' },
      amx875: { l: 'Амоксиклав 875+125', t: 'Амоксиклав 875 мг + 125 мг по 1 таблетке 1 раз в день в течение 5 дней.' },
    },
    rinse: {
      chx: { l: 'Хлоргексидин 0,05%', t: 'Ротовые ванночки раствором хлоргексидина 0,05% 3 раза в день после еды в течение 7 дней.' },
      rot: { l: 'Ротокан', t: 'Ротовые ванночки раствором Ротокана (1 чайная ложка на стакан тёплой воды) 3 раза в день после еды в течение 7 дней.' },
    },
  };
  const rxParams = (cond) => [
    { key: 'rxPain', label: 'Обезболивающее', type: 'toggle', default: true, show: cond },
    { key: 'rxAbx', label: 'Антибиотик', type: 'toggle', default: true, show: cond },
    { key: 'abx', label: 'Схема антибиотика', type: 'seg', options: Object.keys(RX.abx).map((k) => opt(k, RX.abx[k].l)), default: 'amx500', show: (p) => cond(p) && p.rxAbx },
    { key: 'rinse', label: 'Полоскания', type: 'seg', options: [opt('', 'Нет')].concat(Object.keys(RX.rinse).map((k) => opt(k, RX.rinse[k].l))), default: '', show: cond },
  ];
  const rxText = (p) => { const a = []; if (p.rxPain) a.push(RX.pain); if (p.rxAbx && RX.abx[p.abx]) a.push(RX.abx[p.abx].t); if (p.rinse && RX.rinse[p.rinse]) a.push(RX.rinse[p.rinse].t); const x = a.join(' '); return x ? 'Назначено: ' + x.charAt(0).toLowerCase() + x.slice(1) : ''; };

  const TEMPLATES = [
    {
      id: 'base', title: 'Общие данные', icon: '📋', fixed: true, order: 0,
      params: [
        { key: 'vitae', label: 'Анамнез жизни', type: 'select', options: [
          opt('Перенесённые и сопутствующие заболевания отрицает. Аллергологический анамнез не отягощён. Гемотрансфузии отрицает.', 'Не отягощён'),
          opt('Сопутствующие заболевания: {vitaeExtra}. Аллергологический анамнез не отягощён.', 'Есть сопутствующие (указать)'),
        ] },
        { key: 'vitaeExtra', label: 'Сопутствующие / аллергия', type: 'text', placeholder: 'например: гипертоническая болезнь' },
        { key: 'hygiene', label: 'Гигиена', type: 'seg', options: [opt('хорошая', 'Хорошая'), opt('удовлетворительная', 'Удовл.'), opt('неудовлетворительная', 'Неудовл.')], default: 'удовлетворительная' },
      ],
      fields: (p) => ({
        anamnesisVitae: p.vitae.replace('{vitaeExtra}', p.vitaeExtra || '___'),
        objective: 'Общее состояние удовлетворительное. Конфигурация лица не изменена, кожные покровы обычной окраски. ' +
          'Регионарные лимфатические узлы не пальпируются. Открывание рта в полном объёме. ' +
          'Слизистая оболочка полости рта бледно-розовая, умеренно увлажнена. Гигиена полости рта ' + p.hygiene + '.',
        prognosis: 'Благоприятный.',
      }),
    },

    {
      id: 'anesthesia', title: 'Анестезия', icon: '💉', order: 10, triggers: ['B01.003.004'], teethFromOthers: true,
      params: [
        { key: 'kind', label: 'Вид', type: 'select', options: [
          opt('Инфильтрационная'), opt('Проводниковая мандибулярная'), opt('Проводниковая торусальная'),
          opt('Проводниковая ментальная'), opt('Проводниковая туберальная'), opt('Проводниковая палатинальная'),
          opt('Интралигаментарная'), opt('Аппликационная'),
        ] },
        { key: 'drug', label: 'Препарат', type: 'select', options: [
          opt('Sol. Articaini 4% c эпинефрином 1:100 000', 'Артикаин 4% + эпинефрин 1:100 000'),
          opt('Sol. Articaini 4% c эпинефрином 1:200 000', 'Артикаин 4% + эпинефрин 1:200 000'),
          opt('Sol. Mepivacaini 3% без вазоконстриктора', 'Мепивакаин 3% без вазоконстриктора'),
          opt('гель Lidocaini 10%', 'Лидокаин 10% (аппликационно)'),
          opt('гель Benzocaini 20%', 'Бензокаин 20% (аппликационно)'),
        ], default: 'Sol. Articaini 4% c эпинефрином 1:200 000' },
        { key: 'qty', label: 'Карпул', type: 'number', default: 1, min: 1, max: 6, show: (p) => p.kind !== 'Аппликационная' },
      ],
      fields: (p, T) => ({
        treatment: p.kind + ' анестезия' + (T.has ? ' в области ' + T.gen : '') + ': ' + p.drug +
          (p.kind === 'Аппликационная' ? '.' : ', ' + p.qty + ' карп. (' + String(+(p.qty * 1.7).toFixed(1)).replace('.', ',') + ' мл).'),
      }),
    },

    {
      id: 'caries', title: 'Кариес', icon: '🦷', position: 'therapist', order: 20, triggers: ['A16.07.002', 'A16.07.031'], needTeeth: true, qtyIsTeeth: true,
      params: [
        { key: 'depth', label: 'Глубина', type: 'seg', options: [
          opt('enamel', 'Эмаль', { mkb: ['K02.0', 'K02.0 Кариес эмали'], word: 'эмали' }),
          opt('dentin', 'Дентин', { mkb: ['K02.1', 'K02.1 Кариес дентина'], word: 'дентина' }),
          opt('cement', 'Цемент', { mkb: ['K02.2', 'K02.2 Кариес цемента'], word: 'цемента' }),
        ], default: 'dentin' },
        { key: 'surf', label: 'Поверхности', type: 'chips', options: [
          opt('окклюзионной', 'O'), opt('медиальной', 'M'), opt('дистальной', 'D'), opt('вестибулярной', 'V'), opt('оральной', 'L/P'), opt('пришеечной', 'Пришеечн.'),
        ], default: ['окклюзионной'] },
        { key: 'black', label: 'Класс по Блэку', type: 'seg', options: ['I', 'II', 'III', 'IV', 'V', 'VI'].map((x) => opt(x)), default: 'I' },
        { key: 'prev', label: 'Ранее', type: 'seg', options: [opt('no', 'Не лечен'), opt('old', 'Старая пломба'), opt('lost', 'Пломба утрачена')], default: 'no' },
        { key: 'isol', label: 'Изоляция', type: 'select', options: [opt('', 'Нет'), opt('коффердамом', 'Коффердам'), opt('ретрактором OptraGate', 'OptraGate'), opt('ватными валиками и слюноотсосом', 'Ватные валики')], default: '' },
        { key: 'material', label: 'Материал', type: 'select', options: MATERIALS },
        { key: 'resto', label: 'Реставрация', type: 'seg', options: [opt('std', 'Обычная'), opt('aesthetic', 'Эстетическая')], default: 'std', adv: true },
        { key: 'since', label: 'Беспокоит', type: 'select', options: [opt('нескольких дней'), opt('1–2 недель'), opt('месяца'), opt('нескольких месяцев'), opt('', 'Не беспокоит (санация)')], default: '1–2 недель', adv: true },
        { key: 'adhesive', label: 'Адгезив', type: 'select', options: ADHESIVES, adv: true },
        { key: 'liner', label: 'Прокладка', type: 'chips', options: LINER_OPTS, default: [], adv: true },
        { key: 'post', label: 'Штифт', type: 'seg', options: [opt('', 'Нет'), opt('fiber', 'Стекловолоконный'), opt('metal', 'Анкерный металлический')], default: '', adv: true },
        { key: 'postCanal', label: 'Штифт в канал', type: 'text', placeholder: 'необязательно, напр.: Н', show: (p) => !!p.post, adv: true },
        { key: 'tempOff', label: 'Снятие врем. пломбы', type: 'toggle', default: false, adv: true },
        { key: 'tempOn', label: 'Временная пломба вместо постоянной', type: 'toggle', default: false, adv: true },
        { key: 'grind', label: 'Сошлифовывание', type: 'toggle', default: false, adv: true },
        { key: 'xray', label: 'Рентген', type: 'seg', options: [opt('', 'Нет'), opt('yes', 'Есть')], default: '', adv: true },
      ],
      mkb: (p, P) => P.depth.mkb,
      fields: (p, T, P) => {
        const surf = (p.surf && p.surf.length ? p.surf.join('-') : '___');
        const complaints = {
          enamel: 'Жалобы на наличие пигментированного пятна (эстетический дефект) ' + T.gen + '.',
          dentin: 'Жалобы на кратковременную боль от сладкого и холодного в области ' + T.gen + ', проходящую сразу после устранения раздражителя.',
          cement: 'Жалобы на кратковременную боль от холодного и при чистке зубов в пришеечной области ' + T.gen + '.',
        }[p.depth];
        const where = 'На ' + surf + ' поверхности ' + T.gen + ' ';
        const lesion = p.prev === 'old' ? 'пломба с нарушением краевого прилегания, под пломбой — кариозная полость в пределах ' + P.depth.word
          : p.prev === 'lost' ? 'пломба частично утрачена, кариозная полость в пределах ' + P.depth.word
          : p.depth === 'enamel' ? 'дефект в пределах эмали с пигментированным дном' : 'кариозная полость в пределах ' + P.depth.word + ', выполненная размягчённым пигментированным дентином';
        const sl = p.tempOff ? 'Временная пломба на ' + T.loc + ' сохранна. ' + where + 'кариозная полость в пределах ' + P.depth.word + ' (под временной пломбой).'
          : where + lesion + '. ' + (p.depth === 'enamel' ? 'Зондирование безболезненно. Перкуссия безболезненна. Реакция на холод отсутствует.'
            : 'Зондирование болезненно по эмалево-дентинной границе. Перкуссия безболезненна. Реакция на холод кратковременная, проходит сразу после устранения раздражителя. ' +
              'Слизистая оболочка в области ' + T.gen + ' без патологических изменений.');
        const t = [];
        if (p.tempOff) t.push('Снятие временной пломбы.');
        if (p.isol) t.push('Изоляция ' + p.isol + '.');
        if (p.prev === 'old') t.push('Удаление старой пломбы.');
        if (p.grind) t.push('Сошлифовывание острых краёв эмали.');
        t.push('Препарирование кариозной полости, некрэктомия. Медикаментозная обработка раствором хлоргексидина 0,05%.');
        if (linerText(p.liner)) t.push(linerText(p.liner).trim());
        if (p.tempOn) t.push('Наложение временной пломбы.');
        else {
          if (p.post) t.push('Установка ' + (p.post === 'fiber' ? 'стекловолоконного' : 'металлического анкерного') + ' штифта' + (p.postCanal ? ' в канал ' + p.postCanal : '') + (p.post === 'fiber' ? ' на композитный цемент.' : '.'));
          t.push('Адгезивная подготовка: ' + p.adhesive + '.');
          t.push(p.resto === 'aesthetic' ? 'Эстетическая реставрация ' + p.material + ' послойно с восстановлением анатомической формы и цвета зуба.' : 'Восстановление ' + p.material + ' послойно.');
          t.push('Финишная обработка, шлифовка, полировка. Окклюзия проверена.');
        }
        const tx = t.join(' ');
        return {
          complaints: p.tempOff ? 'Жалоб нет. Явился для продолжения лечения ' + T.gen + '.' : p.since ? complaints : 'Жалоб нет. Обратился с целью санации полости рта.',
          anamnesisMorbi: (p.since && !p.tempOff ? 'Со слов пациента, ' + T.nom + ' беспокоит в течение ' + p.since + '. ' : '') +
            (p.tempOff ? T.Nom + ' на этапе лечения, под временной пломбой.' : p.prev === 'old' ? 'Ранее ' + T.nom + ' лечен(ы), пломба с нарушением краевого прилегания.'
              : p.prev === 'lost' ? 'Ранее ' + T.nom + ' лечен(ы), пломба частично утрачена.' : 'Ранее по поводу ' + T.gen + ' не лечился.'),
          statusLocalis: sl,
          xray: p.xray ? 'На прицельной рентгенограмме ' + T.gen + ': очаг деструкции твёрдых тканей в пределах ' + P.depth.word + ', связь с полостью зуба не определяется, периапикальные ткани без патологических изменений.' : '',
          diagnosis: P.depth.mkb[1].replace(/^K\S+\s/, '') + ' ' + T.gen + ' (' + p.black + ' класс по Блэку), ' + P.depth.mkb[0] + '.',
          treatment: T.Nom + ': ' + tx.charAt(0).toLowerCase() + tx.slice(1),
          recommendations: (p.tempOn ? 'Бережно относиться к временной пломбе, не жевать на стороне лечения. Явка для постоянной реставрации по записи. '
            : 'Не принимать пищу 2 часа. ') + 'Индивидуальная гигиена полости рта 2 раза в день, использование флосса. Контрольный осмотр через 6 месяцев.',
        };
      },
    },

    {
      id: 'prevent', title: 'Герметизация / ICON / фторирование', icon: '🛡️', position: 'therapist', order: 18, teethOptional: true,
      params: [
        { key: 'method', label: 'Метод', type: 'seg', options: [opt('seal', 'Герметизация фиссур'), opt('icon', 'ICON'), opt('fluor', 'Глубокое фторирование')], default: 'seal' },
        { key: 'diag', label: 'Диагноз', type: 'select', options: [
          opt('', 'По методу'),
          opt('K02.0', 'Кариес эмали, стадия пятна (K02.0)', { mkb: ['K02.0', 'K02.0 Кариес эмали'], name: 'Кариес эмали (стадия пятна)' }),
          opt('K03.8', 'Гиперестезия твёрдых тканей (K03.8)', { mkb: ['K03.8', 'K03.8 Другие уточненные болезни твердых тканей зубов'], name: 'Гиперестезия твёрдых тканей зубов' }),
        ], default: '' },
      ],
      check: (b) => (b.params.method !== 'fluor' && !b.teeth.length ? [{ lvl: 'bad', text: 'Герметизация / ICON: выберите зубы' }] : []),
      mkb: (p, P) => (p.diag ? P.diag : p.method === 'fluor' ? { mkb: ['K03.8', 'K03.8 Другие уточненные болезни твердых тканей зубов'] } : { mkb: ['K02.0', 'K02.0 Кариес эмали'] }).mkb,
      fields: (p, T, P) => {
        const D = p.diag ? P.diag : p.method === 'fluor' ? { mkb: ['K03.8'], name: 'Гиперестезия твёрдых тканей зубов' } : { mkb: ['K02.0'], name: 'Кариес эмали (стадия пятна)' };
        const at = T.has ? ' ' + T.gen : '';
        const R = { diagnosis: D.name + at + ', ' + D.mkb[0] + '.' };
        if (p.method === 'seal') {
          R.complaints = 'Жалоб нет. Обратился с целью профилактики кариеса.';
          R.statusLocalis = 'Фиссуры' + at + ' глубокие, узкие, пигментированные, эмаль без кариозных дефектов. Зондирование безболезненно.';
          R.treatment = 'Герметизация фиссур' + at + ': очищение фиссур, изоляция, протравливание, нанесение и светоотверждение герметика. Окклюзия проверена.';
          R.recommendations = 'Не принимать пищу 1 час. Индивидуальная гигиена полости рта 2 раза в день. Контрольный осмотр через 6 месяцев.';
        } else if (p.method === 'icon') {
          R.complaints = 'Жалобы на наличие белых пятен на зубах (эстетический дефект).';
          R.statusLocalis = 'На поверхности' + at + ' меловидные пятна в пределах эмали, поверхность гладкая, зондирование безболезненно, реакция на холод отсутствует.';
          R.treatment = 'Лечение начального кариеса' + at + ' методом инфильтрации (ICON): изоляция, протравливание, высушивание, нанесение инфильтранта, светоотверждение, полирование.';
          R.recommendations = 'Не принимать окрашивающие продукты в течение суток. Индивидуальная гигиена полости рта 2 раза в день. Контрольный осмотр через 6 месяцев.';
        } else {
          R.complaints = 'Жалобы на повышенную чувствительность зубов от холодного, кислого и сладкого.';
          R.statusLocalis = 'Эмаль' + at + ' без кариозных дефектов. Зондирование пришеечной области чувствительно, реакция на холод кратковременная.';
          R.treatment = 'Глубокое фторирование эмали' + at + ': очищение поверхности зубов, изоляция, высушивание, нанесение фторсодержащего препарата.';
          R.recommendations = 'Не принимать пищу и не полоскать рот 1 час. Использовать зубную пасту для чувствительных зубов.';
        }
        return R;
      },
    },

    {
      id: 'hygiene', title: 'Профгигиена', icon: '✨', position: 'therapist', order: 15,
      params: [
        { key: 'scope', label: 'Объём', type: 'seg', options: [opt('full', 'Полный комплекс'), opt('partial', 'Менее 14 зубов'), opt('teeth', 'Отдельные зубы')], default: 'full' },
        { key: 'diag', label: 'Диагноз', type: 'select', options: [
          opt('K03.6', 'Зубные отложения (K03.6)', { mkb: ['K03.6', 'K03.6 Отложения [наросты] на зубах'], name: 'Зубные отложения' }),
          opt('K05.1', 'Хронический гингивит (K05.1)', { mkb: ['K05.1', 'K05.1 Хронический гингивит'], name: 'Хронический генерализованный катаральный гингивит' }),
          opt('K05.3', 'Хронический пародонтит (K05.3)', { mkb: ['K05.3', 'K05.3 Хронический пародонтит'], name: 'Хронический генерализованный пародонтит' }),
        ], default: 'K03.6' },
        { key: 'dep', label: 'Отложения', type: 'chips', options: [opt('мягкий зубной налёт', 'Мягкий налёт'), opt('пигментированный налёт', 'Пигментированный'), opt('наддесневой зубной камень', 'Наддесневой камень'), opt('поддесневой зубной камень', 'Поддесневой камень')], default: ['мягкий зубной налёт', 'наддесневой зубной камень'] },
        { key: 'gum', label: 'Десна', type: 'seg', options: [opt('calm', 'Без воспаления'), opt('inflamed', 'Гиперемия, кровоточивость')], default: 'calm' },
        { key: 'index', label: 'Индекс гигиены', type: 'text', placeholder: 'необязательно, напр.: OHI-S 2,1' },
        { key: 'isol', label: 'Изоляция', type: 'seg', options: [opt('', 'Нет'), opt('ретрактором OptraGate', 'OptraGate')], default: '' },
        { key: 'us', label: 'Ультразвук', type: 'toggle', default: true },
        { key: 'air', label: 'Air-Flow', type: 'toggle', default: true },
        { key: 'polish', label: 'Полировка', type: 'toggle', default: true },
        { key: 'fluor', label: 'Фторсодержащий препарат', type: 'toggle', default: false },
        { key: 'rx', label: 'Назначения', type: 'toggle', default: false },
        { key: 'rinse', label: 'Полоскания', type: 'seg', options: [opt('', 'Нет'), opt('chx', 'Хлоргексидин 0,05%')], default: 'chx', show: (p) => p.rx },
        { key: 'gel', label: 'Гель', type: 'seg', options: [opt('', 'Нет'), opt('Метрогил Дента'), opt('Холисал'), opt('Асепта')], default: 'Метрогил Дента', show: (p) => p.rx },
      ],
      teethOptional: true,
      check: (b) => (b.params.scope === 'teeth' && !b.teeth.length ? [{ lvl: 'bad', text: 'Профгигиена: выберите зубы' }] : []),
      mkb: (p, P) => P.diag.mkb,
      fields: (p, T, P) => {
        const where = (p.scope === 'full' ? ' (полный комплекс)' : p.scope === 'partial' ? ' (менее 14 зубов)' : '') + (p.scope !== 'full' && T.has ? ' в области ' + T.gen : '');
        const dep = (p.dep || []).length ? p.dep.join(', ') : 'незначительное количество мягкого налёта';
        const inflamed = p.gum === 'inflamed' || p.diag !== 'K03.6';
        const steps = [];
        if (p.isol) steps.push('Изоляция ' + p.isol + '.');
        if (p.us) steps.push('Удаление над- и поддесневых зубных отложений ультразвуковым скейлером.');
        if (p.air) steps.push('Удаление мягкого и пигментированного налёта воздушно-абразивным методом (Air-Flow).');
        if (p.polish) steps.push('Полировка поверхностей зубов полировочными пастами и щётками.');
        if (p.fluor) steps.push('Покрытие зубов фторсодержащим препаратом.');
        steps.push('Обучение индивидуальной гигиене полости рта, подбор средств гигиены.');
        const r = ['В течение 2–3 часов не принимать пищу, не курить, исключить окрашивающие продукты в течение суток.',
          'Чистка зубов 2 раза в день щёткой средней жёсткости в течение 2–3 минут, использование зубной нити (флосса), ирригатора.',
          'Профессиональная гигиена полости рта каждые 6 месяцев.'];
        if (p.rx && p.rinse) r.push('Полоскания раствором хлоргексидина 0,05% 2 раза в день после чистки зубов в течение 7 дней.');
        if (p.rx && p.gel) r.push('Аппликации геля «' + p.gel + '» на десну 2 раза в день после чистки зубов в течение 7–10 дней.');
        return {
          complaints: inflamed ? 'Жалобы на наличие зубных отложений, кровоточивость дёсен при чистке зубов.' : 'Жалобы на наличие зубных отложений. Обратился с целью профессиональной гигиены полости рта.',
          anamnesisMorbi: 'Последняя профессиональная гигиена полости рта — более 6 месяцев назад.',
          statusLocalis: 'Зубные отложения: ' + dep + (p.scope !== 'full' && T.has ? ' в области ' + T.gen : '') + '. ' +
            (inflamed ? 'Десна гиперемирована, отёчна, кровоточит при зондировании.' : 'Десна бледно-розовая, без признаков воспаления.') +
            (p.index ? ' Индекс гигиены: ' + p.index + '.' : ''),
          diagnosis: P.diag.name + ', ' + P.diag.mkb[0] + '.',
          treatment: 'Профессиональная гигиена полости рта' + where + '. ' + steps.join(' '),
          recommendations: r.join(' '),
        };
      },
    },

    {
      id: 'endo', title: 'Эндодонтия', icon: '🪥', position: 'therapist', order: 25, needTeeth: true,
      params: [
        { key: 'visit', label: 'Посещение', type: 'seg', options: [opt('first', 'Первичное'), opt('repeat', 'Повторное')], default: 'first' },
        { key: 'diag', label: 'Диагноз', type: 'select', options: [
          opt('acute_p', 'Острый пульпит (K04.0)', { mkb: ['K04.0', 'K04.0 Пульпит'], name: 'Острый пульпит', perc: 'безболезненна' }),
          opt('chronic_p', 'Хронический пульпит (K04.0)', { mkb: ['K04.0', 'K04.0 Пульпит'], name: 'Хронический пульпит', perc: 'безболезненна' }),
          opt('acute_ap', 'Острый периодонтит (K04.4)', { mkb: ['K04.4', 'K04.4 Острый апикальный периодонтит пульпарного происхождения'], name: 'Острый апикальный периодонтит', perc: 'резко болезненна' }),
          opt('chronic_ap', 'Хронический периодонтит (K04.5)', { mkb: ['K04.5', 'K04.5 Хронический апикальный периодонтит'], name: 'Хронический апикальный периодонтит', perc: 'безболезненна' }),
        ], default: 'chronic_p' },
        { key: 'stages', label: 'Этапы', type: 'chips', options: [
          opt('wall', 'Восст. стенки'), opt('pulpotomy', 'Пульпотомия'), opt('extirp', 'Экстирпация'), opt('retreat', 'Распломбировка'),
          opt('shaping', 'Обработка каналов'), opt('tempfill', 'Врем. пломбир. каналов'), opt('obtur', 'Пломбирование каналов'),
        ], default: [] },
        { key: 'canals', label: 'Каналы', type: 'chips', options: ['К', 'Щ', 'Н', 'В', 'Я', 'МЩ', 'МЩ2', 'МЯ', 'ДЩ', 'ДЯ', 'Д'].map((x) => opt(x)), default: [] },
        { key: 'wl', label: 'Рабочие длины', type: 'text', placeholder: 'необязательно, напр.: МЩ 20, МЯ 20,5, Д 21', show: (p) => (p.stages || []).some((x) => x === 'shaping' || x === 'obtur'), adv: true },
        { key: 'isol', label: 'Изоляция', type: 'select', options: [opt('', 'Нет'), opt('коффердамом', 'Коффердам'), opt('ретрактором OptraGate', 'OptraGate'), opt('ватными валиками и слюноотсосом', 'Ватные валики')], default: '' },
        { key: 'prev', label: 'Ранее', type: 'seg', options: [opt('no', 'Не лечен'), opt('old', 'Старая пломба'), opt('crown', 'Иск. коронка')], default: 'no', show: (p) => p.visit === 'first' },
        { key: 'retreatMat', label: 'Ранее пломбированы', type: 'seg', options: [
          opt('paste', 'Паста', { t: 'пастой' }), opt('gutta', 'Гуттаперча', { t: 'гуттаперчей' }), opt('resorcin', 'Резорцин-формалин / фосфат-цемент', { t: 'резорцин-формалиновым методом (фосфат-цементом)' }),
        ], default: 'paste', show: (p) => (p.stages || []).includes('retreat') },
        { key: 'instr', label: 'Инструменты', type: 'select', options: [
          opt('rotary', 'Ротационные NiTi', { t: 'ротационными NiTi-инструментами' }), opt('recip', 'Реципрокные NiTi', { t: 'реципрокными NiTi-инструментами' }), opt('hand', 'Ручные К-файлы', { t: 'ручными К-файлами' }),
        ], default: 'rotary', show: (p) => (p.stages || []).includes('shaping'), adv: true },
        { key: 'hard', label: 'Труднопроходимые', type: 'toggle', default: false, show: (p) => (p.stages || []).includes('shaping'), adv: true },
        { key: 'irrig', label: 'Ирригация', type: 'select', options: [
          opt('naocl', 'Гипохлорит натрия 3%', { t: 'раствором гипохлорита натрия 3%' }),
          opt('naocl_edta', 'Гипохлорит + ЭДТА 17%', { t: 'растворами гипохлорита натрия 3% и ЭДТА 17%' }),
          opt('naocl_edta_chx', 'Гипохлорит + ЭДТА + хлоргексидин', { t: 'растворами гипохлорита натрия 3%, ЭДТА 17%, финальная ирригация хлоргексидином 2%' }),
          opt('chx', 'Хлоргексидин 2%', { t: 'раствором хлоргексидина 2%' }),
        ], default: 'naocl', show: (p) => (p.stages || []).includes('shaping'), adv: true },
        { key: 'us', label: 'УЗ-активация', type: 'toggle', default: true, show: (p) => (p.stages || []).includes('shaping'), adv: true },
        { key: 'caoh', label: 'Препарат в каналы', type: 'select', options: [opt('пастой на основе гидроксида кальция', 'Гидроксид кальция'), opt('пастой на основе гидроксида кальция с йодоформом', 'Гидроксид кальция + йодоформ')], show: (p) => (p.stages || []).includes('tempfill'), adv: true },
        { key: 'method', label: 'Метод', type: 'seg', options: [
          opt('lateral', 'Латеральная', { t: 'латеральной конденсации' }), opt('vertical', 'Вертикальная', { t: 'горячей вертикальной конденсации' }), opt('single', 'Одиночный штифт', { t: 'одиночного штифта' }),
        ], default: 'lateral', show: (p) => (p.stages || []).includes('obtur'), adv: true },
        { key: 'sealer', label: 'Силер', type: 'seg', options: [
          opt('epoxy', 'Эпоксидный', { t: 'эпоксидным силером' }), opt('bio', 'Биокерамический', { t: 'биокерамическим силером' }), opt('zoe', 'Цинкоксидэвгенольный', { t: 'цинкоксидэвгенольным силером' }),
        ], default: 'epoxy', show: (p) => (p.stages || []).includes('obtur'), adv: true },
        { key: 'ctrl', label: 'Контрольный снимок', type: 'toggle', default: false, show: (p) => (p.stages || []).includes('obtur'), adv: true },
        { key: 'finish', label: 'Завершение', type: 'seg', options: [opt('temp', 'Временная пломба'), opt('perm', 'Постоянная реставрация'), opt('none', 'Без пломбы')], default: 'temp' },
        { key: 'material', label: 'Материал', type: 'select', options: MATERIALS, show: (p) => p.finish === 'perm' },
        { key: 'post', label: 'Штифт', type: 'seg', options: [opt('', 'Нет'), opt('fiber', 'Стекловолоконный'), opt('metal', 'Анкерный металлический')], default: '', show: (p) => p.finish === 'perm', adv: true },
        { key: 'postCanal', label: 'Штифт в канал', type: 'text', placeholder: 'необязательно, напр.: Н', show: (p) => p.finish === 'perm' && !!p.post, adv: true },
        { key: 'liner', label: 'Прокладка', type: 'chips', options: LINER_OPTS, default: [], show: (p) => p.finish === 'perm', adv: true },
        { key: 'adhesive', label: 'Адгезив', type: 'select', options: ADHESIVES, show: (p) => p.finish === 'perm', adv: true },
        { key: 'grind', label: 'Сошлифовывание', type: 'toggle', default: false, adv: true },
        { key: 'perc', label: 'Перкуссия', type: 'seg', options: [opt('', 'По диагнозу'), opt('безболезненна', 'Безбол.'), opt('слабоболезненна', 'Слабобол.'), opt('резко болезненна', 'Резко бол.')], default: '', adv: true },
        { key: 'xray', label: 'Рентген', type: 'toggle', default: true, show: (p) => p.visit === 'first', adv: true },
        { key: 'follow', label: 'Повторная явка', type: 'toggle', default: false, adv: true },
        { key: 'days', label: 'Явка через', type: 'seg', options: [opt('3–5 дней'), opt('7 дней'), opt('14 дней')], default: '7 дней', show: (p) => p.follow, adv: true },
      ],
      onTeeth: (b) => { if (!b.touched.canals) b.params.canals = b.teeth.length ? canalsForTooth(b.teeth[0]) : []; },
      finalize: (b, blocks) => {
        const st = b.params.stages || [];
        if (st.some((x) => ['pulpotomy', 'extirp', 'retreat'].includes(x))) b.params.visit = 'first';
        else if (st.includes('obtur')) { b.params.visit = 'repeat'; b.auto.visit = 1; }
        if (st.includes('retreat')) { b.params.diag = 'chronic_ap'; b.auto.diag = 1; }
        if (b.hints.filled) { b.params.finish = 'perm'; b.auto.finish = 1; }
        else if (st.includes('tempfill') && !b.auto.finish) { b.params.finish = 'temp'; b.auto.finish = 1; }
      },
      check: (b) => {
        const out = [], n = b.hints.count, c = (b.params.canals || []).length;
        if (!(b.params.stages || []).length) out.push({ lvl: 'warn', text: 'Эндодонтия: не отмечен ни один этап' });
        if (n && c && n !== c) out.push({ lvl: 'warn', text: 'Эндодонтия ' + b.teeth.map(fmtTooth).join(', ') + ': каналов в услугах ' + n + ', отмечено ' + c });
        return out;
      },
      mkb: (p, P) => P.diag.mkb,
      fields: (p, T, P, X) => {
        const st = p.stages || [], has = (k) => st.includes(k), C = canalsGen(p.canals), D = P.diag;
        const first = p.visit === 'first', retreat = has('retreat');
        const restored = p.finish === 'perm';
        const perc = p.perc || D.perc;
        const R = { diagnosis: D.name + ' ' + T.gen + ', ' + D.mkb[0] + '.' };
        if (first) {
          R.complaints = {
            acute_p: 'Жалобы на самопроизвольную приступообразную боль в области ' + T.gen + ', усиливающуюся от температурных раздражителей и в ночное время.',
            chronic_p: 'Жалобы на ноющую боль от холодного и горячего в области ' + T.gen + ', не проходящую сразу после устранения раздражителя.',
            acute_ap: 'Жалобы на постоянную ноющую боль в области ' + T.gen + ', усиливающуюся при накусывании, ощущение «выросшего» зуба.',
            chronic_ap: 'Жалобы на дискомфорт при накусывании на ' + T.acc + '.',
          }[p.diag];
          R.anamnesisMorbi = {
            acute_p: 'Со слов пациента, боль появилась 1–2 дня назад.',
            chronic_p: 'Со слов пациента, боль от раздражителей беспокоит длительное время, периодически усиливается.',
            acute_ap: 'Со слов пациента, боль появилась несколько дней назад и постепенно усиливается.',
            chronic_ap: 'Со слов пациента, ' + T.nom + ' периодически беспокоит длительное время.',
          }[p.diag] + (retreat ? ' Ранее ' + T.nom + ' лечен(ы) эндодонтически.' : '');
          const cav = p.prev === 'crown' ? 'На ' + T.loc + ' искусственная коронка.'
            : retreat || p.prev === 'old' ? 'На ' + T.loc + ' пломба с нарушением краевого прилегания.'
            : p.diag === 'acute_p' ? 'На ' + T.loc + ' глубокая кариозная полость, выполненная размягчённым дентином.'
            : 'На ' + T.loc + ' глубокая кариозная полость, сообщающаяся с полостью зуба.';
          const probe = { acute_p: 'Зондирование дна резко болезненно в одной точке. Реакция на холод резко болезненная, длительная.',
            chronic_p: 'Зондирование в точке сообщения с полостью зуба болезненно, кровоточивость. Реакция на холод болезненная, медленно проходящая.',
            acute_ap: 'Зондирование безболезненно. Реакция на холод отсутствует.', chronic_ap: 'Зондирование безболезненно. Реакция на холод отсутствует.' }[p.diag];
          const muc = p.diag === 'acute_ap' ? 'Слизистая оболочка в проекции верхушки корня гиперемирована, отёчна, пальпация болезненна.'
            : 'Слизистая оболочка в области ' + T.gen + ' без патологических изменений.';
          R.statusLocalis = [cav, p.prev === 'crown' ? '' : retreat ? 'Реакция на холод отсутствует.' : probe, 'Перкуссия ' + perc + '.', muc].filter(Boolean).join(' ');
          if (p.xray) {
            const peri = { acute_p: 'периапикальные ткани без патологических изменений', chronic_p: 'периапикальные ткани без патологических изменений',
              acute_ap: 'расширение периодонтальной щели в области верхушки корня', chronic_ap: 'очаг деструкции костной ткани в области верхушки корня' }[p.diag];
            R.xray = 'На прицельной рентгенограмме ' + T.gen + ': ' +
              (retreat ? 'корневые каналы запломбированы не на всём протяжении, неоднородно; ' : p.diag === 'acute_p' ? 'глубокая кариозная полость близко к полости зуба; ' : 'кариозная полость сообщается с полостью зуба; ') + peri + '.';
          }
        } else {
          R.complaints = 'Жалоб нет. Явился для продолжения эндодонтического лечения ' + T.gen + '.';
          R.anamnesisMorbi = T.Nom + ' на этапе эндодонтического лечения.';
          R.statusLocalis = 'Временная пломба на ' + T.loc + ' сохранна. Перкуссия ' + (p.perc || 'безболезненна') + '. Слизистая оболочка в области ' + T.gen + ' без патологических изменений.';
        }
        const t = [];
        if (!first) t.push('Снятие временной пломбы, удаление временного пломбировочного материала из корневых каналов.');
        else if (p.prev === 'crown') t.push('Трепанация искусственной коронки, раскрытие полости зуба.');
        else if (retreat || p.prev === 'old') t.push('Удаление старой пломбы, раскрытие полости зуба.');
        else t.push('Препарирование кариозной полости, некрэктомия, раскрытие полости зуба.');
        if (p.grind) t.push('Сошлифовывание острых краёв эмали.');
        if (has('wall')) t.push('Восстановление стенки ' + T.gen + ' для создания условий эндодонтического лечения.');
        if (p.isol) t.push('Изоляция ' + p.isol + '.');
        if (has('pulpotomy')) t.push('Ампутация коронковой пульпы.');
        if (has('extirp')) t.push('Экстирпация пульпы из ' + C + '.');
        if (retreat) t.push('Распломбировка ' + C + ', ранее пломбированных ' + P.retreatMat.t + '.');
        if (has('shaping')) t.push('Определение рабочей длины апекслокатором' + (p.wl ? ': ' + p.wl : '') + '. ' +
          (p.hard ? 'Каналы труднопроходимы, проходимость восстановлена с использованием хелатирующего геля. ' : '') +
          'Инструментальная обработка ' + C + ' ' + P.instr.t + '. Медикаментозная обработка ' + P.irrig.t + (p.us ? ' с ультразвуковой активацией' : '') + '.');
        if (has('tempfill') || has('obtur')) t.push('Высушивание каналов бумажными штифтами.');
        if (has('tempfill')) t.push('Временное пломбирование ' + C + ' ' + p.caoh + '.');
        if (has('obtur')) t.push('Пломбирование ' + C + ' гуттаперчевыми штифтами методом ' + P.method.t + ' с ' + P.sealer.t + '.');
        if (has('obtur') && p.ctrl) t.push('Контрольная рентгенограмма: каналы запломбированы до физиологической верхушки, гомогенно.');
        if (p.finish === 'temp') t.push('Наложение временной пломбы.');
        if (p.finish === 'perm') t.push('Восстановление коронковой части зуба: ' +
          (p.post ? 'установка ' + (p.post === 'fiber' ? 'стекловолоконного' : 'металлического анкерного') + ' штифта' + (p.postCanal ? ' в канал ' + p.postCanal : '') + (p.post === 'fiber' ? ' на композитный цемент' : '') + '. ' : '') +
          (linerText(p.liner) ? linerText(p.liner).charAt(0).toLowerCase() + linerText(p.liner).slice(1) : '') +
          (p.post || linerText(p.liner) ? 'Адгезивная' : 'адгезивная') + ' подготовка: ' + p.adhesive + '. Реставрация ' + p.material + ' послойно. Финишная обработка, шлифовка, полировка. Окклюзия проверена.');
        const tx = t.join(' ');
        R.treatment = T.Nom + ': ' + tx.charAt(0).toLowerCase() + tx.slice(1);
        const r = ['Не принимать пищу 2 часа.'];
        if (p.finish === 'temp') r.push('Бережно относиться к временной пломбе, не жевать на стороне лечения.');
        if (has('obtur')) r.push('Возможна болезненность при накусывании в течение нескольких дней.');
        if (has('obtur') && p.finish === 'temp') r.push('Восстановление коронковой части ' + T.gen + ' в ближайшее время.');
        if (p.finish === 'none') r.push('Рекомендовано ортопедическое лечение (восстановление ' + T.gen + ' коронкой).');
        if (restored) r.push('Контрольный осмотр и рентгенограмма через 6 месяцев.');
        if (p.follow) r.push('Явка через ' + p.days + '.');
        r.push('При появлении боли или отёка — обратиться в клинику.');
        R.recommendations = r.join(' ');
        return R;
      },
    },

    {
      id: 'crown', title: 'Коронка', icon: '👑', position: 'orthopedist', order: 30, triggers: ['A16.07.004'], needTeeth: true, qtyIsTeeth: true,
      params: [
        { key: 'stage', label: 'Этап', type: 'seg', options: [opt('prep', 'Препарирование'), opt('try', 'Примерка'), opt('fix', 'Фиксация')], default: 'prep' },
        { key: 'type', label: 'Коронка', type: 'select', options: [
          opt('mk', 'Металлокерамическая', { acc: 'металлокерамическую коронку', gen: 'металлокерамической коронки' }),
          opt('zr', 'Диоксид циркония', { acc: 'коронку из диоксида циркония', gen: 'коронки из диоксида циркония' }),
          opt('emax', 'Дисиликат лития', { acc: 'цельнокерамическую коронку из дисиликата лития', gen: 'цельнокерамической коронки из дисиликата лития' }),
          opt('cast', 'Цельнолитая', { acc: 'цельнолитую коронку', gen: 'цельнолитой коронки' }),
          opt('temp', 'Временная (PMMA)', { acc: 'временную коронку', gen: 'временной коронки' }),
        ] },
        { key: 'mkb', label: 'Диагноз', type: 'select', options: [
          opt('K08.8', 'K08.8 Другие уточн. изменения зубов', { mkb: ['K08.8', 'K08.8 Другие уточненные изменения зубов и их опорного аппарата'] }),
          opt('K02.1', 'K02.1 Кариес дентина', { mkb: ['K02.1', 'K02.1 Кариес дентина'] }),
          opt('K08.1', 'K08.1 Потеря зубов', { mkb: ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни'] }),
        ] },
        { key: 'iropz', label: 'ИРОПЗ', type: 'seg', options: ['0,5', '0,6', '0,7', '0,8'].map((x) => opt(x)), default: '0,6', show: (p) => p.stage === 'prep' },
        { key: 'base', label: 'Культя', type: 'select', options: [opt('депульпирован, корневые каналы запломбированы'), opt('витальный'), opt('восстановлен культевой штифтовой вкладкой'), opt('восстановлен композитом на стекловолоконном штифте')], show: (p) => p.stage === 'prep' },
        { key: 'ledge', label: 'Уступ', type: 'seg', options: [opt('уступа-шамфера', 'Шамфер'), opt('плечевого уступа', 'Плечо 90°'), opt('символического уступа', 'Символич.')], show: (p) => p.stage === 'prep' },
        { key: 'retr', label: 'Ретракция нитью', type: 'toggle', default: true, show: (p) => p.stage === 'prep' },
        { key: 'imp', label: 'Оттиск', type: 'select', options: [opt('двухслойного оттиска А-силиконом'), opt('двухслойного оттиска С-силиконом'), opt('цифрового оттиска (интраоральное сканирование)')], show: (p) => p.stage === 'prep' },
        { key: 'shade', label: 'Цвет', type: 'text', placeholder: 'A2', show: (p) => p.stage === 'prep' },
        { key: 'tempc', label: 'Временная коронка', type: 'toggle', default: true, show: (p) => p.stage === 'prep' },
        { key: 'cement', label: 'Цемент', type: 'select', options: [opt('стеклоиономерного цемента', 'СИЦ'), opt('самоадгезивного композитного цемента', 'Самоадгезивный композитный'), opt('композитного цемента двойного отверждения', 'Композитный двойного отв.'), opt('временного цемента', 'Временный')], show: (p) => p.stage === 'fix' },
        { key: 'corr', label: 'Коррекция', type: 'toggle', default: false, show: (p) => p.stage !== 'prep' },
      ],
      mkb: (p, P) => P.mkb.mkb,
      fields: (p, T, P) => {
        const ct = P.type;
        const R = {
          diagnosis: P.mkb.mkb[1].replace(/^K\S+\s/, '') + ' ' + T.gen + (p.stage === 'prep' ? ' (ИРОПЗ ' + p.iropz + ')' : '') + ', ' + P.mkb.mkb[0] + '.',
          prognosis: 'Благоприятный.',
        };
        if (p.stage === 'prep') {
          R.complaints = 'Жалобы на эстетический дефект и разрушение коронковой части ' + T.gen + '.';
          R.anamnesisMorbi = T.Nom + ' ранее лечен(ы), ' + p.base + '. Направлен на ортопедическое лечение.';
          R.statusLocalis = 'Коронковая часть ' + T.gen + ' разрушена, ИРОПЗ ' + p.iropz + '. Перкуссия безболезненна, патологическая подвижность отсутствует. Десна в области ' + T.gen + ' без признаков воспаления.';
          R.treatment = 'Препарирование ' + T.gen + ' под ' + ct.acc + ' с формированием ' + p.ledge + '. ' +
            (p.retr ? 'Ретракция десны ретракционной нитью. ' : '') + 'Получение ' + p.imp + ', регистрация прикуса. ' +
            (p.shade ? 'Определение цвета: ' + p.shade + '. ' : 'Определение цвета. ') +
            (p.tempc ? 'Изготовление временной коронки, фиксация на временный цемент. ' : '') + 'Окклюзия проверена.';
          R.recommendations = 'Бережное отношение к ' + (p.tempc ? 'временной коронке' : 'препарированному зубу') + ', избегать вязкой и твёрдой пищи. ' +
            'При расцементировке или поломке временной коронки — обратиться в клинику. Явка на следующий этап по записи.';
        } else if (p.stage === 'try') {
          R.complaints = 'Жалоб нет. Явился на примерку ' + ct.gen + '.';
          R.statusLocalis = 'Временная коронка на ' + T.loc + ' сохранна. Десна в области ' + T.gen + ' без признаков воспаления.';
          R.treatment = 'Снятие временной коронки. Примерка ' + ct.gen + ' на ' + T.acc + ': проверены краевое прилегание, контактные пункты, окклюзионные соотношения. ' +
            (p.corr ? 'Проведена коррекция окклюзионных контактов. ' : 'Коррекция не потребовалась. ') + 'Фиксация временной коронки на временный цемент.';
          R.recommendations = 'Бережное отношение к временной коронке. Явка на фиксацию по записи.';
        } else {
          R.complaints = 'Жалоб нет. Явился на фиксацию ' + ct.gen + '.';
          R.statusLocalis = 'Десна в области ' + T.gen + ' без признаков воспаления. Культя зуба сохранна.';
          R.treatment = 'Снятие временной коронки, очистка культи. Проверка краевого прилегания, контактных пунктов и окклюзии. ' +
            (p.corr ? 'Коррекция окклюзионных контактов, полировка. ' : '') + 'Фиксация ' + ct.gen + ' на ' + T.acc + ' с использованием ' + p.cement +
            '. Удаление излишков цемента. Окклюзия проверена.';
          R.recommendations = 'Не принимать пищу 1–2 часа. Тщательная гигиена полости рта, использование флосса и ирригатора. Контрольный осмотр через 6 месяцев.';
        }
        return R;
      },
    },

    {
      id: 'extraction', title: 'Удаление зуба', icon: '🔧', position: 'surgeon', order: 40, triggers: ['A16.07.001', 'A16.07.024'], needTeeth: true, qtyIsTeeth: true,
      params: [
        { key: 'method', label: 'Удаление', type: 'seg', options: [opt('simple', 'Простое'), opt('complex', 'С разъединением корней'), opt('impacted', 'Ретенир. / дистопир.')], default: 'simple' },
        { key: 'mkb', label: 'Диагноз', type: 'select', options: [
          opt('K04.5', 'K04.5 Хр. апикальный периодонтит', { mkb: ['K04.5', 'K04.5 Хронический апикальный периодонтит'], dn: 'Хронический апикальный периодонтит', st: 'разрушена', xr: 'расширение периодонтальной щели, очаг деструкции костной ткани в области верхушки корня' }),
          opt('K08.3', 'K08.3 Оставшийся корень зуба', { mkb: ['K08.3', 'K08.3 Оставшийся корень зуба'], dn: 'Оставшийся корень', st: 'отсутствует, корень ниже уровня десны', xr: 'корень зуба, периапикальные изменения' }),
          opt('K05.3', 'K05.3 Хронический пародонтит', { mkb: ['K05.3', 'K05.3 Хронический пародонтит'], dn: 'Хронический пародонтит в области', st: 'сохранна', xr: 'резорбция костной ткани более 2/3 длины корня' }),
          opt('K01.1', 'K01.1 Ретенированный зуб', { mkb: ['K01.1', 'K01.1 Импактные зубы'], dn: 'Ретенция', st: 'не прорезалась', xr: 'ретенированный зуб в кости альвеолярного отростка' }),
        ] },
        { key: 'flap', label: 'Разрез, лоскут', type: 'toggle', default: false, show: (p) => p.method !== 'simple' },
        { key: 'socket', label: 'Лунка', type: 'seg', options: [
          opt('clot', 'Кровяной сгусток'), opt('sponge', 'Губка / альвеол. материал'), opt('prf', 'PRF'), opt('tampon', 'Тампонада'),
        ], default: 'clot' },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false },
        { key: 'sutMat', label: 'Шовный материал', type: 'seg', options: [opt('кетгут', 'Кетгут'), opt('еврокрил', 'Еврокрил'), opt('PTFE')], default: 'кетгут', show: (p) => p.sutures },
        ...rxParams(() => true),
        { key: 'isol', label: 'Изоляция', type: 'seg', options: [opt('', 'Нет'), opt('ретрактором OptraGate', 'OptraGate')], default: '', adv: true },
        { key: 'mob', label: 'Подвижность', type: 'seg', options: [opt('отсутствует', 'Нет'), opt('I степени', 'I'), opt('II степени', 'II'), opt('III степени', 'III')], default: 'отсутствует', adv: true },
        { key: 'xray', label: 'Рентген', type: 'seg', options: [opt('yes', 'Есть'), opt('', 'Нет')], default: 'yes', adv: true },
      ],
      onParam: (b, key) => {
        if (key === 'method' && !b.touched.flap) b.params.flap = b.params.method === 'impacted';
        if (key === 'method' && b.params.method === 'impacted' && !b.touched.mkb) b.params.mkb = 'K01.1';
      },
      mkb: (p, P) => P.mkb.mkb,
      fields: (p, T, P) => {
        const imp = p.method === 'impacted';
        const t = [];
        if (p.socket === 'prf') t.push('Забор венозной крови из периферической вены, изготовление фибриновых сгустков методом PRF.');
        if (p.isol) t.push('Изоляция ' + p.isol + '.');
        if (imp) {
          t.push('Операция удаления ретенированного (дистопированного) ' + T.gen + ':' +
            (p.flap ? ' разрез слизистой оболочки, отслаивание слизисто-надкостничного лоскута,' : '') +
            ' резекция костной ткани бором, разъединение зуба на фрагменты, удаление зуба по частям.');
        } else if (p.method === 'complex') {
          t.push('Удаление ' + T.gen + ' сложное:' + (p.flap ? ' разрез слизистой оболочки, отслаивание слизисто-надкостничного лоскута,' : '') +
            ' синдесмотомия, разъединение корней бором, поочерёдное удаление корней элеватором и щипцами.');
        } else {
          t.push('Удаление ' + T.gen + ': синдесмотомия, удаление щипцами и элеватором.');
        }
        t.push('Ревизия и кюретаж лунки, антисептическая обработка раствором хлоргексидина 0,05%.');
        t.push({ clot: 'Лунка заполнена кровяным сгустком.', sponge: 'В лунку введён гемостатический (альвеолярный) материал.',
          prf: 'Лунка заполнена фибриновым сгустком PRF.', tampon: 'Тампонада лунки йодоформной турундой.' }[p.socket]);
        if (p.sutures) t.push('Наложены швы (' + p.sutMat + ').');
        t.push('Гемостаз достигнут.');
        const r = ['Не принимать пищу 2 часа. В течение суток не полоскать рот, не греть область вмешательства, не употреблять горячую пищу и алкоголь, не курить.',
          'Холод на область вмешательства по 15 минут с перерывами в первые часы.'];
        if (p.socket === 'tampon') r.push('Явка для удаления турунды через 1–2 дня.');
        if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 7–10 дней.');
        { const rx = rxText(p); if (rx) r.push(rx); }
        r.push('При кровотечении, нарастании отёка или повышении температуры — обратиться в клинику.');
        return {
          complaints: p.mkb === 'K01.1' ? 'Направлен на удаление ретенированного ' + T.gen + '.' :
            p.mkb === 'K05.3' ? 'Жалобы на подвижность ' + T.gen + ', дискомфорт при жевании.' : 'Жалобы на ноющую боль в области ' + T.gen + ', усиливающуюся при накусывании.',
          anamnesisMorbi: p.mkb === 'K01.1' ? 'Со слов пациента, периодически беспокоит дискомфорт в области ' + T.gen + '. Направлен на удаление.'
            : 'Со слов пациента, ' + T.nom + ' беспокоит длительное время. Ранее ' + T.nom + ' лечен(ы). Направлен на удаление.',
          statusLocalis: 'Коронковая часть ' + T.gen + ' ' + P.mkb.st + '. Перкуссия ' + (p.mkb === 'K01.1' ? 'не проводилась' : 'слабоболезненна') +
            '. Подвижность ' + p.mob + '. Слизистая оболочка в области ' + T.gen + ' ' + (p.mkb === 'K04.5' ? 'гиперемирована, отёчна' : 'без выраженных изменений') + '.',
          xray: p.xray ? 'На рентгенограмме (КЛКТ) ' + T.gen + ': ' + P.mkb.xr + '.' : '',
          diagnosis: P.mkb.dn + ' ' + T.gen + ', ' + P.mkb.mkb[0] + '.',
          treatment: t.join(' '),
          recommendations: r.join(' '),
        };
      },
    },
    {
      id: 'implant', title: 'Имплантация', icon: '🔩', position: 'surgeon', order: 45, needTeeth: true, qtyIsTeeth: true,
      params: [
        { key: 'stage', label: 'Этап', type: 'seg', options: [opt('place', 'Установка имплантатов'), opt('uncover', 'Формирователь (2 этап)'), opt('abut', 'Временный абатмент'), opt('removal', 'Удаление имплантата')], default: 'place' },
        { key: 'diag', label: 'Диагноз', type: 'seg', options: [opt('partial', 'Частичная адентия'), opt('full', 'Полная адентия')], default: 'partial' },
        { key: 'guide', label: 'Хирургический шаблон', type: 'seg', options: [opt('', 'Нет'), opt('pilot', 'Пилотный / навигационный'), opt('full', 'Полный протокол')], default: '', show: (p) => p.stage === 'place' },
        { key: 'access', label: 'Доступ', type: 'seg', options: [opt('flap', 'Разрез, лоскут'), opt('flapless', 'Трансгингивально')], default: 'flap', show: (p) => p.stage === 'place' },
        { key: 'imp', label: 'Имплантаты', type: 'perTooth', show: (p) => p.stage === 'place',
          init: (b, t) => ({ sys: (b.hints.sys && b.hints.sys[t]) || b.hints.sysDefault || b.params.sysDefault || 'osstem', d: '', l: '', tq: '30', lot: '' }),
          fields: [
            { key: 'sys', label: 'Система', options: () => Object.keys(IMPLANT_SYSTEMS).map((k) => ({ v: k, l: IMPLANT_SYSTEMS[k].name })) },
            { key: 'd', label: 'Диаметр', options: (r) => (r.sys && IMPLANT_SYSTEMS[r.sys] ? Object.keys(IMPLANT_SYSTEMS[r.sys].sizes).map((d) => ({ v: d, l: 'Ø ' + mm(d) })) : []) },
            { key: 'l', label: 'Длина', options: (r) => (r.sys && r.d && IMPLANT_SYSTEMS[r.sys] && IMPLANT_SYSTEMS[r.sys].sizes[r.d] ? IMPLANT_SYSTEMS[r.sys].sizes[r.d].map((l) => ({ v: String(l), l: mm(l) + ' мм' })) : []) },
            { key: 'tq', label: 'Торк', optional: true, options: () => ['15', '20', '25', '30', '35', '40', '45', '50'].map((x) => ({ v: x, l: x + ' Н·см' })) },
            { key: 'lot', label: 'LOT', type: 'text', optional: true, placeholder: 'необяз.' },
          ] },
        { key: 'supra', label: 'Супраструктура', type: 'seg', options: [opt('cover', 'Винт-заглушка'), opt('healing', 'Формирователь'), opt('temp', 'Временный абатмент'), opt('tempCrown', 'Абатмент + врем. коронка')], default: 'cover', show: (p) => (p.stage === 'place' && !allMini(p)) || p.stage === 'abut' },
        { key: 'prf', label: 'PRF', type: 'toggle', default: false, show: (p) => p.stage === 'place', adv: true },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: true, show: (p) => p.stage !== 'abut' },
        { key: 'sutMat', label: 'Шовный материал', type: 'seg', options: [opt('кетгут', 'Кетгут'), opt('еврокрил', 'Еврокрил'), opt('PTFE')], default: 'еврокрил', show: (p) => p.sutures && p.stage !== 'abut' },
        ...rxParams((p) => p.stage === 'place' || p.stage === 'removal'),
        { key: 'isol', label: 'Изоляция', type: 'seg', options: [opt('', 'Нет'), opt('ретрактором OptraGate', 'OptraGate')], default: '', adv: true },
        { key: 'sysDefault', label: 'Система по умолчанию', type: 'select', options: [opt('osstem', 'Osstem TSIII'), opt('dentium', 'Dentium SuperLine'), opt('anyridge', 'MegaGen AnyRidge'), opt('mini', 'Мини-имплантат')], default: 'osstem', adv: true },
      ],
      onParam: (b, key) => {
        if (key === 'access' && !b.touched.sutures) b.params.sutures = b.params.access === 'flap';
        if (key === 'sysDefault') Object.keys(b.params.imp || {}).forEach((t) => { const r = b.params.imp[t]; if (!r.d) r.sys = b.params.sysDefault; });
      },
      finalize: (b) => {
        if (b.hints.removal) { b.params.stage = 'removal'; b.auto.stage = 1; }
        else if (!b.hints.placed && b.hints.tempAbut) { b.params.stage = 'abut'; b.auto.stage = 1; }
        else if (!b.hints.placed && b.hints.healing) { b.params.stage = 'uncover'; b.auto.stage = 1; }
        if ((b.params.access === 'flapless' || b.params.stage === 'uncover' || b.params.stage === 'abut') && !b.auto.sutures) b.params.sutures = false;
      },
      check: (b) => {
        if (b.params.stage !== 'place') return [];
        return b.teeth.filter((t) => { const r = (b.params.imp || {})[t]; return !r || !r.d || !r.l; })
          .map((t) => ({ lvl: 'bad', text: 'Имплантат ' + fmtTooth(t) + ': укажите диаметр и длину' }));
      },
      mkb: () => ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни'],
      fields: (p, T, P, X) => {
        const many = X.b.teeth.length > 1;
        const imps = X.b.teeth.map((t) => {
          const r = (p.imp || {})[t] || {}; const S = IMPLANT_SYSTEMS[r.sys] || { name: '___' };
          return 'в позицию ' + fmtTooth(t) + ' — ' + (r.sys === 'mini' ? 'мини-имплантат' : 'имплантат ' + S.name) + ' Ø' + (r.d ? mm(r.d) : '___') + '×' + (r.l ? mm(r.l) : '___') + ' мм' + (r.tq ? ', торк ' + r.tq + ' Н·см' : '') + (r.lot ? ', LOT ' + r.lot : '');
        });
        const R = { diagnosis: (p.diag === 'full' ? 'Полная вторичная адентия' : 'Частичная вторичная адентия') + ': отсутствие ' + T.gen + ', K08.1.' };
        const t = []; const r = [];
        if (p.prf && p.stage === 'place') t.push('Забор венозной крови из периферической вены, изготовление фибриновых сгустков методом PRF.');
        if (p.isol) t.push('Изоляция ' + p.isol + '.');
        if (p.stage === 'place') {
          R.complaints = 'Жалобы на отсутствие ' + T.gen + ', затруднённое пережёвывание пищи.';
          R.anamnesisMorbi = T.Nom + ' удален(ы) ранее. Проведено обследование, КЛКТ. Планируется дентальная имплантация.';
          R.statusLocalis = 'Дефект зубного ряда в области ' + T.gen + '. Слизистая оболочка альвеолярного гребня бледно-розовая, без признаков воспаления. Ширина альвеолярного гребня достаточная.';
          R.xray = 'По данным КЛКТ: объём костной ткани в области ' + T.gen + ' достаточен для установки ' + (many ? 'имплантатов' : 'имплантата') + '.';
          if (p.guide) t.push('Установка и фиксация хирургического шаблона' + (p.guide === 'full' ? ' (полный протокол)' : ' (пилотный / навигационный)') + '.');
          t.push(p.access === 'flap' ? 'Разрез по гребню альвеолярного отростка, отслаивание слизисто-надкостничного лоскута.' : 'Трансгингивальный доступ без отслаивания лоскута.');
          t.push('Формирование ложа ' + (many ? 'под имплантаты' : 'под имплантат') + ' по протоколу системы' + (p.guide ? ' через хирургический шаблон' : '') + ' с охлаждением физиологическим раствором.');
          t.push('Установлены: ' + imps.join('; ') + '.');
          if (!allMini(p)) t.push({ cover: 'Установлен' + (many ? 'ы винты-заглушки' : ' винт-заглушка') + '.', healing: 'Установлен' + (many ? 'ы формирователи' : ' формирователь') + ' десны.',
            temp: 'Установлен' + (many ? 'ы временные абатменты' : ' временный абатмент') + '.', tempCrown: 'Установлен' + (many ? 'ы временные абатменты' : ' временный абатмент') + ', фиксирована временная коронка, выведена из окклюзии.' }[p.supra]);
          if (p.prf) t.push('Фибриновые мембраны PRF уложены в область вмешательства.');
          if (p.sutures) t.push((p.access === 'flap' ? 'Лоскут уложен, наложены швы' : 'Наложены швы') + ' (' + p.sutMat + ').');
          t.push('Гемостаз достигнут.');
          r.push('Холод на область операции в первые сутки по 15 минут с перерывами.', 'Не принимать пищу 2 часа, исключить горячую и твёрдую пищу, не жевать на стороне операции.',
            'Не курить, не употреблять алкоголь, исключить физические нагрузки и тепловые процедуры в течение недели.', 'Тщательная гигиена полости рта, область операции не чистить щёткой до снятия швов.');
          if (p.supra === 'tempCrown') r.push('Не нагружать временную коронку, пища мягкой консистенции.');
          if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 10–14 дней.');
          r.push('Контрольный осмотр через 7–10 дней.');
        } else if (p.stage === 'uncover') {
          R.complaints = 'Жалоб нет. Явился для установки ' + (many ? 'формирователей' : 'формирователя') + ' десны.';
          R.anamnesisMorbi = 'Ранее в области ' + T.gen + ' установлен(ы) имплантат(ы). Период остеоинтеграции завершён.';
          R.statusLocalis = 'Слизистая оболочка в области ' + T.gen + ' бледно-розовая, без признаков воспаления.';
          t.push('Разрез слизистой оболочки над ' + (many ? 'имплантатами' : 'имплантатом') + ' в области ' + T.gen + ', удаление ' + (many ? 'винтов-заглушек' : 'винта-заглушки') + ', установка ' + (many ? 'формирователей' : 'формирователя') + ' десны.');
          if (p.sutures) t.push('Наложены швы (' + p.sutMat + ').');
          t.push('Гемостаз достигнут.');
          r.push('Тщательная гигиена полости рта, аккуратная чистка в области формирователей.', 'Явка на ортопедический этап через 2 недели.');
        } else if (p.stage === 'abut') {
          R.complaints = 'Жалоб нет. Явился для установки ' + (many ? 'временных абатментов' : 'временного абатмента') + '.';
          R.anamnesisMorbi = 'Ранее в области ' + T.gen + ' установлен(ы) имплантат(ы).';
          R.statusLocalis = 'Слизистая оболочка в области ' + T.gen + ' без признаков воспаления, формирователи десны стабильны.';
          t.push('Снятие ' + (many ? 'формирователей' : 'формирователя') + ' десны в области ' + T.gen + '. Установка ' + (many ? 'временных абатментов' : 'временного абатмента') +
            (p.supra === 'tempCrown' ? ', фиксация временной коронки, выведена из окклюзии.' : '.'));
          r.push('Тщательная гигиена полости рта.', p.supra === 'tempCrown' ? 'Не нагружать временную коронку, пища мягкой консистенции.' : 'Явка на следующий ортопедический этап по записи.');
        } else {
          R.complaints = 'Жалобы на подвижность (дискомфорт) в области имплантата ' + T.gen + '.';
          R.anamnesisMorbi = 'Ранее в области ' + T.gen + ' установлен имплантат.';
          R.statusLocalis = 'В области имплантата ' + T.gen + ' слизистая оболочка гиперемирована, отёчна, при пальпации болезненна.';
          t.push('Удаление имплантата в области ' + T.gen + ': разрез, отслаивание слизисто-надкостничного лоскута, удаление имплантата, кюретаж ложа, антисептическая обработка.');
          if (p.sutures) t.push('Наложены швы (' + p.sutMat + ').');
          t.push('Гемостаз достигнут.');
          r.push('Холод на область вмешательства в первые часы. Не принимать пищу 2 часа, не курить, не употреблять алкоголь.');
          if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 7–10 дней.');
        }
        if (p.stage === 'place' || p.stage === 'removal') { const rx = rxText(p); if (rx) r.push(rx); }
        r.push('При кровотечении, нарастании отёка или повышении температуры — обратиться в клинику.');
        R.treatment = t.join(' '); R.recommendations = r.join(' ');
        return R;
      },
    },

  ];

  globalThis.SQNSMZ_CONFIG = { IMPLANT_SYSTEMS, POSITIONS, POSITION_BY_CODE, SERVICE_RULES, DEFAULT_DURATION, ADMISSION_CONDITION, DIAG_DEFAULTS, fmtTooth, TEMPLATES };
})();
