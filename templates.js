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
  const sysHint = (sys) => (b, s) => { b.hints.placed = true; b.hints.sys = b.hints.sys || {}; b.hints.impTeeth = (b.hints.impTeeth || []).concat(s.teeth); b.hints.impQty = (b.hints.impQty || 0) + s.qty; s.teeth.forEach((t) => { b.hints.sys[t] = sys; }); b.hints.sysDefault = sys; };
  const actHint = (a, kind) => (b, s) => { b.hints.act = b.hints.act || {}; s.teeth.forEach((t) => { b.hints.act[t] = a; }); b.hints[kind] = true; };
  const volHint = (k, v) => (b, s) => { b.hints.vol = b.hints.vol || {}; b.hints.vol[k] = (b.hints.vol[k] || 0) + v * s.qty; };

  // сколько каналов указано в услугах (берётся максимум) — для сверки с отмеченными каналами
  const canalHint = (b, n) => { b.hints.count = Math.max(b.hints.count || 0, +n || 0); };
  const countFromName = (name) => (/четыр/i.test(name) ? 4 : /тр[её]х/i.test(name) ? 3 : /двух/i.test(name) ? 2 : 0);

  const SERVICE_RULES = [
    // изоляция и прокладки
    { code: 'A02.07.001', name: /optra/i,           mod: { tpl: ['caries', 'endo', 'hygiene', 'extraction', 'surgery'], key: 'isol', value: 'ретрактором OptraGate' }, label: 'Изоляция OptraGate' },
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
    // ортопедия
    { code: 'B01.066', block: { tpl: 'orthoConsult', merge: true, mergeAll: true, params: {} }, label: 'Приём ортопеда' },
    // хирургическая операция: имплантация
    { code: 'A16.07.054', name: /полный протокол/i, mod: { tpl: ['surgery'], set: { guide: 'full', adentia: 'full' } }, label: 'Хирургический шаблон (полный протокол)' },
    { code: 'A16.07.054', name: /пилотн|навигац/i, mod: { tpl: ['surgery'], set: { guide: 'pilot' } }, label: 'Хирургический шаблон' },
    { code: 'A16.07.054', name: /мини/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['imp'], access: 'flapless' }, hint: sysHint('mini') }, label: 'Мини-имплантат' },
    { code: 'A16.07.054', name: /osstem/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['imp'] }, hint: sysHint('osstem') }, label: 'Имплантат Osstem' },
    { code: 'A16.07.054', name: /dentium/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['imp'] }, hint: sysHint('dentium') }, label: 'Имплантат Dentium' },
    { code: 'A16.07.054', name: /anyridge|megagen/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['imp'] }, hint: sysHint('anyridge') }, label: 'Имплантат AnyRidge' },
    { code: 'A16.30.026', block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['rem'] } }, label: 'Удаление имплантата' },
    // ФДМ / временный абатмент (если в визите есть установка имплантатов — уходят в супраструктуру операции)
    // hint запоминает, что стоит на каждом зубе (в визите может быть ФДМ на одних имплантатах и абатменты на других)
    { code: 'A16.07.054', name: /формировател/i, block: { tpl: 'fdm', merge: true, mergeAll: true, params: { action: 'healing' }, hint: actHint('healing', 'surg') }, label: 'Формирователь десны (ФДМ)' },
    { code: 'A16.07.054', name: /временн\S* а+б+атмент/i, block: { tpl: 'fdm', merge: true, mergeAll: true, params: { action: 'temp' }, hint: actHint('temp', 'surg') }, label: 'Временный абатмент' },
    { code: 'A16.07.006', name: /а+б+атмент\S*\s+временн/i, block: { tpl: 'fdm', merge: true, mergeAll: true, params: { action: 'temp' }, hint: actHint('temp', 'supra') }, label: 'Временный абатмент' },
    { code: 'A16.07.006', name: /а+б+атмент\S*\s+стандартн/i, block: { tpl: 'fdm', merge: true, mergeAll: true, params: { action: 'std' }, hint: actHint('std', 'supra') }, label: 'Стандартный абатмент' },
    { code: 'A16.07.006', name: /мультиюнит/i, block: { tpl: 'fdm', merge: true, mergeAll: true, params: { action: 'mu' }, hint: actHint('mu', 'supra') }, label: 'Мультиюнит' },
    // костная пластика: материалы
    { code: 'A16.07.041.001', name: /bio-?oss/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mats: ['biooss'] }, hint: volHint('bio', 0.5) }, label: 'Bio-Oss' },
    { code: 'A16.07.041.001', name: /xenograft.*3[,.]0/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mats: ['xeno'] }, hint: volHint('xeno', 3) }, label: 'Xenograft 3,0 см³' },
    { code: 'A16.07.041.001', name: /xenograft.*1[,.]0/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mats: ['xeno'] }, hint: volHint('xeno', 1) }, label: 'Xenograft 1,0 см³' },
    { code: 'A16.07.041.001', name: /xenograft/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mats: ['xeno'] }, hint: volHint('xeno', 0.5) }, label: 'Xenograft 0,5 см³' },
    { code: 'A16.23.042.001', block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mats: ['auto'] } }, label: 'Аутокость' },
    // костная пластика: мембраны и фиксация
    { code: 'A16.07.041.001', name: /bio-?gu?ide/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mems: ['biogide'] } }, label: 'Мембрана Bio-Gide' },
    { code: 'A16.07.041.001', name: /contur/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mems: ['contur'] } }, label: 'Мембрана Bioplate Contur' },
    { code: 'A16.07.041.001', name: /биопласт/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mems: ['bioplast'] } }, label: 'Мембрана Биопласт-Дент' },
    { code: 'A16.07.041', name: /титанов/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mems: ['mesh'] } }, label: 'Титановая сетка' },
    { code: 'A16.07.041', name: /нерезорбир/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], mems: ['ptfe'] } }, label: 'Нерезорбируемая мембрана' },
    { code: 'A16.07.041', name: /винт/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'] }, hint: (b, s) => { b.hints.screws = (b.hints.screws || 0) + s.qty; } }, label: 'Фиксирующий винт' },
    { code: 'A16.07.041', name: /пин/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'] }, hint: (b, s) => { b.hints.pins = (b.hints.pins || 0) + s.qty; } }, label: 'Фиксирующий пин' },
    // костная пластика: методы
    { code: 'A16.07.041', name: /при установке/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], methods: ['gbr'] }, hint: (b, s) => { b.hints.graftTeeth = (b.hints.graftTeeth || []).concat(s.teeth); } }, label: 'НКР одномоментно с имплантацией' },
    { code: 'A16.07.041', name: /1 зуба/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], methods: ['gbr'] }, hint: (b, s) => { b.hints.graftTeeth = (b.hints.graftTeeth || []).concat(s.teeth); } }, label: 'Костная пластика (НКР)' },
    { code: 'A16.07.055', name: /открыт/i, block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], methods: ['sinusOpen'] } }, label: 'Открытый синус-лифтинг' },
    { code: 'A16.07.055', block: { tpl: 'surgery', merge: true, mergeAll: true, params: { parts: ['graft'], methods: ['sinusClosed'] } }, label: 'Закрытый синус-лифтинг' },
    // мягкие ткани (в операции / при ФДМ / отдельно)
    { code: 'A16.07.089', block: { tpl: 'soft', merge: true, mergeAll: true, params: { softM: ['gingivo'] } }, label: 'Гингивопластика' },
    { code: 'A16.30.058', block: { tpl: 'soft', merge: true, mergeAll: true, params: { softM: ['sct'] } }, label: 'ССТ (соединительнотканный трансплантат)' },
    { code: 'A16.07.026', name: /коагуляц/i, block: { tpl: 'soft', merge: true, mergeAll: true, params: { softM: ['diathermo'] } }, label: 'Диатермокоагуляция сосочка' },
    { code: 'A16.07.026', name: /удлинени/i, block: { tpl: 'soft', merge: true, mergeAll: true, params: { softM: ['crownLen'] } }, label: 'Удлинение клинической коронки' },
    // удаление зубов, швы, PRF
    { code: 'A16.07.001.003', pass: true, mod: { tpl: ['extraction'], set: { method: 'complex' } }, label: 'Удаление сложное' },
    { code: 'A16.07.024', pass: true, mod: { tpl: ['extraction'], set: { method: 'impacted', flap: true, mkb: 'K01.1' } }, label: 'Удаление ретенир./дистопир.' },
    { code: 'A16.07.097', name: /ptfe/i, mod: { tpl: ['extraction', 'surgery', 'fdm', 'soft'], set: { sutures: true, sutMat: 'PTFE' } }, label: 'Швы PTFE' },
    { code: 'A16.07.097', mod: { tpl: ['extraction', 'surgery', 'fdm', 'soft'], set: { sutures: true } }, label: 'Швы' },
    { code: 'A11.12.009', mod: { tpl: ['extraction', 'surgery'], set: { socket: 'prf', prf: true } }, label: 'PRF' },
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


  // ---------- хирургия: общие тексты ----------
  const K081 = ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни'];
  const K082 = ['K08.2', 'K08.2 Атрофия беззубого альвеолярного края'];
  const has = (p, x) => (p.parts || []).includes(x);
  const sinus = (p) => (p.methods || []).some((m) => m === 'sinusOpen' || m === 'sinusClosed');
  const EXT_DIAG = [
    opt('K04.5', 'K04.5 Хр. апикальный периодонтит', { mkb: ['K04.5', 'K04.5 Хронический апикальный периодонтит'], dn: 'Хронический апикальный периодонтит', st: 'разрушена', xr: 'очаг деструкции костной ткани в области верхушки корня' }),
    opt('K08.3', 'K08.3 Оставшийся корень зуба', { mkb: ['K08.3', 'K08.3 Оставшийся корень зуба'], dn: 'Оставшийся корень', st: 'отсутствует, корень ниже уровня десны', xr: 'корень зуба, периапикальные изменения' }),
    opt('K05.3', 'K05.3 Хронический пародонтит', { mkb: ['K05.3', 'K05.3 Хронический пародонтит'], dn: 'Хронический пародонтит в области', st: 'сохранна', xr: 'резорбция костной ткани в области корня' }),
    opt('K03.8', 'K03.8 Перелом / трещина корня', { mkb: ['K03.8', 'K03.8 Другие уточненные болезни твердых тканей зубов'], dn: 'Вертикальный перелом корня', st: 'сохранна, подвижность фрагментов', xr: 'линия перелома корня' }),
  ];
  const MEMBRANES = [
    { v: 'biogide', l: 'Bio-Gide', t: 'резорбируемой коллагеновой мембраной Bio-Gide' },
    { v: 'contur', l: 'Bioplate Contur', t: 'мембраной Bioplate Contur' },
    { v: 'bioplast', l: 'Биопласт-Дент', t: 'мембраной «Биопласт-Дент»' },
    { v: 'ptfe', l: 'Нерезорбируемая (PTFE)', t: 'нерезорбируемой мембраной PTFE' },
    { v: 'mesh', l: 'Титановая сетка', t: 'титановой сеткой' },
    { v: 'prf', l: 'PRF', t: 'фибриновыми мембранами PRF' },
  ];
  // что установлено на имплантат: [ед., мн., род. ед., род. мн.]
  const SUPRA = {
    cover: ['винт-заглушка', 'винты-заглушки', 'винта-заглушки', 'винтов-заглушек'],
    healing: ['формирователь десны', 'формирователи десны', 'формирователя десны', 'формирователей десны'],
    temp: ['временный абатмент', 'временные абатменты', 'временного абатмента', 'временных абатментов'],
    tempCrown: ['временный абатмент', 'временные абатменты', 'временного абатмента', 'временных абатментов'],
    std: ['стандартный абатмент', 'стандартные абатменты', 'стандартного абатмента', 'стандартных абатментов'],
    mu: ['мультиюнит', 'мультиюниты', 'мультиюнита', 'мультиюнитов'],
  };
  const SUPRA_ORDER = ['cover', 'healing', 'temp', 'tempCrown', 'std', 'mu'];
  // зубы → группы по виду: [['healing', ['36']], ['std', ['46', '47']]]
  function supraGroups(teeth, map, def) {
    const g = {}; (teeth || []).forEach((t) => { const a = (map || {})[t] || def; (g[a] = g[a] || []).push(String(t)); });
    return SUPRA_ORDER.filter((a) => g[a]).map((a) => [a, g[a].sort()]);
  }
  const andJoin = (a) => (a.length > 1 ? a.slice(0, -1).join(', ') + ' и ' + a[a.length - 1] : a[0] || '');
  const SUPRA_OPTS = [opt('cover', 'Винт-заглушка'), opt('healing', 'ФДМ'), opt('temp', 'Временный абатмент'), opt('tempCrown', 'Абатмент + врем. коронка'), opt('std', 'Стандартный абатмент'), opt('mu', 'Мультиюнит')];
  const FDM_ACTS = [opt('healing', 'ФДМ'), opt('temp', 'Временный абатмент'), opt('std', 'Стандартный абатмент'), opt('mu', 'Мультиюнит'), opt('tempCrown', 'Абатмент + врем. коронка')];
  const memT = (v) => (MEMBRANES.find((m) => m.v === v) || { t: '' }).t;
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  const tgen = (arr) => { const f = (arr || []).slice().sort().map(fmtTooth); return f.length ? (f.length === 1 ? 'зуба ' : 'зубов ') + f.join(', ') : '___'; };
  function softText(m, T) {
    const t = [];
    if ((m || []).includes('sct')) t.push('Забор соединительнотканного трансплантата с нёба, ушивание донорской зоны. Формирование расщеплённого лоскута в области ' + T.gen + ', фиксация соединительнотканного трансплантата.');
    if ((m || []).includes('gingivo')) t.push('Гингивопластика в области ' + T.gen + ': формирование десневого контура.');
    return t;
  }
  function matText(p) {
    const a = [], m = p.mats || [];
    if (m.includes('auto')) a.push('аутокость (забор ' + ({ harvester: 'костным харвестером', scraper: 'костным скребком', site: 'из лунки и ложа имплантата' }[p.autoM] || '') + ')');
    if (m.includes('biooss')) a.push('Bio-Oss' + (p.volBio ? ' ' + p.volBio + ' см³' : ''));
    if (m.includes('xeno')) a.push('Xenograft ' + p.xenoType + (p.volXeno ? ' ' + p.volXeno + ' см³' : ''));
    if (!a.length) return '';
    return (a.length > 1 ? 'смесь: ' : '') + a.join(' + ');
  }
  function surgeryText(p, T, P, X) {
    const b = X.b, t = [], r = [], meth = p.methods || [], mems = p.mems || [];
    const ext = has(p, 'ext'), imp = has(p, 'imp'), graft = has(p, 'graft'), rem = has(p, 'rem');
    const extT = (p.extTeeth || []).slice().sort(), impT = (p.impTeeth || []).slice().sort();
    const immediate = imp && ext && impT.some((x) => extT.includes(x));
    const mat = graft ? matText(p) : '';
    const M = 'костнопластическим материалом' + (mat ? ' (' + mat + ')' : '');
    let matUsed = false; const useM = () => { if (matUsed) return 'костнопластическим материалом'; matUsed = true; return M; };
    const D = P.extDiag;
    // диагноз
    const dg = [];
    if (ext) dg.push(D.dn + ' ' + tgen(extT) + ', ' + D.mkb[0]);
    if (imp || rem) dg.push((p.adentia === 'full' ? 'Полная' : 'Частичная') + ' вторичная адентия' + (ext ? '' : ': отсутствие ' + tgen(imp ? impT : b.teeth)) + ', K08.1');
    if (graft && (!ext || meth.some((x) => x !== 'socket'))) dg.push('Атрофия альвеолярного гребня в области ' + T.gen + ', K08.2');
    const R = { diagnosis: dg.join('; ') + '.' };
    // жалобы, анамнез, статус
    if (ext) {
      R.complaints = { 'K04.5': 'Жалобы на дискомфорт при накусывании в области ' + tgen(extT) + '.', 'K08.3': 'Жалобы на разрушение ' + tgen(extT) + '.', 'K05.3': 'Жалобы на подвижность ' + tgen(extT) + '.', 'K03.8': 'Жалобы на боль при накусывании в области ' + tgen(extT) + '.' }[p.extDiag] + (imp ? ' Желает восстановить зуб с помощью имплантации.' : '');
      R.anamnesisMorbi = 'Ранее ' + (extT.length > 1 ? 'зубы' : 'зуб') + ' лечен(ы).' + (p.xray ? ' Проведено обследование, КЛКТ.' : '') + ' Планируется удаление' + (imp ? ' с одномоментной имплантацией' : graft ? ' с сохранением лунки' : '') + '.';
      R.statusLocalis = 'Коронковая часть ' + tgen(extT) + ' ' + D.st + '. Слизистая оболочка в области ' + tgen(extT) + ' без выраженных изменений.' + (imp && b.teeth.length > extT.length ? ' Дефект зубного ряда в области ' + tgen(b.teeth.filter((x) => !extT.includes(x))) + '.' : '');
      R.xray = 'По данным КЛКТ в области ' + tgen(extT) + ': ' + D.xr + (imp ? '; объём костной ткани достаточен для немедленной имплантации' : '') + '.';
    } else {
      R.complaints = 'Жалобы на отсутствие ' + T.gen + ', затруднённое пережёвывание пищи.' + (graft && !imp ? ' Направлен на костную пластику для последующей имплантации.' : '');
      R.anamnesisMorbi = (T.Nom + ' удален(ы) ранее.').replace(/^Зуб /, 'Зуб ') + (p.xray ? ' Проведено обследование, КЛКТ.' : '') + (imp ? ' Планируется дентальная имплантация' + (graft ? ' с костной пластикой' : '') + '.' : graft ? ' Планируется костная пластика.' : '');
      R.statusLocalis = 'Дефект зубного ряда в области ' + T.gen + '. Слизистая оболочка альвеолярного гребня бледно-розовая, без признаков воспаления.' + (graft ? ' Альвеолярный гребень атрофирован.' : ' Ширина альвеолярного гребня достаточная.');
      R.xray = 'По данным КЛКТ: ' + (sinus(p) ? 'недостаточная высота костной ткани под дном верхнечелюстной пазухи в области ' + T.gen : graft ? 'атрофия альвеолярного гребня в области ' + T.gen : 'объём костной ткани в области ' + T.gen + ' достаточен для установки имплантатов') + '.';
    }
    if (!p.xray) R.xray = '';
    if (rem && !imp && !ext) { R.complaints = 'Жалобы на подвижность (дискомфорт) в области имплантата ' + T.gen + '.'; R.statusLocalis = 'В области имплантата ' + T.gen + ' слизистая оболочка гиперемирована, отёчна.'; }
    // ход операции
    if (p.prf) t.push('Забор венозной крови из периферической вены, изготовление фибриновых сгустков и мембран методом PRF.');
    if (p.isol) t.push('Изоляция ' + p.isol + '.');
    if (p.guide && imp) t.push('Установка и фиксация хирургического шаблона' + (p.guide === 'full' ? ' (полный протокол)' : ' (пилотный / навигационный)') + '.');
    if (p.access === 'flap') t.push('Разрез по гребню альвеолярного отростка' + (meth.includes('sinusOpen') || meth.includes('gbr') ? ' с вертикальными послабляющими разрезами' : '') + ', отслаивание слизисто-надкостничного лоскута.');
    else t.push('Трансгингивальный доступ без отслаивания лоскута.');
    if (ext) t.push((p.extMethod === 'complex' ? 'Удаление ' + tgen(extT) + ' с разъединением корней' : 'Атравматичное удаление ' + tgen(extT)) + ' (синдесмотомия, периотомы, элеватор, щипцы). Ревизия и кюретаж ' + (extT.length > 1 ? 'лунок' : 'лунки') + ', антисептическая обработка.');
    if (rem) t.push('Удаление имплантата в области ' + T.gen + ', кюретаж ложа, антисептическая обработка.');
    if (graft && (p.mats || []).includes('auto')) t.push('Забор аутокости ' + ({ harvester: 'костным харвестером', scraper: 'костным скребком', site: 'из лунки и ложа имплантата' }[p.autoM] || '') + '.');
    if (graft && meth.includes('sinusOpen')) t.push('Формирование трепанационного окна в латеральной стенке верхнечелюстной пазухи, отслаивание и элевация мембраны Шнайдера.');
    if (graft && meth.includes('split')) t.push('Продольная остеотомия и расщепление альвеолярного гребня ' + p.splitTool + ', расширение гребня.');
    const perfT = p.perf === 'yes' ? 'Выявлена перфорация мембраны Шнайдера' + (p.perfCover ? ', перфорация укрыта ' + (p.perfCover === 'prf' ? 'PRF-мембраной' : memT(p.perfCover)) : '') + '.' : 'Проба Вальсальвы отрицательная, перфорации мембраны Шнайдера нет.';
    if (graft && meth.includes('sinusOpen')) t.push(perfT);
    if (graft && meth.includes('sinusOpen')) t.push('Субантральное пространство заполнено ' + useM() + '.');
    if (imp) {
      const many = impT.length > 1;
      t.push('Формирование ложа ' + (many ? 'под имплантаты' : 'под имплантат') + ' по протоколу системы' + (p.guide ? ' через хирургический шаблон' : '') + ' с охлаждением физиологическим раствором.');
      if (graft && meth.includes('sinusClosed')) { t.push('Закрытый синус-лифтинг через ложе имплантата: элевация дна верхнечелюстной пазухи ' + p.closedTool + '. ' + (meth.includes('sinusOpen') ? '' : perfT + ' ') + 'Внесение ' + (matUsed ? 'костнопластического материала' : 'костнопластического материала' + (mat ? ' (' + mat + ')' : '')) + ' субантрально.'); matUsed = true; }
      const rows = impT.map((x) => {
        const rr = (p.imp || {})[x] || {}, Sy = IMPLANT_SYSTEMS[rr.sys] || { name: '___' };
        return 'в позицию ' + fmtTooth(x) + (extT.includes(x) ? ' (в лунку удалённого зуба)' : '') + ' — ' + (rr.sys === 'mini' ? 'мини-имплантат' : 'имплантат ' + Sy.name) + ' Ø' + (rr.d ? mm(rr.d) : '___') + '×' + (rr.l ? mm(rr.l) : '___') + ' мм' + (rr.tq ? ', торк ' + rr.tq + ' Н·см' : '') + (rr.lot ? ', LOT ' + rr.lot : '');
      });
      t.push('Установлен' + (many ? 'ы' : '') + (immediate ? ' (немедленная имплантация)' : '') + ': ' + rows.join('; ') + '.');
    }
    if (graft) {
      if (meth.includes('socket') && ext) { const sockT = extT.filter((x) => !impT.includes(x) || !imp); if (sockT.length) t.push('Сохранение ' + (sockT.length > 1 ? 'лунок' : 'лунки') + ' ' + tgen(sockT) + ': ' + (sockT.length > 1 ? 'лунки заполнены ' : 'лунка заполнена ') + useM() + '.'); }
      if (immediate) t.push('Зазор между имплантатом и стенками лунки заполнен ' + useM() + '.');
      if (meth.includes('split')) t.push('Пространство между кортикальными пластинками заполнено ' + useM() + '.');
      if (meth.includes('gbr')) t.push('Направленная костная регенерация в области ' + T.gen + (imp ? ' (одномоментно с имплантацией)' : '') + ': декортикация, укладка ' + (matUsed ? 'костнопластического материала' : 'костнопластического материала' + (mat ? ' (' + mat + ')' : '')) + ' в область дефекта.'), matUsed = true;
      if (!matUsed && mat) t.push('Использован ' + M + '.');
      if (mems.length) {
        t.push('Укрытие ' + (meth.includes('sinusOpen') ? 'трепанационного окна и ' : '') + 'области аугментации ' + mems.map(memT).join(' и ') + '.');
        const fx = [];
        if (+p.pins) fx.push(p.pins + ' ' + plural(+p.pins, 'пином', 'пинами', 'пинами'));
        if (+p.screws) fx.push(p.screws + ' ' + plural(+p.screws, 'винтом', 'винтами', 'винтами'));
        const subj = mems.length === 1 && mems[0] === 'mesh' ? 'Сетка' : 'Мембрана';
        t.push(fx.length ? subj + ' фиксирована ' + fx.join(' и ') + '.' : subj + ' уложена без фиксации.');
      } else if (+p.screws) t.push('Фиксация ' + p.screws + ' ' + plural(+p.screws, 'винтом', 'винтами', 'винтами') + '.');
      const lots = []; if (p.lotMat) lots.push('LOT материала: ' + p.lotMat); if (p.lotMem) lots.push('LOT мембраны: ' + p.lotMem);
      if (lots.length) t.push(lots.join('; ') + '.');
    }
    if (imp && !allMini(p) && p.supra === 'mixed') {
      t.push('Установлены: ' + supraGroups(impT, p.supraActs, 'cover').map(([a, tt]) => SUPRA[a][tt.length > 1 ? 1 : 0] + ' — ' + tt.map(fmtTooth).join(', ')).join('; ') + '.');
    } else if (imp && !allMini(p)) { const many = impT.length > 1;
      t.push({ std: 'Установлен' + (many ? 'ы стандартные абатменты' : ' стандартный абатмент') + ', фиксация винтом.', mu: 'Установлен' + (many ? 'ы мультиюниты' : ' мультиюнит') + ', фиксация винтом.', cover: 'Установлен' + (many ? 'ы винты-заглушки' : ' винт-заглушка') + '.', healing: 'Установлен' + (many ? 'ы формирователи' : ' формирователь') + ' десны.',
        temp: 'Установлен' + (many ? 'ы временные абатменты' : ' временный абатмент') + '.', tempCrown: 'Установлен' + (many ? 'ы временные абатменты' : ' временный абатмент') + ', фиксирована временная коронка, выведена из окклюзии.' }[p.supra]); }
    if (p.prf && !mems.includes('prf')) t.push('Фибриновые сгустки PRF уложены в область вмешательства.');
    if (has(p, 'soft')) softText(p.softM, T).forEach((x) => t.push(x));
    if (graft && p.periost && p.access === 'flap' && ['gbr', 'split', 'sinusOpen'].some((m) => meth.includes(m))) t.push('Послабляющий разрез надкостницы, мобилизация лоскута для ушивания без натяжения.');
    if (p.sutures) t.push((p.access === 'flap' ? 'Лоскут уложен без натяжения, наложены швы' : 'Наложены швы') + ' (' + p.sutMat + ').');
    t.push('Гемостаз достигнут.');
    // рекомендации
    r.push('Холод на область операции в первые сутки по 15 минут с перерывами.', 'Не принимать пищу 2 часа, исключить горячую и твёрдую пищу, не жевать на стороне операции.',
      'Не курить, не употреблять алкоголь, исключить физические нагрузки, баню и сауну в течение 2 недель.', 'Тщательная гигиена полости рта, область операции не чистить щёткой до снятия швов.');
    if (graft && sinus(p)) r.push('В течение 2–3 недель не сморкаться, не чихать с закрытым ртом, не пользоваться трубочкой, не летать на самолёте и не нырять.');
    if (imp && p.supra === 'tempCrown') r.push('Не нагружать временную коронку, пища мягкой консистенции.');
    if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 10–14 дней.');
    if (graft && (mems.includes('mesh') || mems.includes('ptfe'))) r.push('Снятие ' + (mems.includes('mesh') ? 'титановой сетки' : 'нерезорбируемой мембраны') + ' через 4–6 месяцев.');
    if (graft && !imp) r.push('Установка имплантатов через ' + (meth.includes('sinusOpen') ? '6–9' : '4–6') + ' месяцев после костной пластики.');
    r.push('Контрольный осмотр через 7–10 дней.');
    const rx = rxText(p); const nasal = graft && sinus(p) && p.rxNasal ? ' Сосудосуживающие капли в нос 2–3 раза в день в течение 5–7 дней.' : '';
    if (rx || nasal) r.push((rx || 'Назначено:') + nasal);
    r.push('При кровотечении, нарастании отёка или повышении температуры — обратиться в клинику.');
    R.treatment = t.join(' '); R.recommendations = r.join(' ');
    return R;
  }

  // ---------- поглощение блоков: удаление/ФДМ/мягкие ткани внутри операции ----------
  // ортопедия: консультация или план — по наличию свежего/принятого ортопедического плана
  const ymd = (d) => { const x = new Date(d); return isNaN(x) ? '' : x.getFullYear() + '-' + (x.getMonth() + 1) + '-' + x.getDate(); };
  // план считается принятым только по флажку «План принят в лечение» (applied) и если запись с планом после его даты ещё не делалась
  const dDay = (x) => { if (!x) return 0; const m = String(x).match(/^(\d{2})\.(\d{2})\.(\d{4})/); const d = m ? new Date(+m[3], m[2] - 1, +m[1]) : new Date(x); return isNaN(d) ? 0 : new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  // Выбор «консультация / обследование и план»:
  //  — нужен ортопедический план с флажком «План принят в лечение» (applied);
  //  — записью с планом считается дневник со словами «Составлен план лечения» из ПРОШЛЫХ дней, сделанный не раньше даты плана.
  //  Сегодняшние дневники не учитываются (это текущий визит), даты плана/визита на выбор не влияют больше ничем.
  const fmtD = (t) => { const d = new Date(t); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); };
  function orthoPlanState(pg) {
    const all = (pg && pg.plans) || [];
    const noItems = (p) => !(p.treatmentPlanItems || []).length;   // в списке планов SQNS состав часто не загружен
    const ortho = all.filter((p) => noItems(p) || (p.treatmentPlanItems || []).some(isOrthoItem));
    const plans = ortho.filter((p) => p.applied);
    const today = dDay(new Date()), vd = dDay(pg && pg.visitDate) || today;   // дата открытого визита, а не текущие часы
    const exams = [];
    ((pg && pg.history && pg.history.visits) || []).forEach((v) => {
      if (pg.visitId && (v.id === pg.visitId || v.visitID === pg.visitId)) return;   // сам открытый визит не считается
      (v.journals || []).forEach((j) => {
        if ((j.journalItems || []).some((it) => /Составлен план лечения/.test(it.content || ''))) { const d = dDay(j.startDate || v.date || v.startDate); if (d && d < vd) exams.push(d); }
      });
    });
    ((pg && pg.otherJournals) || []).forEach((j) => { if ((j.journalItems || []).some((it) => /Составлен план лечения/.test(it.content || ''))) exams.push(vd); });
    const pending = plans.filter((p) => { const pd = dDay(p.date || p.created_at); return !exams.some((d) => d >= pd); });
    const nm = (p) => '«' + (p.title || 'План') + '»' + (dDay(p.date) ? ' от ' + fmtD(dDay(p.date)) : '');
    let why;
    if (!all.length) why = 'Планов лечения у пациента не найдено → консультация.';
    else if (!ortho.length) why = 'Планы есть, но без ортопедических услуг → консультация.';
    else if (!plans.length) why = 'Ортопедический план ' + ortho.map(nm).join(', ') + ' — флажок «План принят в лечение» не стоит → консультация.';
    else if (pending.length) why = 'План ' + pending.map(nm).join(', ') + ' принят в лечение, записи с планом ещё не было → обследование и план.' + (pending.some(noItems) ? ' Состав плана страница пока не отдала.' : '');
    else why = 'План ' + plans.map(nm).join(', ') + ' принят и уже записан в дневнике от ' + fmtD(Math.max(...exams)) + ' → этапы лечения. Если нужно записать план заново — смените блок вручную.';
    why += ' (визит от ' + fmtD(vd) + ')';
    return { plans, pending, ready: pending.length > 0, why };
  }
  function postBuild(blocks, E) {
    const ops = orthoPlanState(E.page);
    // этапы: принятый план уже записан → блоки «Ортопедия: этап» по маршрутам плана
    const stageBlocks = () => {
      const RR = detectRoutes(E.page), avail = ROUTE_ORDER.filter((r) => RR[r]); if (!avail.length) return [];
      const st = {}; avail.forEach((r) => { st[r] = routeStatus(r, E.page); });
      let rs = avail.filter((r) => st[r].started && !st[r].finished);
      if (!rs.length) { const f = avail.find((r) => !st[r].finished); if (f) rs = [f]; }
      if (rs.includes('fixed') && st.fixed.suggest.includes('fix')) { const rem = ['removable', 'complete'].find((r) => RR[r] && !st[r].started); if (rem && !rs.includes(rem)) rs.push(rem); }
      return rs.map((r) => { const nb = E.newBlock('orthoStage', [], 'auto'); nb.autoNote = 'по плану и истории'; nb.svcNames = (E.services || []).map((x) => x.name); stageInit(nb, E.page, r); return nb; });
    };
    const wantStage = !ops.ready && ops.plans.length > 0;
    blocks.filter((b) => b.tpl === 'orthoConsult').forEach((b) => {
      if (ops.ready) { const nb = E.newBlock('orthoExam', [], 'auto'); nb.autoNote = 'есть план лечения'; blocks.splice(blocks.indexOf(b), 1, nb); return; }
      if (wantStage) { const sb = stageBlocks(); if (sb.length) blocks.splice(blocks.indexOf(b), 1, ...sb); }
    });
    // визит без услуг: продолжение лечения предлагает движок через continuations() — здесь блоки не добавляем
    // абатменты из ортопедического раздела в ортопедическом визите (без приёма хирурга) — часть этапа протезирования, не хирургия
    const svcs = E.services || [];
    const orthoVisit = blocks.some((b) => /^ortho/.test(b.tpl)) || svcs.some((s) => s.code.startsWith('A16.07.006') && /коронк|протез|балк/i.test(s.name));
    if (orthoVisit && !svcs.some((s) => s.code.startsWith('B01.067'))) blocks.filter((b) => b.tpl === 'fdm' && b.hints.supra && !b.hints.surg).forEach((x) => blocks.splice(blocks.indexOf(x), 1));
    const surg = blocks.find((b) => b.tpl === 'surgery');
    const overlap = (a, b) => !a.teeth.length || !b.teeth.length || a.teeth.some((t) => b.teeth.includes(t));
    if (surg) {
      blocks.filter((b) => b.tpl === 'extraction' && overlap(b, surg)).forEach((x) => {
        surg.params.parts = [...new Set((surg.params.parts || []).concat('ext'))]; surg.auto.parts = 1;
        surg.hints.extTeeth = (surg.hints.extTeeth || []).concat(x.teeth);
        surg.params.extTeeth = [...new Set((surg.params.extTeeth || []).concat(x.teeth))].sort(); surg.auto.extTeeth = 1;
        surg.teeth = [...new Set(surg.teeth.concat(x.teeth))].sort();
        if (EXT_DIAG.some((o) => o.v === x.params.mkb)) { surg.params.extDiag = x.params.mkb; }
        if (x.params.method === 'complex') surg.params.extMethod = 'complex';
        if (x.params.isol) surg.params.isol = x.params.isol;
        if (x.params.socket === 'prf') surg.params.prf = true;
        if (x.params.sutures) { surg.params.sutures = true; surg.auto.sutures = 1; if (x.auto.sutMat) surg.params.sutMat = x.params.sutMat; }
        blocks.splice(blocks.indexOf(x), 1);
      });
      blocks.filter((b) => b.tpl === 'fdm').forEach((x) => {
        if (!has(surg.params, 'imp')) return;
        const acts = x.hints.act || {}, kinds = [...new Set(Object.values(acts))];
        if (kinds.length > 1) { surg.params.supra = 'mixed'; surg.params.supraActs = Object.assign({}, acts); }
        else surg.params.supra = kinds[0] || x.params.action;
        surg.auto.supra = 1; blocks.splice(blocks.indexOf(x), 1);
      });
      blocks.filter((b) => b.tpl === 'soft' && overlap(b, surg)).forEach((x) => {
        const sm = (x.params.softM || []).filter((m) => m === 'sct' || m === 'gingivo');
        if (!sm.length) return;
        surg.params.parts = [...new Set((surg.params.parts || []).concat('soft'))];
        surg.params.softM = [...new Set((surg.params.softM || []).concat(sm))]; surg.auto.softM = 1;
        x.params.softM = (x.params.softM || []).filter((m) => !sm.includes(m));
        if (!x.params.softM.length) blocks.splice(blocks.indexOf(x), 1);
      });
      if (surg.teeth.length) { const t = E.tplById('surgery'); if (t.onTeeth) t.onTeeth(surg); }
    }
    const fdm = blocks.find((b) => b.tpl === 'fdm');
    if (fdm) blocks.filter((b) => b.tpl === 'soft' && overlap(b, fdm)).forEach((x) => {
      const sm = (x.params.softM || []).filter((m) => m === 'sct' || m === 'gingivo');
      if (!sm.length) return;
      fdm.params.softM = [...new Set((fdm.params.softM || []).concat(sm))]; fdm.auto.softM = 1;
      x.params.softM = x.params.softM.filter((m) => !sm.includes(m));
      if (!x.params.softM.length) blocks.splice(blocks.indexOf(x), 1);
    });
  }


  // ---------- ортопедия: чтение формулы SQNS, Кеннеди, план лечения ----------
  const STATE_RU = { removed: 'отсутствует', artificial_crown: 'искусственная коронка', temporary_crown: 'временная коронка', stump_crown: 'культевая вкладка',
    construct_removable: 'съёмная конструкция', construct_unremovable: 'несъёмная конструкция', bridge_intermediate: 'промежуточная часть мостовидного протеза',
    impacted: 'ретинирован', dystopic: 'дистопирован', tartar: 'зубной камень', dental_plaque: 'зубные отложения', wedge_shaped_defect: 'клиновидный дефект',
    caries: 'кариес', involvement_undefined_caries: 'кариес', enamel_caries: 'кариес эмали', dentin_caries: 'кариес дентина', pulp_involved_caries: 'кариес с вовлечением пульпы', caries_surface_undefined: 'кариес', secondary_caries_surface_undefined: 'вторичный кариес',
    enamel_filling: 'пломба', dentin_filling: 'пломба', pulp_involved_filling: 'пломба', involvement_undefined_filling: 'пломба', surface_type_undefined_filling: 'пломба', initial_caries: 'начальный кариес', secondary_caries: 'вторичный кариес', sealed: 'пломба', buildup: 'билдап', indirect_restoration: 'непрямая реставрация' };
  const ARCH = { upper: [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28], lower: [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38] };
  // { '26': ['artificial_crown','stump_crown'], ... } — только активные статусы постоянных зубов (любой участок)
  function readFormula(f) {
    const res = {}, T = (f && f.permanentTeeth) || {};
    Object.keys(T).forEach((tk) => { const L = (T[tk] || {}).locations || {};
      Object.keys(L).forEach((lk) => { const S2 = (L[lk] || {}).states || {};
        Object.keys(S2).forEach((sk) => { if (S2[sk] && S2[sk].isActive) { res[tk] = res[tk] || []; if (!res[tk].includes(sk)) res[tk].push(sk); } }); }); });
    return res;
  }
  const stName = (k, f) => { const n = f && f.stateNames && f.stateNames[k]; return STATE_RU[k] || (n && (n.name || n)) || k.replace(/_/g, ' '); };
  const isImplant = (st) => st.some((x) => /implant/i.test(x));
  const isMissing = (st) => st.includes('removed') && !isImplant(st) && !st.includes('bridge_intermediate');
  // группы подряд идущих зубов по дуге, удовлетворяющих условию
  function runs(jaw, cond) { const out = []; let cur = []; ARCH[jaw].forEach((t) => { if (cond(String(t))) cur.push(String(t)); else { if (cur.length) out.push(cur); cur = []; } }); if (cur.length) out.push(cur); return out; }
  const sortT = (arr) => { const a = arr.slice(); const q = new Set(a.map((t) => String(t)[0])); return q.size === 1 ? a.sort((x, y) => +x - +y) : a; };
  const span = (r) => { const a = sortT(r); return a.length > 1 ? fmtTooth(a[0]) + '–' + fmtTooth(a[a.length - 1]) : fmtTooth(a[0]); };
  const listT = (arr) => sortT(arr).map(fmtTooth).join(', ');
  // Класс по Кеннеди. Восьмёрки учитываются, только если явно отмечены в формуле (коронка, пломба и т. п.).
  function kennedy(jaw, F) {
    const miss = (t) => isMissing(F[t] || []);
    const q = jaw === 'upper' ? [1, 2] : [4, 3];
    const pos = (sd, n) => String(q[sd] * 10 + n);
    const N7 = [1, 2, 3, 4, 5, 6, 7];
    if (![0, 1].some((sd) => N7.some((n) => miss(pos(sd, n))))) return null;
    if ([0, 1].every((sd) => N7.every((n) => miss(pos(sd, n))))) return { full: true };
    const eightPresent = (sd) => { const st = F[pos(sd, 8)]; return !!st && !st.includes('removed'); };
    const free = [0, 1].map((sd) => miss(pos(sd, 7)) && !eightPresent(sd));
    const R = runs(jaw, (t) => +t[1] <= 7 && miss(t));
    const fc = free.filter(Boolean).length;
    let cls;
    if (fc === 2) cls = 'I';
    else if (fc === 1) cls = 'II';
    else {
      const cross = R.find((r) => r.includes(pos(0, 1)) && r.includes(pos(1, 1)));
      cls = cross && R.length === 1 ? 'IV' : 'III';
    }
    const mod = Math.max(0, R.length - (fc === 2 ? 2 : 1));
    return { cls, mod: cls === 'IV' ? 0 : mod, defects: R };
  }
  const JAW_RU = { upper: 'верхней челюсти', lower: 'нижней челюсти' };
  function formulaText(F, f) {
    const lines = [], used = new Set(), items = [];
    // мостовидные протезы: промежуточные части + соседние коронки
    ['upper', 'lower'].forEach((jaw) => {
      runs(jaw, (t) => (F[t] || []).includes('bridge_intermediate')).forEach((r) => {
        const A = ARCH[jaw].map(String), i0 = A.indexOf(r[0]), i1 = A.indexOf(r[r.length - 1]);
        const ab = [A[i0 - 1], A[i1 + 1]].filter((t) => t && ((F[t] || []).includes('artificial_crown') || isImplant(F[t] || [])));
        const all = ab.concat(r).sort((a, b) => A.indexOf(a) - A.indexOf(b)); all.forEach((t) => used.add(t));
        lines.push('мостовидный протез ' + span(all) + (ab.length ? ' (опоры ' + listT(ab) + ', промежуточная часть ' + listT(r) + ')' : '')); items.push({ kind: 'bridge', text: lines[lines.length - 1], teeth: all, whole: true });
      });
    });
    const by = (k) => Object.keys(F).filter((t) => F[t].includes(k) && !used.has(t)).sort();
    const miss = Object.keys(F).filter((t) => isMissing(F[t])).sort();
    const impl = Object.keys(F).filter((t) => isImplant(F[t])).sort();
    const st = [];
    if (miss.length) st.push('Отсутствуют зубы: ' + miss.map(fmtTooth).join(', ') + '.');
    if (impl.length) st.push('Имплантаты в позициях: ' + listT(impl) + '.');
    const cons = [];
    if (lines.length) cons.push(...lines);
    const cs = Object.keys(F).filter((t) => F[t].includes('artificial_crown') && F[t].includes('stump_crown') && !used.has(t)).sort();
    if (cs.length) { cons.push('искусственные коронки на культевых вкладках ' + listT(cs)); items.push({ kind: 'cs', label: ['искусственная коронка на культевой вкладке', 'искусственные коронки на культевых вкладках'], teeth: cs }); cs.forEach((t) => used.add(t)); }
    [['artificial_crown', 'искусственные коронки', 'искусственная коронка'], ['temporary_crown', 'временные коронки', 'временная коронка'], ['stump_crown', 'культевые вкладки', 'культевая вкладка'], ['construct_unremovable', 'несъёмные конструкции', 'несъёмная конструкция'], ['construct_removable', 'съёмные конструкции в области', 'съёмная конструкция в области'], ['indirect_restoration', 'непрямые реставрации', 'непрямая реставрация']]
      .forEach(([k, l, l1]) => { const t = by(k); if (t.length) { cons.push(l + ' ' + listT(t)); if (k !== 'construct_removable') items.push({ kind: k, label: [l1, l], teeth: t }); } });
    const skip = ['removed', 'artificial_crown', 'temporary_crown', 'stump_crown', 'construct_unremovable', 'construct_removable', 'indirect_restoration', 'bridge_intermediate'];
    const other = Object.keys(F).sort().map((t) => { const x = F[t].filter((k) => !skip.includes(k) && !/implant/i.test(k)); return x.length ? fmtTooth(t) + ' — ' + x.map((k) => stName(k, f)).join(', ') : ''; }).filter(Boolean);
    return { status: st, constructions: cons, items, other, missing: miss, implants: impl };
  }
  const ORTHO_CODES = ['A16.07.003', 'A16.07.004', 'A16.07.005', 'A16.07.006', 'A16.07.023', 'A16.07.035', 'A16.07.036', 'A16.07.049', 'A16.07.053', 'A16.07.094', 'A02.07.010', 'A23.07'];
  const SKIP_CODES = ['B01.', 'B01.003', 'A02.07.001'];
  const ncode = (name) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[АВСЕКМНОРТХ]/g, (c) => ({ 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' }[c]));
  const isOrthoItem = (it) => { const c = ncode(it.name); return ORTHO_CODES.some((x) => c.startsWith(x)) && !/хирургическ\S* шаблон|временн\S* а+б+атмент/i.test(it.name); };
  const isSkipItem = (it) => SKIP_CODES.some((x) => ncode(it.name).startsWith(x));
  const ORTHO_LABEL = [['A16.07.004', 'Коронка'], ['A16.07.005', 'Мостовидный протез'], ['A16.07.003', 'Восстановление'], ['A16.07.006', 'На имплантате'], ['A16.07.023', 'Полный съёмный протез'],
    ['A16.07.035', 'Частичный съёмный протез'], ['A16.07.036', 'Бюгельный протез'], ['A02.07.010', 'Оттиски / диагностика'], ['A16.07.053', 'Снятие конструкции'], ['A16.07.094', 'Удаление штифта / вкладки'], ['A16.07.049', 'Повторная фиксация'], ['A23.07', 'Лабораторно']];
  function itemText(it) {
    const c = ncode(it.name); const lab = (ORTHO_LABEL.find(([k]) => c.startsWith(k)) || [0, ''])[1];
    let inner = (it.name.match(/\((.*)\)\s*$/) || [0, ''])[1] || it.name.replace(/^\S+\s/, '');
    inner = inner.replace(/,?\s*1\s*ед\.?/gi, '').replace(/\s*1ед\.?/gi, '').replace(/\s+/g, ' ').trim();
    const teeth = (it.teeth || []).length ? ' — ' + it.teeth.slice().sort().map(fmtTooth).join(', ') : (it.qty > 1 ? ' ×' + it.qty : '');
    return (lab && inner && !/^снятие|^удаление/i.test(inner) ? lab + ' (' + inner + ')' : lab || inner) + teeth;
  }
  const REMOVE_CODES = ['A16.07.053'], POST_CODES = ['A16.07.094'];
  const isRemoveItem = (it) => REMOVE_CODES.some((x) => ncode(it.name).startsWith(x));
  const isPostItem = (it) => POST_CODES.some((x) => ncode(it.name).startsWith(x));
  function prepKind(it) {
    const c = ncode(it.name);
    if (/^A16\.07\.(001|024)/.test(c)) return 'prepExt';
    if (c.startsWith('A16.07.054')) return 'prepImp';
    if (/^A16\.07\.(008|009|010|030|082)/.test(c) || (c.startsWith('A16.07.002') && /эндолеч/i.test(it.name))) return 'prepEndo';
    if (c.startsWith('A16.07.002')) return 'prepCaries';
    return '';
  }
  const planItems = (plans, ids) => { const out = []; plans.filter((p) => (ids || []).includes(String(p.id))).forEach((p) => (p.treatmentPlanItems || []).forEach((it) => { if (it.type === 'service' || it.name) out.push(it); })); return out; };
  function planText(plans, ids, O) {
    O = O || {};
    const sel = plans.filter((p) => (ids || []).includes(String(p.id)));
    const items = []; sel.forEach((p) => (p.treatmentPlanItems || []).forEach((it) => { if (it.type === 'service' || it.name) items.push(it); }));
    const prep = items.filter((it) => !isOrthoItem(it) && !isSkipItem(it) && !(O.takePrep && prepKind(it))).map((it) => { const t = (it.teeth || []).length ? ' — ' + listT(it.teeth) : ''; return it.name.replace(/^\S+\s/, '').replace(/,?\s*1\s*ед\.?/gi, '').replace(/\(\s*\)/, '').trim() + t; });
    const orth = items.filter(isOrthoItem).map((it) => {
      if ((it.teeth || []).length) return it;
      const t = isRemoveItem(it) ? O.remove : isPostItem(it) ? O.removePost : null;
      return t && t.length ? Object.assign({}, it, { teeth: t }) : it;
    });
    // мосты из плана: промежуточные части + соседние коронки того же материала
    const out = [], usedIt = new Set();
    orth.filter((it) => ncode(it.name).startsWith('A16.07.005') && (it.teeth || []).length).forEach((pont) => {
      const jaw = ARCH.upper.map(String).includes(pont.teeth[0]) ? 'upper' : 'lower', A = ARCH[jaw].map(String);
      const idx = pont.teeth.map((t) => A.indexOf(t)).sort((a, b) => a - b);
      const ab = orth.filter((it) => ncode(it.name).startsWith('A16.07.004') && (it.teeth || []).some((t) => A.indexOf(t) === idx[0] - 1 || A.indexOf(t) === idx[idx.length - 1] + 1));
      if (!ab.length) return;
      const abT = []; ab.forEach((it) => { it.teeth.forEach((t) => { if (A.indexOf(t) === idx[0] - 1 || A.indexOf(t) === idx[idx.length - 1] + 1) abT.push(t); }); usedIt.add(it); });
      usedIt.add(pont);
      const all = abT.concat(pont.teeth).sort((a, b) => A.indexOf(a) - A.indexOf(b));
      const inner = (nm) => ((nm.match(/\((.*)\)\s*$/) || [0, ''])[1] || '').replace(/,?\s*1\s*ед\.?/gi, '').replace(/\s*1ед\.?/gi, '').replace(/^использование промежуточной части\s*/i, '').trim();
      out.push('Мостовидный протез ' + span(all) + ': опорные коронки ' + listT(abT) + ' (' + inner(ab[0].name) + '), промежуточная часть ' + listT(pont.teeth) + ' (' + inner(pont.name) + ')');
    });
    const prio = (it) => { const c = ncode(it.name); return c.startsWith('A16.07.053') || c.startsWith('A16.07.094') ? 0 : c.startsWith('A02.07.010') || c.startsWith('A23.07') ? 2 : 1; };
    const pre = [], post = [];
    orth.filter((it) => !usedIt.has(it)).sort((a, c) => prio(a) - prio(c)).forEach((it) => { (prio(it) === 0 ? pre : post).push(itemText(it)); });
    out.unshift(...pre); out.push(...post.filter((x) => !pre.includes(x)));
    return { prep, orth: out, count: sel.length };
  }


  const esc2 = (x) => String(x).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  let ORTHO_MKB = 'K08.1';
  // Диагноз: сначала код МКБ с полным названием, Кеннеди — уточнением (по желанию)
  function diagText(code, kenn, crownT) {
    if (code === 'K08.8') return 'K08.8 Другие уточнённые изменения зубов и их опорного аппарата' + (crownT && crownT.length ? ': дефект коронковой части ' + (crownT.length > 1 ? 'зубов ' : 'зуба ') + listT(crownT) : ': дефекты коронковой части зубов') + '.';
    return 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни.' + (kenn && kenn.length ? ' ' + kenn.map((x, i) => (i ? x.charAt(0).toLowerCase() + x.slice(1) : x)).join('; ') + '.' : '');
  }
  function orthoExamText(p, X) {
    const pg = X.page || {}, f = pg.formula, F = f ? readFormula(f) : {}, d = formulaText(F, f);
    const kU = kennedy('upper', F), kL = kennedy('lower', F);
    const kTxt = (k, jaw) => !k ? '' : k.full ? 'Полная вторичная адентия ' + JAW_RU[jaw] : 'Частичная вторичная адентия ' + JAW_RU[jaw] + ', ' + k.cls + ' класс по Кеннеди' + (k.mod ? ', ' + k.mod + ' подкласс' : '');
    const dg = [kTxt(kU, 'upper'), kTxt(kL, 'lower')].filter(Boolean);
    const hasCons = d.constructions.length > 0;
    let diag;
    ORTHO_MKB = (p.diag === 'K08.8' || (p.diag === 'auto' && f && !dg.length)) ? 'K08.8' : 'K08.1';
    const R = (p.remove || []).map(String), RP = (p.removePost || []).map(String);
    const remBad = (p.remU === 'replace' || p.remL === 'replace');
    const badCons = R.length > 0 || remBad;
    const crownT = [...new Set(planItems(pg.plans || [], (p.plans || []).length > 1 ? [p.mainPlan || p.plans[0]] : (p.plans || [])).filter((it) => isOrthoItem(it) && !isRemoveItem(it) && !isPostItem(it)).flatMap((it) => it.teeth || []).map(String))];
    diag = diagText(ORTHO_MKB, p.kennedy ? dg : [], crownT) + (badCons ? ' Несостоятельные ортопедические конструкции.' : '');
    const C = { chew: 'затруднённое пережёвывание пищи', aesth: 'эстетический дефект', missing: 'отсутствие зубов', broken: 'разрушение зубов', old: 'несостоятельность имеющихся ортопедических конструкций', removable: 'неудобство пользования съёмным протезом' };
    const compl = (p.complaints || []).map((k) => C[k]).filter(Boolean);
    const prevDone = p.prev === 'yes' || (p.prev === 'auto' && hasCons);
    const st = [];
    st.push(...d.status);
    // конструкции: снимаемые — несостоятельны, остальные — состоятельны
    const good = [], bad = [], seen = new Set();
    const lab = (it, t) => it.text || ((t.length > 1 ? it.label[1] : it.label[0]) + ' ' + listT(t));
    d.items.forEach((it) => {
      it.teeth.forEach((t) => seen.add(t));
      if (it.whole) { (it.teeth.some((t) => R.includes(t)) ? bad : good).push(lab(it, it.teeth)); return; }
      const b1 = it.teeth.filter((t) => R.includes(t)), g1 = it.teeth.filter((t) => !R.includes(t));
      if (b1.length) bad.push(lab(it, b1)); if (g1.length) good.push(lab(it, g1));
    });
    const extraR = R.filter((t) => !seen.has(t));
    if (extraR.length) bad.push('конструкции в области ' + listT(extraR));
    if (good.length || bad.length) st.push('Имеющиеся несъёмные конструкции: ' + [good.length ? 'состоятельны — ' + good.join('; ') : '', bad.length ? 'несостоятельны, подлежат снятию — ' + bad.join('; ') : ''].filter(Boolean).join('; ') + '.');
    const REM = { keep: 'состоятелен, пациент продолжает пользоваться', replace: 'несостоятелен, подлежит замене' };
    if (REM[p.remU]) st.push('Съёмный протез верхней челюсти: ' + REM[p.remU] + '.');
    if (REM[p.remL]) st.push('Съёмный протез нижней челюсти: ' + REM[p.remL] + '.');
    if (d.other.length) st.push(d.other.join('; ') + '.');
    st.push('Прикус ' + p.bite + '.');
    st.push({ ok: 'ВНЧС: движения в суставах плавные, безболезненные.', click: 'ВНЧС: щелчок при открывании рта.', pain: 'ВНЧС: болезненность при пальпации.' }[p.tmj]);
    st.push({ ok: 'Слизистая оболочка протезного ложа бледно-розовая, без патологических изменений.', atrophy: 'Атрофия альвеолярного гребня в области дефектов зубного ряда.', inflam: 'Слизистая оболочка протезного ложа гиперемирована.' }[p.mucosa]);
    const plans = pg.plans || [], ids = p.plans || [];
    const main = ids.length > 1 ? [p.mainPlan || ids[0]] : ids;
    const P1 = planText(plans, main, { takePrep: true, remove: R, removePost: RP.length ? RP : null }), others = ids.filter((x) => !main.includes(x));
    const t = ['Консультация врача-стоматолога-ортопеда. Проведён осмотр, оценка зубной формулы, имеющихся конструкций и окклюзии.' + (p.xray ? ' Анализ рентгенограмм / КЛКТ.' : ''), 'Составлен план лечения:'];
    const tw = (a, one, many) => (a.length > 1 ? many : one) + ' ' + listT(a);
    const surg = [], ther = [];
    if ((p.prepExt || []).length) surg.push(tw(p.prepExt, 'удаление зуба', 'удаление зубов'));
    if ((p.prepImp || []).length) surg.push('дентальная имплантация в области ' + listT(p.prepImp));
    if ((p.prepSurgText || '').trim()) surg.push(p.prepSurgText.trim());
    if ((p.prepCaries || []).length) ther.push(tw(p.prepCaries, 'лечение кариеса зуба', 'лечение кариеса зубов'));
    if ((p.prepEndo || []).length) ther.push(tw(p.prepEndo, 'эндодонтическое лечение зуба', 'эндодонтическое лечение зубов'));
    if ((p.prepTherText || '').trim()) ther.push(p.prepTherText.trim());
    const prepParts = [];
    if (surg.length) prepParts.push('хирургическая подготовка — ' + surg.join(', '));
    if (ther.length) prepParts.push('терапевтическая санация — ' + ther.join(', '));
    prepParts.push(...P1.prep);
    if (prepParts.length) t.push('Этап подготовки: ' + prepParts.join('; ') + '.');
    if (P1.orth.length) t.push('Ортопедический этап: ' + P1.orth.join('; ') + '.');
    if (!prepParts.length && !P1.orth.length) t.push('___');
    if (others.length && p.variants) others.forEach((id, i) => { const V = planText(plans, [id]); const pl = plans.find((x) => String(x.id) === id) || {};
      t.push('Альтернативный вариант ' + (i + 2) + ' («' + (pl.title || 'План') + '»): ' + V.prep.concat(V.orth).join('; ') + '.'); });
    t.push('План лечения, сроки и стоимость согласованы с пациентом.');
    return {
      complaints: 'Жалобы на ' + (compl.length ? compl.join(', ') : '___') + '.',
      anamnesisMorbi: prevDone ? 'Ранее проводилось ортопедическое лечение.' : 'Ранее ортопедическое лечение не проводилось.',
      statusLocalis: st.join(' '),
      xray: p.xray ? 'Рентгенологическое обследование / КЛКТ: ___' : '',
      diagnosis: diag,
      treatment: t.join(' '),
      recommendations: (prepParts.length ? 'Подготовка полости рта согласно плану лечения перед ортопедическим этапом. ' : '') + 'Явка на следующий этап по записи.',
    };
  }

  // ===================== ОРТОПЕДИЯ: ЭТАПЫ ЛЕЧЕНИЯ =====================
  // Маршрут (вид конструкции) берётся из принятого плана, пройденные этапы — из строк «Этап лечения (…): …» прошлых дневников.
  const ROUTES = {
    fixed: { label: 'несъёмное протезирование', title: 'Коронки / мосты' },
    implant: { label: 'протезирование на имплантатах', title: 'Коронки на имплантатах' },
    veneer: { label: 'виниры', title: 'Виниры' },
    removable: { label: 'частичное съёмное протезирование', title: 'Частичный съёмный / бюгельный' },
    complete: { label: 'полное съёмное протезирование', title: 'Полный съёмный' },
    implRem: { label: 'съёмное протезирование на имплантатах', title: 'Съёмный / условно-съёмный на имплантатах' },
  };
  const ROUTE_ORDER = ['fixed', 'implant', 'veneer', 'removable', 'complete', 'implRem'];
  // opt — необязательный этап (не предлагается сам); with — этапы, которые обычно идут в тот же визит
  const STAGES = {
    fixed: [
      { id: 'remove', t: 'снятие несостоятельных конструкций', det: /снятие несостоятельн\S* ортопедическ/i, opt: true },
      { id: 'tempImp', t: 'оттиски (сканирование) для временных коронок', det: /для изготовления временн\S* коронок/i, alt: ['оттиски для временных коронок'], opt: true },
      { id: 'postLab', t: 'изготовление культевой вкладки', det: /ложа под культевую вкладку/i, need: (R) => R.posts === 'lab' || R.posts === 'direct' },
      { id: 'postFix', t: 'фиксация культевой вкладки', det: /припасовка культевой вкладки/i, need: (R) => R.posts === 'lab' || R.posts === 'direct', with: ['prep'] },
      { id: 'fiber', t: 'восстановление культи на стекловолоконном штифте', det: /стекловолоконного штифта/i, need: (R) => R.posts === 'fiber', with: ['prep'] },
      { id: 'prep', t: 'препарирование, временные коронки', det: /препарирование зуб\S* [^.]*под ортопедическ/i },
      { id: 'imp', t: 'оттиски (сканирование) под постоянные конструкции', det: /препарированных зубов/i },
      { id: 'bite', t: 'определение прикуса', det: /валиками\.|регистрация центральной окклюзии/i, opt: true },
      { id: 'fix', t: 'припасовка и фиксация постоянных конструкций', det: /припасовка постоянных конструкций/i, final: true },
    ],
    implant: [
      { id: 'iImp', t: 'оттиски (сканирование) с уровня имплантатов', det: /с имплантатов в позиции[^.]*\.\s*установка (скан|трансфер)/i },
      { id: 'bite', t: 'определение прикуса', det: /валиками\.|регистрация центральной окклюзии/i, opt: true },
      { id: 'iFix', t: 'фиксация коронок на имплантатах', det: /припасовка коронок на имплантатах/i, final: true },
    ],
    veneer: [
      { id: 'vDiag', t: 'диагностические оттиски для wax-up', det: /восковой моделировки \(wax-up\)/i },
      { id: 'vMock', t: 'mock-up', det: /\(mock-up\)/i },
      { id: 'vPrep', t: 'препарирование под виниры', det: /препарирование [^.]*под виниры/i },
      { id: 'vFix', t: 'фиксация виниров', det: /припасовка виниров/i, final: true },
    ],
    removable: [
      { id: 'rImp', t: 'анатомические оттиски', det: /для изготовления (частичного съёмного|бюгельного) протеза/i },
      { id: 'rBite', t: 'определение центральной окклюзии', det: /определение центральной окклюзии при помощи восковых/i },
      { id: 'rTry', t: 'примерка конструкции', det: /примерка (каркаса бюгельного протеза|восковой композиции (частичного съёмного|бюгельного))/i },
      { id: 'rFix', t: 'наложение протеза', det: /наложение (частичного съёмного|бюгельного) протеза/i, final: true },
    ],
    complete: [
      { id: 'cPre', t: 'оттиски для индивидуальных ложек', det: /для изготовления индивидуальных ложек/i },
      { id: 'cImp', t: 'функциональные оттиски', det: /функционального оттиска/i },
      { id: 'cBite', t: 'определение центрального соотношения', det: /прикусными валиками: высота/i },
      { id: 'cTry', t: 'примерка конструкции', det: /восковой композиции полного/i },
      { id: 'cFix', t: 'наложение протеза', det: /наложение полного съёмного протеза/i, final: true },
    ],
    implRem: [
      { id: 'irPre', t: 'оттиски для индивидуальной ложки', det: /для изготовления индивидуальной ложки/i, opt: true },
      { id: 'irImp', t: 'оттиски (сканирование) с уровня имплантатов', det: /формирователей десны\.\s*установка (скан|трансфер)/i },
      { id: 'bite', t: 'определение прикуса', det: /валиками\.|регистрация центральной окклюзии/i, opt: true },
      { id: 'irTry', t: 'примерка конструкции', det: /пассивная посадка/i },
      { id: 'irFix', t: 'фиксация (наложение) конструкции', det: /фиксация \(наложение\) конструкции на имплантатах/i, final: true },
    ],
  };

  // ---- маршруты из позиций плана ----
  function routeOf(it) {
    const c = ncode(it.name), n = it.name || '';
    if (/коррекци|перебазир|очистк|починк|матриц|лабораторный этап|хирургическ\S* шаблон|снятие и установка|обслуживани/i.test(n)) return '';
    if (c.startsWith('A16.07.006')) {
      if (/полным несъемн|балк|шарик|o-ring|ретенцион/i.test(n)) return 'implRem';
      if (/коронк/i.test(n) && !/временн/i.test(n)) return 'implant';
      return '';
    }
    if (c.startsWith('A16.07.023') || /полного протеза/i.test(n)) return /имплант|балоч|шаровид|all-on|условно/i.test(n) ? 'implRem' : 'complete';
    if (c.startsWith('A16.07.035') || c.startsWith('A16.07.036') || /частичного/i.test(n) && c.startsWith('A23')) return 'removable';
    const inner = (n.match(/\(([^)]*)\)\s*$/) || [0, n])[1];
    if (c.startsWith('A16.07.003') && /винир/i.test(inner) && !/временн/i.test(inner)) return 'veneer';
    if ((c.startsWith('A16.07.004') || c.startsWith('A16.07.005') || (c.startsWith('A16.07.003') && /вкладкой керамич/i.test(n))) && !/временн|десны/i.test(n)) return 'fixed';
    return '';
  }
  function acceptedItems(pg) {
    const plans = ((pg && pg.plans) || []).filter((p) => p.applied);
    const out = []; plans.forEach((p) => (p.treatmentPlanItems || []).forEach((it) => out.push(it)));
    return { plans, items: out };
  }
  function detectRoutes(pg) {
    const { items } = acceptedItems(pg), R = {};
    items.forEach((it) => {
      const r = routeOf(it); if (!r) return;
      R[r] = R[r] || { id: r, teeth: [], items: [] }; R[r].items.push(it); (it.teeth || []).forEach((t) => { if (!R[r].teeth.includes(String(t))) R[r].teeth.push(String(t)); });
    });
    // культевые вкладки, временные коронки, снятие — к несъёмному маршруту
    const posts = items.filter((it) => ncode(it.name).startsWith('A16.07.003') && /культев/i.test(it.name));
    const temps = items.filter((it) => /временн/i.test(it.name) && /^A16\.07\.00[45]/.test(ncode(it.name)));
    if (R.fixed) {
      if (posts.length) { R.fixed.posts = posts.some((p) => /стекловолок|композитн/i.test(p.name)) ? 'fiber' : posts.some((p) => /в полости рта/i.test(p.name)) ? 'direct' : 'lab'; R.fixed.postTeeth = [...new Set(posts.flatMap((p) => (p.teeth || []).map(String)))]; }
      if (temps.length) R.fixed.temp = temps.some((t) => /в полости рта/i.test(t.name)) ? 'chair' : 'lab';
      R.fixed.tempScan = temps.some((t) => /pmma|фрезерован|печат|3d/i.test(t.name));
      const nm = R.fixed.items.map((i) => i.name).join(' ');
      R.fixed.cem = /циркон/i.test(nm) ? 'rmgi' : /e-?max|керамическ|винир/i.test(nm) ? 'comp' : 'gic';
      R.fixed.mk = /цельнолит|металлокерам/i.test(nm) && !/циркон/i.test(nm);
      R.fixed.remove = items.filter(isRemoveItem).flatMap((i) => (i.teeth || []).map(String));
      R.fixed.hasRemove = items.some(isRemoveItem);
    }
    if (R.implant) R.implant.screw = R.implant.items.some((i) => /винтов/i.test(i.name));
    if (R.removable) R.removable.bugel = R.removable.items.some((i) => ncode(i.name).startsWith('A16.07.036'));
    return R;
  }
  // ---- пройденные этапы из прошлых дневников ----
  const strip = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/(\d)\.(\d)/g, '$1$2').replace(/\s+/g, ' ');   // «2.6» → «26», чтобы точки в номерах зубов не рвали фразы
  function stageHistory(pg) {
    const vd = dDay(pg && pg.visitDate) || dDay(new Date()), out = [];
    ((pg && pg.history && pg.history.visits) || []).forEach((v) => {
      if (pg.visitId && (v.id === pg.visitId || v.visitID === pg.visitId)) return;
      (v.journals || []).forEach((j) => {
        const d = dDay(j.startDate || v.date || v.startDate); if (d && d >= vd) return;
        out.push({ text: (j.journalItems || []).map((it) => strip(it.content)).join(' '), raw: (j.journalItems || []).map((it) => rawText(it.content)).join(' '), date: d, emp: empOf(v, j) });
      });
    });
    ((pg && pg.otherJournals) || []).forEach((j) => out.push({ text: (j.journalItems || []).map((it) => strip(it.content)).join(' '), raw: (j.journalItems || []).map((it) => rawText(it.content)).join(' '), date: vd, emp: [], cur: true }));
    return out;
  }
  const rawText = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  // Кто вёл запись (проверено пробой 27.11.2026): врач визита — visit.employeeID / visit.employee.id;
  // запасной вариант — автор дневника journal.creatorID / journal.creator.id. Сравнивается с currentEmployeeId и currentUserId.
  function empOf(v, j) {
    const ids = [], add = (x) => { if (x != null && x !== '') ids.push(String(x)); };
    if (v) { add(v.employeeID); if (v.employee && typeof v.employee === 'object') add(v.employee.id); }
    if (!ids.length && j) { add(j.creatorID); if (j.creator && typeof j.creator === 'object') add(j.creator.id); }
    return [...new Set(ids)];
  }

  /* ---------- ПРОДОЛЖЕНИЕ ЛЕЧЕНИЯ: что предложить в визите без услуг ----------
   * Каждый вариант: { id, icon, title, detail, date, emp[], make(E) → blocks }. emp — кто вёл прошлые записи (может быть пусто).
   */
  const OP_KINDS = [
    [/мембраны Шнайдера|трепанационного окна/i, 'открытого синус-лифтинга'], [/элевация дна верхнечелюстной/i, 'закрытого синус-лифтинга'],
    [/Установлен\S*[^.]*имплантат/i, 'имплантации'], [/декортикаци|расщеплени\S* альвеолярного/i, 'костной пластики'],
    [/удален\S* зуб|экстракци/i, 'удаления зуба'], [/формировател\S* десны|абатмент/i, 'установки формирователей десны'],
    [/гингивопластик|соединительнотканн/i, 'пластики мягких тканей'],
  ];
  // номера зубов из текста записи («2.6»), без диаметров имплантатов (Ø3.5×10) и размеров в мм
  const teethFromText = (t) => [...new Set([...String(t).matchAll(/(?<![Ø\d.,])([1-4])\.([1-8])(?![\d×x])(?!\s*мм)/g)].map((m) => m[1] + m[2]))].sort();
  function continuations(pg) {
    const out = [], hist = stageHistory(pg).filter((h) => !h.cur);
    const empsOf = (list) => [...new Set(list.flatMap((h) => h.emp || []))];
    // ортопедия: принятый план → обследование и план, затем этапы по маршрутам
    const ops = orthoPlanState(pg);
    if (ops.ready) {
      const pl = ops.pending[0];
      out.push({ id: 'orthoExam', icon: '📋', title: 'Ортопедия: обследование и план', detail: 'План «' + ((pl && pl.title) || 'План') + '» принят в лечение, записи с планом ещё не было', date: dDay(pl && (pl.date || pl.created_at)), emp: [],
        make: (E) => { const nb = E.newBlock('orthoExam', [], 'auto'); nb.autoNote = 'продолжение: есть план лечения'; return [nb]; } });
    } else if (ops.plans.length) {
      const RR = detectRoutes(pg), avail = ROUTE_ORDER.filter((r) => RR[r]), st = {};
      avail.forEach((r) => { st[r] = routeStatus(r, pg); });
      let rs = avail.filter((r) => st[r].started && !st[r].finished);
      if (!rs.length) { const f = avail.find((r) => !st[r].finished); if (f) rs = [f]; }
      if (rs.includes('fixed') && st.fixed.suggest.includes('fix')) { const rem = ['removable', 'complete'].find((r) => RR[r] && !st[r].started); if (rem && !rs.includes(rem)) rs.push(rem); }
      rs.forEach((r) => {
        const S2 = st[r], next = S2.list.filter((x) => S2.suggest.includes(x.id)).map((x) => x.t).join(' + ');
        const src = hist.filter((h) => /Составлен план лечения/.test(h.text) || STAGES[r].some((x) => x.det && x.det.test(h.text)));
        const T = ((S2.R && S2.R.teeth) || []).slice().sort();
        out.push({ id: 'ortho:' + r, icon: '👑', title: 'Ортопедия: ' + ROUTES[r].title + (T.length ? ' · ' + T.map(fmtTooth).join(', ') : ''),
          detail: (S2.started ? 'Следующий этап: ' : 'Первый этап: ') + (next || 'выберите этап'), date: Math.max(0, ...src.map((h) => h.date || 0)), emp: empsOf(src),
          make: (E) => { const nb = E.newBlock('orthoStage', [], 'auto'); nb.autoNote = 'продолжение лечения'; nb.svcNames = []; stageInit(nb, E.page, r); return [nb]; } });
      });
    }
    // послеоперационный осмотр: операция за последние 60 дней, после неё ещё не было осмотра (или швы не сняты)
    const vd = dDay(pg && pg.visitDate) || dDay(new Date());
    const ops2 = hist.filter((h) => /Гемостаз достигнут/.test(h.text) && h.date && vd - h.date <= 60 * 864e5).sort((a, b) => b.date - a.date);
    const op = ops2[0];
    if (op) {
      const checks = hist.filter((h) => /контрольный осмотр после/i.test(h.text) && h.date >= op.date);
      const sut = /Наложены швы|наложены швы/.test(op.text), catgut = /кетгут/i.test(op.text);
      const sutOff = checks.some((h) => /Снятие швов/.test(h.text));
      if (!checks.length || (sut && !catgut && !sutOff)) {
        const kinds = OP_KINDS.filter(([re]) => re.test(op.raw)).map(([, n]) => n).slice(0, 2);
        const opName = kinds.length ? kinds.join(' и ') : 'операции', teeth = teethFromText(op.raw), dt = fmtD(op.date);
        out.push({ id: 'postop', icon: '🩺', title: 'Осмотр после ' + opName + (teeth.length ? ' · ' + teeth.map(fmtTooth).join(', ') : ''),
          detail: 'Операция от ' + dt + (checks.length ? ' · был осмотр, швы ещё не сняты' : ' · осмотра ещё не было'), date: op.date, emp: op.emp || [],
          make: (E) => { const nb = E.newBlock('postop', teeth, 'auto'); nb.autoNote = 'продолжение: после операции от ' + dt;
            nb.params.op = opName; nb.params.opDate = dt; nb.auto.op = 1;
            nb.params.sutOut = sut && !catgut && checks.length > 0 ? true : sut && !catgut && vd - op.date >= 7 * 864e5; nb.auto.sutOut = 1; return [nb]; } });
      }
    }
    return out;
  }
  function routeStages(r, R) { return (STAGES[r] || []).filter((s) => !s.need || s.need(R || {})); }
  function doneStages(r, hist) {
    const lab = ROUTES[r].label, done = {};
    // этап узнаём по фразам, которые скрипт сам пишет в описании этапа (служебных строк в записи нет)
    hist.forEach((h) => STAGES[r].forEach((s) => { if (s.det && s.det.test(h.text)) done[s.id] = Math.max(done[s.id] || 0, h.date || 1); }));
    return done;
  }
  function suggestStages(r, R, done) {
    const list = routeStages(r, R), started = Object.keys(done).length > 0;
    const next = list.find((s) => !s.opt && !done[s.id]);
    if (!next) return [];
    const sel = [next.id].concat(next.with || []).filter((id) => !done[id]);
    if (!started && r === 'fixed') {
      if (R && R.hasRemove && !done.remove) sel.unshift('remove');
      // первый визит маршрута: снятие (если есть) + оттиски / сканы под временные; препарирование — следующим визитом
      if (next.id === 'prep' || next.id === 'fiber') return [...new Set(sel.filter((x) => x === 'remove').concat('tempImp'))];
    }
    return [...new Set(sel)];
  }
  function routeStatus(r, pg) {
    const RR = detectRoutes(pg), R = RR[r] || {}, done = doneStages(r, stageHistory(pg));
    const list = routeStages(r, R), finished = list.filter((s) => !s.opt).every((s) => done[s.id]);
    return { R, done, list, finished, started: Object.keys(done).length > 0, suggest: suggestStages(r, R, done) };
  }
  // ---- прикус по формуле: много отсутствующих боковых — восковые валики, иначе силиконовый регистрат ----
  function biteDefault(pg) {
    const F = pg && pg.formula ? readFormula(pg.formula) : {};
    const sides = [1, 2, 3, 4].map((q) => [4, 5, 6, 7].filter((n) => isMissing(F[String(q * 10 + n)] || [])).length);
    return sides.some((n) => n >= 3) ? 'wax' : 'sil';
  }
  const JAWS = (teeth) => { const s = new Set(teeth.map((t) => (/^[12]/.test(t) ? 'upper' : 'lower'))); return ['upper', 'lower'].filter((j) => s.has(j)); };
  const jawText = (jaws) => (jaws.length === 2 ? 'верхней и нижней челюстей' : jaws[0] === 'lower' ? 'нижней челюсти' : 'верхней челюсти');
  const CEM = { gic: 'стеклоиономерный цемент', rmgi: 'стеклоиономерный цемент, модифицированный смолой', comp: 'композитный цемент двойного отверждения по адгезивному протоколу' };
  const BITE = {
    wax: 'Определение центрального соотношения челюстей при помощи восковых шаблонов с прикусными валиками.',
    sil: 'Регистрация центральной окклюзии силиконовым материалом для регистрации прикуса.',
  };
  function stageInit(b, pg, route) {
    b.pg = pg;
    const RR = detectRoutes(pg);
    const st = (r) => routeStatus(r, pg);
    if (!route) {
      const avail = ROUTE_ORDER.filter((r) => RR[r]);
      route = avail.find((r) => st(r).started && !st(r).finished) || avail.find((r) => !st(r).finished) || avail[0] || 'fixed';
    }
    b.params.route = route; b.auto.route = RR[route] ? 1 : 0;
    const S = st(route), R = S.R;
    b.params.stages = S.suggest; if (S.suggest.length) b.auto.stages = 1;
    const T = (R.teeth || []).slice().sort();
    b.params.teeth = T; if (T.length) b.auto.teeth = 1; else delete b.auto.teeth;
    b.params.remTeeth = (R.remove || []).slice(); b.params.postTeeth = (R.postTeeth || []).slice();
    const Fm = pg && pg.formula ? readFormula(pg.formula) : {}, kj = ['upper', 'lower'].filter((j) => kennedy(j, Fm));
    b.params.jaw = JAWS(T).length ? JAWS(T) : kj.length ? kj : ['upper'];
    b.params.temp = R.temp === 'chair' ? 'chair' : 'lab';
    b.params.tempImpM = R.tempScan ? 'scan' : 'alg'; if (R.tempScan) b.auto.tempImpM = 1;
    b.params.cem = R.cem || 'gic';
    b.params.impM = R.mk ? 'sil' : 'scan';
    b.params.biteM = biteDefault(pg); if (pg && pg.formula) b.auto.biteM = 1;
    b.params.fixT = R.screw ? 'screw' : 'cem';
    b.params.postM = R.posts === 'direct' ? 'direct' : 'lab';
    ['temp', 'cem', 'impM', 'fixT'].forEach((k) => { if (RR[route]) b.auto[k] = 1; });
    // услуги визита: вид оттиска
    const sv = (b.svcNames || []).join(' ');
    if (/альгинат/i.test(sv)) b.params.rImpM = 'alg';
    if (/силикон/i.test(sv)) { b.params.impM = 'sil'; b.auto.impM = 1; }
    if (/цифров|сканер/i.test(sv)) { b.params.impM = 'scan'; b.auto.impM = 1; }
  }
  function stageWhy(b, pg) {
    const r = b.params.route, S = routeStatus(r, pg), lab = ROUTES[r].title;
    if (!acceptedItems(pg).plans.length) return 'Принятого плана лечения нет — этапы выбирайте вручную.';
    if (!detectRoutes(pg)[r]) return 'В принятом плане нет позиций для маршрута «' + lab + '» — этапы выбирайте вручную.';
    const done = S.list.filter((s) => S.done[s.id]).map((s) => s.t + ' (' + fmtD(S.done[s.id]) + ')');
    const sg = S.list.filter((s) => S.suggest.includes(s.id)).map((s) => s.t);
    return esc2('Маршрут «' + lab + '». Пройдено: ' + (done.length ? done.join('; ') : 'ничего') + '. ' + (sg.length ? 'Предложено сейчас: ' + sg.join(' + ') + '.' : 'Все этапы пройдены.'));
  }
  function stageFields(p, X) {
    const pg = X.page || {}, r = p.route, R = (detectRoutes(pg)[r]) || {}, sel = p.stages || [], has = (id) => sel.includes(id);
    const T = (p.teeth || []).slice().sort(), tl = T.length ? listT(T) : '___', tw = (T.length > 1 ? 'зубов ' : 'зуба ') + tl;
    const list = routeStages(r, R).filter((s) => has(s.id));
    if (!list.length) return { treatment: '' };
    const t = [], rec = [];
    const jaws = (p.jaw || []).length ? p.jaw : ['upper'];
    const imp = p.impM === 'scan' ? 'Цифровое сканирование внутриротовым 3D-сканером' : 'Снятие двухслойного оттиска А-силиконовым материалом';
    const shade = (p.shade || '').trim() ? ' Определение цвета: ' + p.shade.trim() + '.' : ' Определение цвета.';
    const plansTxt = R.items ? planText([{ id: 'r', treatmentPlanItems: R.items }], ['r'], {}).orth : [];
    if (r === 'fixed') {
      if (has('remove')) t.push('Снятие несостоятельных ортопедических конструкций с ' + ((p.remTeeth || []).length ? ((p.remTeeth.length > 1 ? 'зубов ' : 'зуба ') + listT(p.remTeeth)) : '___') + '.');
      if (has('tempImp')) t.push((p.tempImpM === 'scan' ? 'Цифровое сканирование внутриротовым 3D-сканером верхней и нижней челюстей и окклюзии' : 'Снятие оттисков альгинатным материалом с верхней и нижней челюстей') + ' для изготовления временных коронок в зуботехнической лаборатории.');
      const PT = (p.postTeeth || []).length ? listT(p.postTeeth) : tl;
      if (has('postLab')) t.push('Распломбирование корневого канала ' + PT + ' на 2/3 длины, формирование ложа под культевую вкладку. ' + (p.postM === 'direct' ? 'Моделирование культевой вкладки прямым методом.' : 'Снятие двухслойного оттиска А-силиконовым материалом для изготовления культевой вкладки в лаборатории.') + ' Временная пломба.');
      if (has('postFix')) t.push('Припасовка культевой вкладки ' + PT + ', фиксация на ' + (p.postCem === 'rmgi' ? 'стеклоиономерный цемент, модифицированный смолой' : 'стеклоиономерный цемент') + '.');
      if (has('fiber')) t.push('Распломбирование корневого канала ' + PT + ', подготовка ложа. Фиксация стекловолоконного штифта на композитный цемент двойного отверждения по адгезивному протоколу. Восстановление культи зуба композитным материалом.');
      if (has('prep')) {
        t.push('Препарирование ' + tw + ' под ортопедические конструкции с формированием уступа.');
        t.push(p.temp === 'chair' ? 'Изготовление временных коронок в полости рта, припасовка, фиксация на цинкоксидный цемент без эвгенола.' : 'Перебазировка, припасовка временных коронок, изготовленных в зуботехнической лаборатории, фиксация на цинкоксидный цемент без эвгенола.');
        t.push('Окклюзионные контакты проверены, скорректированы.');
        rec.push('Бережное отношение к временным коронкам: не откусывать твёрдую и липкую пищу. При расцементировке или поломке временной коронки — обратиться в клинику.');
      }
      if (has('imp')) {
        t.push((has('prep') ? '' : 'Снятие временных коронок. ') + 'Ретракция десны ретракционной нитью. ' + imp + (p.impM === 'scan' ? ' препарированных зубов, зубов-антагонистов и окклюзии.' : ' с препарированных зубов, оттиска альгинатным материалом с челюсти-антагониста.') + shade);
        if (!has('prep')) t.push('Повторная фиксация временных коронок на цинкоксидный цемент без эвгенола.');
      }
      if (has('bite')) t.push(BITE[p.biteM] || BITE.sil);
      if (has('fix')) {
        t.push((has('imp') ? '' : 'Снятие временных коронок, очистка культей от временного цемента. ') + 'Припасовка постоянных конструкций' + (plansTxt.length ? ' (' + plansTxt.join('; ') + ')' : '') + ': краевое прилегание, контактные пункты, окклюзионные контакты удовлетворительные, эстетика согласована с пациентом.');
        t.push('Фиксация на ' + CEM[p.cem || 'gic'] + '. Удаление излишков цемента. Окклюзия проверена.');
        rec.push('Гигиена полости рта с использованием зубной нити / ирригатора. Возможна чувствительность зубов в течение нескольких дней. Профилактический осмотр через 6 месяцев.');
      }
    }
    if (r === 'implant') {
      if (has('iImp')) t.push('Снятие формирователей десны с имплантатов в позиции ' + tl + '. ' + (p.impM === 'scan' ? 'Установка скан-маркеров' + (p.mu ? ' на мультиюниты' : '') + ', цифровое сканирование внутриротовым 3D-сканером, сканирование антагониста и окклюзии.' : 'Установка трансферов' + (p.mu ? ' на уровне мультиюнитов' : '') + ', снятие оттиска А-силиконовым материалом, оттиск челюсти-антагониста.') + shade + ' Установка формирователей десны.');
      if (has('bite')) t.push(BITE[p.biteM] || BITE.sil);
      if (has('iFix')) {
        t.push('Снятие формирователей десны с имплантатов в позиции ' + tl + '. Припасовка коронок на имплантатах: краевое прилегание, контактные пункты, окклюзионные контакты удовлетворительные.');
        t.push(p.fixT === 'screw' ? 'Фиксация коронок винтами с усилием ' + (p.torque || 30) + ' Н·см. Закрытие шахты винта политетрафторэтиленовой лентой и композитным материалом.' : 'Установка абатментов, затягивание винтов с усилием ' + (p.torque || 30) + ' Н·см, закрытие шахт винтов. Фиксация коронок на ' + CEM[p.cem === 'gic' ? 'gic' : 'rmgi'] + ', тщательное удаление излишков цемента.');
        t.push('Окклюзия проверена.');
        rec.push('Тщательная гигиена в области имплантатов (ирригатор, монопучковая щётка). Профилактический осмотр через 6 месяцев.');
      }
    }
    if (r === 'veneer') {
      if (has('vDiag')) t.push((p.impM === 'scan' ? 'Цифровое сканирование' : 'Снятие диагностических оттисков А-силиконовым материалом') + ' для восковой моделировки (wax-up). Фотопротокол.');
      if (has('vMock')) t.push('Перенос восковой моделировки в полость рта (mock-up) временным композитным материалом по силиконовому ключу. Форма и цвет будущих реставраций согласованы с пациентом.');
      if (has('vPrep')) { t.push('Препарирование ' + tw + ' под виниры' + (has('vMock') ? ' через mock-up' : '') + '. Ретракция десны. ' + imp + '.' + shade + (p.tempV ? ' Изготовление временных виниров.' : '')); rec.push('Не откусывать твёрдую пищу передними зубами.'); }
      if (has('vFix')) { t.push('Припасовка виниров ' + tl + ': краевое прилегание, цвет и форма согласованы с пациентом. Изоляция, протравливание, силанизация. Фиксация на композитный цемент двойного отверждения по адгезивному протоколу. Удаление излишков, полировка. Окклюзия проверена.'); rec.push('Не откусывать твёрдую пищу передними зубами. Профилактический осмотр через 6 месяцев.'); }
    }
    const protName = r === 'removable' ? (R.bugel ? 'бюгельного протеза' : 'частичного съёмного протеза') : r === 'complete' ? 'полного съёмного протеза' : 'конструкции';
    const jt = jawText(jaws);
    if (r === 'removable') {
      if (has('rImp')) t.push('Снятие анатомических оттисков ' + ({ alg: 'альгинатным', csil: 'С-силиконовым', asil: 'А-силиконовым' }[p.rImpM || 'alg']) + ' материалом с ' + jt + (jaws.length < 2 ? ' и челюсти-антагониста' : '') + ' для изготовления ' + protName + '.');
      if (has('rBite')) t.push('Определение центральной окклюзии при помощи восковых шаблонов с прикусными валиками. Подбор цвета и формы искусственных зубов.');
      if (has('rTry')) t.push('Примерка ' + (R.bugel ? 'каркаса бюгельного протеза и ' : '') + 'восковой композиции ' + protName + ' в полости рта: постановка искусственных зубов, окклюзионные контакты, фиксирующие элементы. Коррекция.');
      if (has('rFix')) { t.push('Наложение ' + protName + '. Проверка фиксации и стабилизации, окклюзионных контактов, коррекция. Обучение пациента правилам пользования протезом и уходу за ним.'); rec.push('Период адаптации к протезу. Снимать протез на ночь, чистить после еды. Коррекция через 1–2 дня или при натёртостях.'); }
    }
    if (r === 'complete') {
      if (has('cPre')) t.push('Снятие анатомических оттисков альгинатным материалом с ' + jt + ' для изготовления индивидуальных ложек.');
      if (has('cImp')) t.push('Припасовка индивидуальной ложки (проба Гербста), окантовка краёв термопластической массой. Снятие функционального оттиска ' + (p.cImpM === 'asil' ? 'А-силиконовым' : 'С-силиконовым') + ' материалом с ' + jt + '.');
      if (has('cBite')) t.push('Определение центрального соотношения челюстей при помощи восковых шаблонов с прикусными валиками: высота нижнего отдела лица, протетическая плоскость, ориентиры для постановки зубов. Подбор цвета и формы искусственных зубов.');
      if (has('cTry')) t.push('Примерка восковой композиции ' + protName + ': постановка зубов, высота нижнего отдела лица, окклюзионные контакты, эстетика. Коррекция.');
      if (has('cFix')) { t.push('Наложение ' + protName + ' на ' + jt + '. Проверка фиксации, стабилизации, окклюзионных контактов, коррекция. Обучение пациента правилам пользования протезом и уходу за ним.'); rec.push('Период адаптации к протезу. Чистить протез после еды. Коррекция через 1–2 дня или при натёртостях.'); }
    }
    if (r === 'implRem') {
      if (has('irPre')) t.push('Снятие оттисков альгинатным материалом с ' + jt + ' для изготовления индивидуальной ложки.');
      if (has('irImp')) t.push('Снятие формирователей десны. ' + (p.impM === 'scan' ? 'Установка скан-маркеров' + (p.mu ? ' на мультиюниты' : '') + ', цифровое сканирование внутриротовым 3D-сканером.' : 'Установка трансферов' + (p.mu ? ' на уровне мультиюнитов' : '') + ', снятие оттиска открытой индивидуальной ложкой А-силиконовым материалом.') + ' Установка формирователей десны.');
      if (has('bite')) t.push(BITE[p.biteM] || BITE.wax);
      if (has('irTry')) t.push('Примерка конструкции в полости рта: пассивная посадка, постановка зубов, окклюзионные контакты, эстетика. Коррекция.');
      if (has('irFix')) { t.push('Фиксация (наложение) конструкции на имплантатах ' + jt + '. Затягивание винтов с усилием ' + (p.torque || 30) + ' Н·см. Проверка окклюзионных контактов, коррекция. Обучение пациента уходу за конструкцией.'); rec.push('Тщательная гигиена в области имплантатов (ирригатор). Профессиональная гигиена и осмотр каждые 6 месяцев.'); }
    }
    const fin = list.some((s) => s.final);
    if (!fin) rec.push('Явка на следующий этап по записи.');
    const tempIn = r === 'fixed' && (has('imp') || has('fix') || has('bite')) && !has('prep');
    const F = pg.formula ? readFormula(pg.formula) : {};
    const dg = ['upper', 'lower'].map((j) => kennedy(j, F)).filter(Boolean);
    const code = pg.formula && !dg.length ? 'K08.8' : 'K08.1'; ORTHO_MKB = code;
    const kTxt = ['upper', 'lower'].map((j) => { const k = kennedy(j, F); return !k ? '' : k.full ? 'Полная вторичная адентия ' + JAW_RU[j] : 'Частичная вторичная адентия ' + JAW_RU[j] + ', ' + k.cls + ' класс по Кеннеди' + (k.mod ? ', ' + k.mod + ' подкласс' : ''); }).filter(Boolean);
    return {
      complaints: 'Жалоб нет.',
      anamnesisMorbi: 'Ортопедическое лечение по согласованному плану лечения.',
      statusLocalis: !tempIn && (X.blocks || []).find((x) => x.tpl === 'orthoStage') !== X.b ? '' : tempIn ? 'Временные коронки ' + tl + ' фиксированы, состоятельны. Слизистая оболочка десны в области опорных зубов без признаков воспаления.' : 'Слизистая оболочка полости рта бледно-розовая, без патологических изменений.',
      diagnosis: diagText(code, p.kennedy ? kTxt : [], T),
      treatment: t.join(' '),
      recommendations: rec.join(' '),
    };
  }

  const consTeeth = (pg) => { const F = pg && pg.formula ? readFormula(pg.formula) : {}; return Object.keys(F).filter((t) => F[t].some((k) => ['artificial_crown', 'temporary_crown', 'stump_crown', 'bridge_intermediate', 'construct_unremovable', 'indirect_restoration'].includes(k))); };
  const missTeeth = (pg) => { const F = pg && pg.formula ? readFormula(pg.formula) : {}; return Object.keys(F).filter((t) => isMissing(F[t])); };
  const cariesTeeth = (pg) => { const F = pg && pg.formula ? readFormula(pg.formula) : {}; return Object.keys(F).filter((t) => F[t].some((k) => /caries/.test(k))); };
  // зубы из выбранного плана → поля «Снимаем» и «Подготовка»; позиции плана без зубов — обязательны к заполнению
  function fillFromPlan(b) {
    const pg = b.pg || {}, plans = pg.plans || [], ids = b.params.plans || [];
    const main = ids.length > 1 ? [b.params.mainPlan || ids[0]] : ids;
    const items = planItems(plans, main), M = {}, T = {};
    const Q = {}; const add = (k, it) => { T[k] = T[k] || new Set(); (it.teeth || []).forEach((t) => T[k].add(String(t))); if (!(it.teeth || []).length) { M[k] = 1; Q[k] = (Q[k] || 0) + (+it.qty || 1); } };
    items.forEach((it) => { if (isRemoveItem(it)) add('remove', it); else if (isPostItem(it)) add('removePost', it); else { const k = prepKind(it); if (k) add(k, it); } });
    ['remove', 'removePost', 'prepExt', 'prepImp', 'prepCaries', 'prepEndo'].forEach((k) => {
      if (b.touched[k]) return;
      const v = T[k] ? [...T[k]].sort() : [];
      b.params[k] = v; if (v.length) b.auto[k] = 1; else delete b.auto[k];
    });
    b.params._post = !!T.removePost;
    b.miss = M; b.missQty = Q;
  }
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
        { key: 'xray', label: 'Рентген', type: 'toggle', default: false, show: (p) => p.visit === 'first', adv: true },
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
        { key: 'xray', label: 'Рентген', type: 'seg', options: [opt('', 'Нет'), opt('yes', 'Есть')], default: '', adv: true },
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
      id: 'surgery', title: 'Хирургическая операция', icon: '🔩', position: 'surgeon', order: 45, needTeeth: true,
      params: [
        { key: 'parts', label: 'Состав', type: 'chips', options: [opt('ext', 'Удаление зуба'), opt('imp', 'Имплантация'), opt('graft', 'Костная пластика'), opt('soft', 'Мягкие ткани'), opt('rem', 'Удаление имплантата')], default: ['imp'] },
        { key: 'access', label: 'Доступ', type: 'seg', options: [opt('flap', 'Разрез, лоскут'), opt('flapless', 'Трансгингивально')], default: 'flap' },
        { key: 'xray', label: 'КЛКТ в записи', type: 'toggle', default: false, adv: true },
        { key: 'guide', label: 'Хирургический шаблон', type: 'seg', options: [opt('', 'Нет'), opt('pilot', 'Пилотный / навигационный'), opt('full', 'Полный протокол')], default: '', show: (p) => has(p, 'imp') },
        { key: 'h1', label: 'Удаление зуба', type: 'heading', show: (p) => has(p, 'ext') },
        { key: 'extTeeth', label: 'Удаляемые зубы', type: 'teethSub', show: (p) => has(p, 'ext') },
        { key: 'extDiag', label: 'Диагноз зуба', type: 'select', options: EXT_DIAG, show: (p) => has(p, 'ext') },
        { key: 'extMethod', label: 'Удаление', type: 'seg', options: [opt('simple', 'Атравматичное'), opt('complex', 'С разъединением корней')], default: 'simple', show: (p) => has(p, 'ext') },
        { key: 'h2', label: 'Имплантация', type: 'heading', show: (p) => has(p, 'imp') },
        { key: 'impTeeth', label: 'Позиции имплантатов', type: 'teethSub', show: (p) => has(p, 'imp') },
        { key: 'imp', label: 'Имплантаты', type: 'perTooth', show: (p) => has(p, 'imp'), rowsFor: (b) => (b.params.impTeeth || []).slice().sort(), emptyHint: 'отметьте позиции имплантатов',
          init: (b, t) => ({ sys: (b.hints.sys && b.hints.sys[t]) || b.hints.sysDefault || b.params.sysDefault || 'osstem', d: '', l: '', tq: '30', lot: '' }),
          fields: [
            { key: 'sys', label: 'Система', options: () => Object.keys(IMPLANT_SYSTEMS).map((k) => ({ v: k, l: IMPLANT_SYSTEMS[k].name })) },
            { key: 'd', label: 'Диаметр', options: (r) => (r.sys && IMPLANT_SYSTEMS[r.sys] ? Object.keys(IMPLANT_SYSTEMS[r.sys].sizes).map((d) => ({ v: d, l: 'Ø ' + mm(d) })) : []) },
            { key: 'l', label: 'Длина', options: (r) => (r.sys && r.d && IMPLANT_SYSTEMS[r.sys] && IMPLANT_SYSTEMS[r.sys].sizes[r.d] ? IMPLANT_SYSTEMS[r.sys].sizes[r.d].map((l) => ({ v: String(l), l: mm(l) + ' мм' })) : []) },
            { key: 'tq', label: 'Торк', optional: true, options: () => ['15', '20', '25', '30', '35', '40', '45', '50'].map((x) => ({ v: x, l: x + ' Н·см' })) },
            { key: 'lot', label: 'LOT', type: 'text', optional: true, placeholder: 'необяз.' },
          ] },
        { key: 'supra', label: 'Супраструктура', type: 'seg', options: SUPRA_OPTS, optionsFn: (b) => SUPRA_OPTS.concat(b.params.supra === 'mixed' ? [opt('mixed', 'Разное по зубам (из услуг)')] : []), default: 'cover', show: (p) => has(p, 'imp') && !allMini(p) },
        { key: 'adentia', label: 'Адентия', type: 'seg', options: [opt('partial', 'Частичная'), opt('full', 'Полная')], default: 'partial', show: (p) => has(p, 'imp') && !has(p, 'ext'), adv: true },
        { key: 'h3', label: 'Костная пластика', type: 'heading', show: (p) => has(p, 'graft') },
        { key: 'methods', label: 'Метод пластики', type: 'chips', options: [opt('gbr', 'НКР'), opt('socket', 'Сохранение лунки'), opt('split', 'Расщепление гребня'), opt('sinusOpen', 'Открытый синус-лифтинг'), opt('sinusClosed', 'Закрытый синус-лифтинг')], default: [], show: (p) => has(p, 'graft') },
        { key: 'mats', label: 'Костный материал', type: 'chips', options: [opt('biooss', 'Bio-Oss'), opt('xeno', 'Xenograft'), opt('auto', 'Аутокость')], default: [], show: (p) => has(p, 'graft') },
        { key: 'xenoType', label: 'Xenograft', type: 'seg', options: [opt('Mineral'), opt('Cortical')], default: 'Mineral', show: (p) => has(p, 'graft') && (p.mats || []).includes('xeno') },
        { key: 'volBio', label: 'Объём Bio-Oss, см³', type: 'text', placeholder: 'напр. 0,5', show: (p) => has(p, 'graft') && (p.mats || []).includes('biooss') },
        { key: 'volXeno', label: 'Объём Xenograft, см³', type: 'text', placeholder: 'напр. 1,0', show: (p) => has(p, 'graft') && (p.mats || []).includes('xeno') },
        { key: 'autoM', label: 'Забор аутокости', type: 'seg', options: [opt('harvester', 'Харвестер', { t: 'костным харвестером' }), opt('scraper', 'Скребок', { t: 'костным скребком' }), opt('site', 'Из лунки / ложа', { t: 'из лунки и ложа имплантата' })], default: 'harvester', show: (p) => has(p, 'graft') && (p.mats || []).includes('auto') },
        { key: 'mems', label: 'Мембрана', type: 'chips', options: MEMBRANES.map((m) => opt(m.v, m.l)), default: [], show: (p) => has(p, 'graft') },
        { key: 'pins', label: 'Пины, шт.', type: 'number', default: 0, min: 0, max: 20, show: (p) => has(p, 'graft') },
        { key: 'screws', label: 'Винты, шт.', type: 'number', default: 0, min: 0, max: 20, show: (p) => has(p, 'graft') },
        { key: 'periost', label: 'Послабляющий разрез надкостницы', type: 'toggle', default: true, show: (p) => has(p, 'graft') && ['gbr', 'split', 'sinusOpen'].some((m) => (p.methods || []).includes(m)) && p.access === 'flap' },
        { key: 'splitTool', label: 'Расщепление', type: 'seg', options: [opt('дисками'), opt('пьезохирургическим аппаратом', 'Пьезо'), opt('остеотомами')], default: 'дисками', show: (p) => has(p, 'graft') && (p.methods || []).includes('split'), adv: true },
        { key: 'closedTool', label: 'Закрытый синус-лифтинг', type: 'seg', options: [opt('остеотомами', 'Остеотомы'), opt('крестальным набором', 'Крестальный набор')], default: 'остеотомами', show: (p) => has(p, 'graft') && (p.methods || []).includes('sinusClosed'), adv: true },
        { key: 'perf', label: 'Перфорация мембраны Шнайдера', type: 'seg', options: [opt('no', 'Нет'), opt('yes', 'Да')], default: 'no', show: (p) => has(p, 'graft') && sinus(p) },
        { key: 'perfCover', label: 'Перфорация укрыта', type: 'select', options: [opt('biogide', 'Bio-Gide'), opt('contur', 'Bioplate Contur'), opt('bioplast', 'Биопласт-Дент'), opt('prf', 'PRF-мембраной'), opt('', 'Не укрывалась')], default: 'biogide', show: (p) => has(p, 'graft') && sinus(p) && p.perf === 'yes' },
        { key: 'lotMat', label: 'LOT материала', type: 'text', placeholder: 'необязательно', show: (p) => has(p, 'graft') },
        { key: 'lotMem', label: 'LOT мембраны', type: 'text', placeholder: 'необязательно', show: (p) => has(p, 'graft') && (p.mems || []).length > 0 },
        { key: 'h4', label: 'Мягкие ткани', type: 'heading', show: (p) => has(p, 'soft') },
        { key: 'softM', label: 'Мягкие ткани', type: 'chips', options: [opt('sct', 'ССТ'), opt('gingivo', 'Гингивопластика')], default: [], show: (p) => has(p, 'soft') },
        { key: 'h5', label: 'Завершение и назначения', type: 'heading' },
        { key: 'prf', label: 'PRF', type: 'toggle', default: false },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: true },
        { key: 'sutMat', label: 'Шовный материал', type: 'seg', options: [opt('кетгут', 'Кетгут'), opt('еврокрил', 'Еврокрил'), opt('PTFE')], default: 'еврокрил', show: (p) => p.sutures },
        ...rxParams(() => true),
        { key: 'rxNasal', label: 'Сосудосуживающие капли', type: 'toggle', default: true, show: (p) => has(p, 'graft') && sinus(p) },
        { key: 'isol', label: 'Изоляция', type: 'seg', options: [opt('', 'Нет'), opt('ретрактором OptraGate', 'OptraGate')], default: '', adv: true },
        { key: 'sysDefault', label: 'Система по умолчанию', type: 'select', options: [opt('osstem', 'Osstem TSIII'), opt('dentium', 'Dentium SuperLine'), opt('anyridge', 'MegaGen AnyRidge'), opt('mini', 'Мини-имплантат')], default: 'osstem', adv: true },
      ],
      onTeeth: (b) => {
        if (has(b.params, 'imp') && !b.touched.impTeeth) b.params.impTeeth = (b.hints.impTeeth && b.hints.impTeeth.length ? b.hints.impTeeth : b.teeth).filter((t) => b.teeth.includes(t));
        if (has(b.params, 'ext') && !b.touched.extTeeth && !(b.params.extTeeth || []).length && b.hints.extTeeth) b.params.extTeeth = b.hints.extTeeth.filter((t) => b.teeth.includes(t));
      },
      onParam: (b, key) => {
        if (key === 'access' && !b.touched.sutures) b.params.sutures = b.params.access === 'flap';
        if (key === 'parts') {
          if (has(b.params, 'imp') && !(b.params.impTeeth || []).length) b.params.impTeeth = b.teeth.slice();
          if (has(b.params, 'ext') && !(b.params.extTeeth || []).length) b.params.extTeeth = b.teeth.slice();
        }
        if (key === 'sysDefault') Object.keys(b.params.imp || {}).forEach((t) => { const r = b.params.imp[t]; if (!r.d) r.sys = b.params.sysDefault; });
      },
      finalize: (b) => {
        const H = b.hints;
        if (H.impTeeth && H.impTeeth.length) { b.teeth = [...new Set(b.teeth.concat(H.impTeeth))].sort(); b.params.impTeeth = [...new Set(H.impTeeth)].sort(); }
        if (H.graftTeeth && H.graftTeeth.length) b.teeth = [...new Set(b.teeth.concat(H.graftTeeth))].sort();
        if (b.src === 'service' && !H.placed && !b.touched.parts) b.params.parts = (b.params.parts || []).filter((x) => x !== 'imp');
        if (has(b.params, 'imp') && !(b.params.impTeeth || []).length) b.params.impTeeth = b.teeth.slice();
        if (H.vol && H.vol.bio && !b.touched.volBio) { b.params.volBio = mm(H.vol.bio.toFixed(1)); b.auto.volBio = 1; }
        if (H.vol && H.vol.xeno && !b.touched.volXeno) { b.params.volXeno = mm(H.vol.xeno.toFixed(1)); b.auto.volXeno = 1; }
        if (H.pins) { b.params.pins = H.pins; b.auto.pins = 1; }
        if (H.screws) { b.params.screws = H.screws; b.auto.screws = 1; }
        if (b.params.prf && has(b.params, 'graft') && !(b.params.mems || []).includes('prf')) { b.params.mems = (b.params.mems || []).concat('prf'); b.auto.mems = 1; }
        if (has(b.params, 'graft') && !(b.params.methods || []).length) { b.params.methods = [has(b.params, 'ext') && !has(b.params, 'imp') ? 'socket' : 'gbr']; b.auto.methods = 1; }
        if (b.params.access === 'flapless' && !b.auto.sutures) b.params.sutures = false;
      },
      check: (b) => {
        const p = b.params, out = [];
        if (!(p.parts || []).length) out.push({ lvl: 'bad', text: 'Операция: выберите состав (удаление, имплантация, пластика…)' });
        if (has(p, 'ext') && !(p.extTeeth || []).length) out.push({ lvl: 'bad', text: 'Операция: отметьте удаляемые зубы' });
        if (has(p, 'imp')) {
          if (!(p.impTeeth || []).length) out.push({ lvl: 'bad', text: 'Операция: отметьте позиции имплантатов' });
          (p.impTeeth || []).forEach((t) => { const r = (p.imp || {})[t]; if (!r || !r.d || !r.l) out.push({ lvl: 'bad', text: 'Имплантат ' + fmtTooth(t) + ': укажите диаметр и длину' }); });
          if (b.hints.impQty && (p.impTeeth || []).length && b.hints.impQty !== p.impTeeth.length) out.push({ lvl: 'warn', text: 'Имплантатов по услугам ' + b.hints.impQty + ', отмечено ' + p.impTeeth.length });
        }
        if (has(p, 'graft')) {
          if (!(p.methods || []).length) out.push({ lvl: 'bad', text: 'Костная пластика: выберите метод' });
          if (!(p.mats || []).length) out.push({ lvl: 'warn', text: 'Костная пластика: не выбран костный материал' });
          if ((p.methods || []).includes('socket') && !has(p, 'ext')) out.push({ lvl: 'warn', text: 'Сохранение лунки без удаления зуба в составе операции' });
        }
        return out;
      },
      mkb: (p, P) => (has(p, 'ext') ? P.extDiag.mkb : has(p, 'imp') || has(p, 'rem') ? K081 : K082),
      fields: (p, T, P, X) => surgeryText(p, T, P, X),
    },

    {
      id: 'fdm', title: 'ФДМ / 2 этап', icon: '🪛', position: 'surgeon', order: 46, needTeeth: true,
      params: [
        { key: 'action', label: 'Устанавливаем', type: 'seg', options: FDM_ACTS, default: 'healing', show: (p) => !p.mix },
        { key: 'mix', label: 'Разное по зубам', type: 'toggle', default: false },
        { key: 'acts', label: 'Что установлено на каждом имплантате', type: 'perTooth', show: (p) => p.mix, rowsFor: (b) => b.teeth.slice().sort(),
          init: (b, t) => ({ a: (b.hints.act || {})[t] || b.params.action }), fields: [{ key: 'a', label: 'Установлено', options: () => FDM_ACTS }] },
        { key: 'access', label: 'Доступ', type: 'seg', options: [opt('incision', 'Разрез над имплантатом'), opt('punch', 'Мукотом (панч)'), opt('flap', 'Лоскут')], default: 'incision', show: (p) => p.action === 'healing' || p.mix },
        { key: 'remove', label: 'Снятие', type: 'chips', options: [opt('mesh', 'Титановая сетка'), opt('ptfe', 'Нерезорб. мембрана'), opt('screws', 'Винты / пины')], default: [] },
        { key: 'softM', label: 'Мягкие ткани', type: 'chips', options: [opt('sct', 'ССТ'), opt('gingivo', 'Гингивопластика')], default: [] },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false },
        { key: 'sutMat', label: 'Шовный материал', type: 'seg', options: [opt('кетгут', 'Кетгут'), opt('еврокрил', 'Еврокрил'), opt('PTFE')], default: 'еврокрил', show: (p) => p.sutures },
      ],
      onParam: (b, key) => { if ((key === 'remove' || key === 'softM') && ((b.params.remove || []).length || (b.params.softM || []).length) && !b.touched.sutures) b.params.sutures = true; },
      finalize: (b) => {
        if (((b.params.remove || []).length || (b.params.softM || []).length) && !b.auto.sutures) b.params.sutures = true;
        // по услугам на разных зубах стоит разное → «Разное по зубам»
        const kinds = [...new Set(Object.values(b.hints.act || {}))];
        if (kinds.length > 1 && !b.touched.mix) { b.params.mix = true; b.auto.mix = 1; b.params.acts = {}; }
        else if (kinds.length === 1) b.params.action = kinds[0];
      },
      check: (b) => (b.params.mix && b.teeth.some((t) => { const r = (b.params.acts || {})[t]; return r && !r.a; }) ? [{ lvl: 'bad', text: 'ФДМ / 2 этап: укажите, что установлено на каждом имплантате' }] : []),
      mkb: () => K081,
      fields: (p, T, P, X) => {
        const teeth = ((X && X.b && X.b.teeth) || []).slice().sort(), map = {};
        Object.keys(p.acts || {}).forEach((t) => { if ((p.acts[t] || {}).a) map[t] = p.acts[t].a; });
        const G = p.mix ? supraGroups(teeth, map, p.action) : [[p.action, teeth]];
        const where = (tt) => (p.mix && G.length > 1 ? ' в области ' + tgen(tt) : '');
        const heal = G.filter((g) => g[0] === 'healing'), onlyHeal = G.every((g) => g[0] === 'healing'), many = T.list.indexOf(',') > 0, t = [];
        const rm = p.remove || [], sm = p.softM || [];
        const open = rm.length || sm.length || ((heal.length || !teeth.length) && p.access === 'flap');
        if (open) t.push('Разрез, отслаивание слизисто-надкостничного лоскута в области ' + T.gen + '.');
        else if (heal.length) { const hT = heal[0][1], hm = hT.length > 1, at = G.length > 1 ? ' в области ' + tgen(hT) : ' в области ' + T.gen;
          t.push(p.access === 'punch' ? 'Иссечение слизистой оболочки над ' + (hm ? 'имплантатами' : 'имплантатом') + (G.length > 1 ? at : '') + ' мукотомом.' : 'Разрез слизистой оболочки над ' + (hm ? 'имплантатами' : 'имплантатом') + at + '.'); }
        if (rm.includes('mesh')) t.push('Удаление титановой сетки.');
        if (rm.includes('ptfe')) t.push('Удаление нерезорбируемой мембраны.');
        if (rm.includes('screws')) t.push('Удаление фиксирующих винтов (пинов).');
        if (rm.length) t.push('Оценка регенерата: костная ткань сформирована.');
        G.forEach(([a, tt]) => {
          const n = (tt.length || (many ? 2 : 1)) > 1;
          if (a === 'healing') t.push('Удаление ' + (n ? 'винтов-заглушек' : 'винта-заглушки') + ', установка ' + SUPRA.healing[n ? 3 : 2] + where(tt) + '.');
          else t.push('Снятие ' + (n ? 'формирователей' : 'формирователя') + ' десны, установка ' + SUPRA[a][n ? 3 : 2] + where(tt) + (a === 'std' || a === 'mu' ? ', фиксация винтом' : '') + (a === 'tempCrown' ? ', фиксация временной коронки, выведена из окклюзии' : '') + '.');
        });
        softText(sm, T).forEach((x) => t.push(x));
        if (p.sutures) t.push((open ? 'Лоскут уложен, наложены швы' : 'Наложены швы') + ' (' + p.sutMat + ').');
        if (open || p.sutures) t.push('Гемостаз достигнут.');
        const tempOnly = G.every((g) => g[0] === 'temp' || g[0] === 'tempCrown');
        const r = ['Тщательная гигиена полости рта, аккуратная чистка в области ' + (onlyHeal ? 'формирователей' : tempOnly ? 'временных конструкций' : 'имплантатов') + '.'];
        if (open) r.push('Холод на область вмешательства в первые часы, исключить горячую и твёрдую пищу.');
        if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 10–14 дней.');
        if (G.some((g) => g[0] === 'tempCrown')) r.push('Не нагружать временную коронку, пища мягкой консистенции.');
        r.push(onlyHeal ? 'Явка на ортопедический этап через 2–3 недели.' : 'Явка на следующий ортопедический этап по записи.');
        return {
          complaints: 'Жалоб нет. Явился для установки ' + andJoin(G.map(([a, tt]) => SUPRA[a][(tt.length || (many ? 2 : 1)) > 1 ? 3 : 2])) + '.',
          anamnesisMorbi: 'Ранее в области ' + T.gen + ' установлен(ы) дентальные имплантаты' + (rm.length ? ' с направленной костной регенерацией' : '') + '. Период остеоинтеграции завершён.',
          statusLocalis: 'Слизистая оболочка в области ' + T.gen + ' бледно-розовая, без признаков воспаления.' + (sm.length ? ' Недостаточный объём мягких тканей в области ' + T.gen + '.' : ''),
          diagnosis: 'Частичная вторичная адентия: отсутствие ' + T.gen + ', K08.1.',
          treatment: t.join(' '),
          recommendations: r.join(' '),
        };
      },
    },

    {
      id: 'soft', title: 'Мягкие ткани', icon: '🩹', position: 'surgeon', order: 47, needTeeth: true,
      params: [
        { key: 'softM', label: 'Вмешательство', type: 'chips', options: [opt('gingivo', 'Гингивопластика'), opt('sct', 'ССТ у имплантата'), opt('diathermo', 'Диатермокоагуляция сосочка'), opt('crownLen', 'Удлинение коронки')], default: [] },
        { key: 'diag', label: 'Диагноз', type: 'select', options: [
          opt('K06.1', 'K06.1 Гипертрофия десны', { mkb: ['K06.1', 'K06.1 Гипертрофия десны'], name: 'Гипертрофия десны' }),
          opt('K06.0', 'K06.0 Рецессия десны', { mkb: ['K06.0', 'K06.0 Рецессия десны'], name: 'Рецессия десны' }),
          opt('K08.1', 'K08.1 Вторичная адентия (у имплантата)', { mkb: ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни'], name: 'Частичная вторичная адентия, дефицит мягких тканей' }),
          opt('K08.8', 'K08.8 Другие изменения зубов', { mkb: ['K08.8', 'K08.8 Другие уточненные изменения зубов и их опорного аппарата'], name: 'Недостаточная высота клинической коронки' }),
        ], default: 'K06.1' },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false },
        { key: 'sutMat', label: 'Шовный материал', type: 'seg', options: [opt('кетгут', 'Кетгут'), opt('еврокрил', 'Еврокрил'), opt('PTFE')], default: 'еврокрил', show: (p) => p.sutures },
      ],
      finalize: (b) => {
        const m = b.params.softM || [];
        if (!b.auto.diag) { if (m.includes('sct')) b.params.diag = 'K08.1'; else if (m.includes('crownLen')) b.params.diag = 'K08.8'; }
        if ((m.includes('sct') || m.includes('gingivo') || m.includes('crownLen')) && !b.auto.sutures) b.params.sutures = true;
      },
      onParam: (b, key) => { if (key === 'softM' && !b.touched.sutures) b.params.sutures = (b.params.softM || []).some((x) => x !== 'diathermo'); },
      mkb: (p, P) => P.diag.mkb,
      fields: (p, T, P) => {
        const m = p.softM || [], t = softText(m, T);
        if (m.includes('diathermo')) t.push('Диатермокоагуляция гипертрофированного десневого сосочка в области ' + T.gen + '.');
        if (m.includes('crownLen')) t.push('Удлинение клинической коронки ' + T.gen + ': гингивэктомия, отслаивание лоскута, остеотомия и остеопластика по показаниям с восстановлением биологической ширины.');
        if (p.sutures) t.push('Наложены швы (' + p.sutMat + ').');
        t.push('Гемостаз достигнут.');
        const r = ['Не принимать пищу 2 часа, исключить горячую, острую и твёрдую пищу в течение 3 дней.', 'Не чистить щёткой область вмешательства до снятия швов, ротовые ванночки антисептиком.'];
        if (m.includes('sct')) r.push('Возможен дискомфорт в области нёба (донорская зона).');
        if (p.sutures && p.sutMat !== 'кетгут') r.push('Снятие швов через 10–14 дней.');
        r.push('При кровотечении или нарастании отёка — обратиться в клинику.');
        return {
          complaints: m.includes('crownLen') ? 'Направлен на удлинение клинической коронки ' + T.gen + ' перед ортопедическим лечением.'
            : m.includes('diathermo') ? 'Жалобы на разрастание и кровоточивость десны в области ' + T.gen + '.' : 'Жалобы на эстетический дефект десны в области ' + T.gen + '.',
          statusLocalis: { K06_1: 'Десневой край в области ' + T.gen + ' гипертрофирован, гиперемирован, кровоточит при зондировании.' }[p.diag.replace('.', '_')] ||
            (p.diag === 'K06.0' ? 'Рецессия десны в области ' + T.gen + '.' : p.diag === 'K08.1' ? 'Дефицит объёма мягких тканей в области имплантата ' + T.gen + '.' : 'Недостаточная высота клинической коронки ' + T.gen + ' для ортопедического лечения.'),
          diagnosis: P.diag.name + ' в области ' + T.gen + ', ' + P.diag.mkb[0] + '.',
          treatment: t.join(' '),
          recommendations: r.join(' '),
        };
      },
    },

    {
      id: 'postop', title: 'Послеоперационный осмотр', icon: '🩺', position: 'surgeon', order: 48, teethOptional: true,
      params: [
        { key: 'state', label: 'Состояние', type: 'seg', options: [opt('ok', 'Без особенностей'), opt('edema', 'Умеренный отёк')], default: 'ok' },
        { key: 'op', label: 'После операции', type: 'text', default: '', placeholder: 'например: удаления зуба' },
        { key: 'opDate', label: 'Дата операции', type: 'text', default: '', placeholder: 'дд.мм.гггг', adv: true },
        { key: 'sutOut', label: 'Снятие швов', type: 'toggle', default: true },
        { key: 'diag', label: 'Диагноз', type: 'select', options: [
          opt('Z48.8', 'Z48.8 Послеоперационное наблюдение', { mkb: ['Z48.8', 'Z48.8 Другой уточненный последующий хирургический уход'], name: 'Послеоперационное наблюдение' }),
          opt('K08.1', 'K08.1 Вторичная адентия', { mkb: ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни'], name: 'Частичная вторичная адентия' }),
          opt('K08.2', 'K08.2 Атрофия альвеолярного края', { mkb: ['K08.2', 'K08.2 Атрофия беззубого альвеолярного края'], name: 'Атрофия беззубого альвеолярного края' }),
        ], default: 'Z48.8' },
      ],
      mkb: (p, P) => P.diag.mkb,
      fields: (p, T, P) => {
        const at = T.has ? ' в области ' + T.gen : '';
        return {
          complaints: (p.state === 'ok' ? 'Жалоб нет.' : 'Жалобы на умеренный отёк в области вмешательства.') + ' Явился на контрольный осмотр после ' + (String(p.op || '').trim() || 'операции') + (String(p.opDate || '').trim() ? ' от ' + String(p.opDate).trim() : '') + '.',
          statusLocalis: 'Послеоперационная область' + at + (p.state === 'ok' ? ' без признаков воспаления, заживление первичным натяжением.' : ': умеренный отёк мягких тканей, без признаков нагноения, заживление первичным натяжением.') + ' Швы состоятельны.',
          diagnosis: P.diag.name + at + ', ' + P.diag.mkb[0] + '.',
          treatment: 'Осмотр послеоперационной области' + at + ', антисептическая обработка.' + (p.sutOut ? ' Снятие швов.' : ''),
          recommendations: 'Тщательная гигиена полости рта.' + (p.state === 'edema' ? ' Продолжить назначенное лечение, холод при отёке.' : '') + ' Явка по записи на следующий этап лечения.',
        };
      },
    },
    {
      id: 'orthoConsult', title: 'Ортопедия: консультация', icon: '💬', position: 'orthopedist', order: 49,
      params: [
        { key: 'why', label: 'Почему этот блок', type: 'note', text: (b, pg) => esc2(orthoPlanState(pg).why) },
        { key: 'fNote', label: 'Формула SQNS', type: 'note', text: (b, pg) => {
          if (!pg || !pg.formula) return 'Формула не заполнена — статус будет общими словами.';
          const F = readFormula(pg.formula), d = formulaText(F, pg.formula);
          const parts = d.status.concat(d.constructions.length ? ['Конструкции: ' + d.constructions.join('; ') + '.'] : []);
          return parts.length ? parts.map(esc2).join('<br>') : 'В формуле нет отметок.';
        } },
        { key: 'complaints', label: 'Жалобы', type: 'chips', options: [opt('chew', 'Затруднённое жевание'), opt('aesth', 'Эстетика'), opt('missing', 'Отсутствие зубов'), opt('broken', 'Разрушение зубов'), opt('old', 'Несостоятельность конструкций'), opt('removable', 'Неудобство съёмного протеза')], default: ['missing'] },
        { key: 'useFormula', label: 'Статус из формулы', type: 'toggle', default: true },
        { key: 'need', label: 'Протезирование', type: 'seg', options: [opt('yes', 'Нуждается'), opt('no', 'Не нуждается')], default: 'yes' },
        { key: 'needs', label: 'Уточнить (необязательно)', type: 'chips', options: [opt('fixed', 'Несъёмное'), opt('implant', 'На имплантатах'), opt('removable', 'Съёмное'), opt('replace', 'Замена конструкций')], default: [], show: (p) => p.need === 'yes' },
        { key: 'extra', label: 'Дополнительно', type: 'chips', options: [opt('sanation', 'Предварительная санация'), opt('surgeon', 'Консультация хирурга')], default: [], show: (p) => p.need === 'yes' },
        { key: 'diag', label: 'Диагноз', type: 'seg', options: [opt('auto', 'По формуле'), opt('partial', 'K08.1 частичная'), opt('full', 'K08.1 полная'), opt('crowns', 'K08.8 коронки')], default: 'auto' },
        { key: 'kennedy', label: 'Уточнение (Кеннеди)', type: 'toggle', default: true, adv: true },
      ],
      mkb: () => (ORTHO_MKB === 'K08.8' ? ['K08.8', 'K08.8 Другие уточненные изменения зубов и их опорного аппарата'] : ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни']),
      fields: (p, T, P, X) => {
        const pg = X.page || {}, f = pg.formula, F = f ? readFormula(f) : {}, d = formulaText(F, f);
        const C = { chew: 'затруднённое пережёвывание пищи', aesth: 'эстетический дефект', missing: 'отсутствие зубов', broken: 'разрушение зубов', old: 'несостоятельность имеющихся ортопедических конструкций', removable: 'неудобство пользования съёмным протезом' };
        const compl = (p.complaints || []).map((k) => C[k]).filter(Boolean);
        const kU = kennedy('upper', F), kL = kennedy('lower', F);
        const kTxt = (k, jaw) => !k ? '' : k.full ? 'Полная вторичная адентия ' + JAW_RU[jaw] : 'Частичная вторичная адентия ' + JAW_RU[jaw] + ', ' + k.cls + ' класс по Кеннеди' + (k.mod ? ', ' + k.mod + ' подкласс' : '');
        const dgF = [kTxt(kU, 'upper'), kTxt(kL, 'lower')].filter(Boolean);
        ORTHO_MKB = p.diag === 'crowns' || (p.diag === 'auto' && f && !dgF.length) ? 'K08.8' : 'K08.1';
        const kenn = p.diag === 'auto' ? dgF : p.diag === 'full' ? ['Полная вторичная адентия'] : p.diag === 'partial' ? ['Частичная вторичная адентия'] : [];
        const diag = diagText(ORTHO_MKB, p.kennedy ? kenn : [], []);
        const st = [];
        if (p.useFormula && f && (d.status.length || d.constructions.length)) { st.push(...d.status); if (d.constructions.length) st.push('Имеющиеся конструкции: ' + d.constructions.join('; ') + '.'); }
        else st.push('Дефекты зубных рядов.');
        const N = { fixed: 'несъёмное', implant: 'с опорой на имплантаты', removable: 'съёмное', replace: 'с заменой несостоятельных конструкций' };
        const needs = (p.needs || []).map((k) => N[k]).filter(Boolean), ex = p.need === 'yes' ? (p.extra || []) : [];
        const needTxt = p.need === 'no' ? ' В ортопедическом лечении на данный момент не нуждается.' :
          ' Пациент нуждается в протезировании' + (needs.length ? ' (' + needs.join(', ') + ')' : '') + '.' +
          (ex.includes('sanation') ? ' Необходима предварительная санация полости рта.' : '') + (ex.includes('surgeon') ? ' Рекомендована консультация хирурга по вопросу имплантации.' : '');
        return {
          complaints: 'Жалобы на ' + (compl.length ? compl.join(', ') : '___') + '.',
          statusLocalis: st.join(' '),
          diagnosis: diag,
          treatment: 'Консультация врача-стоматолога-ортопеда. Проведён осмотр полости рта.' + needTxt +
            (p.need === 'no' ? '' : ' Пациенту разъяснены возможные варианты лечения, их сроки и ориентировочная стоимость.'),
          recommendations: p.need === 'no' ? 'Профилактический осмотр через 6 месяцев.' : 'Повторная консультация для составления и согласования плана лечения.' + (ex.includes('sanation') ? ' Санация полости рта.' : ''),
        };
      },
    },
    {
      id: 'orthoExam', title: 'Ортопедия: обследование и план', icon: '🦷', position: 'orthopedist', order: 50,
      params: [
        { key: 'why', label: 'Почему этот блок', type: 'note', text: (b, pg) => esc2(orthoPlanState(pg).why) },
        { key: 'fNote', label: 'Формула SQNS', type: 'note', text: (b, pg) => {
          if (!pg || !pg.formula) return '⚠️ Формула не найдена на странице — откройте визит пациента.';
          const F = readFormula(pg.formula), d = formulaText(F, pg.formula);
          const parts = d.status.concat(d.constructions.length ? ['Конструкции: ' + d.constructions.join('; ') + '.'] : []).concat(d.other.length ? ['Прочее: ' + d.other.join('; ') + '.'] : []);
          const kt = (k) => (!k ? '—' : k.full ? 'полная адентия' : k.cls + (k.mod ? ', подкласс ' + k.mod : ''));
          const kU = kennedy('upper', F), kL = kennedy('lower', F);
          if (kU || kL) parts.push('Кеннеди: в/ч ' + kt(kU) + '; н/ч ' + kt(kL));
          return parts.length ? parts.map(esc2).join('<br>') : 'В формуле нет отметок.';
        } },
        { key: 'complaints', label: 'Жалобы', type: 'chips', options: [opt('chew', 'Затруднённое жевание'), opt('aesth', 'Эстетика'), opt('missing', 'Отсутствие зубов'), opt('broken', 'Разрушение зубов'), opt('old', 'Несостоятельность конструкций'), opt('removable', 'Неудобство съёмного протеза')], default: ['chew'] },
        { key: 'prev', label: 'Ранее протезирование', type: 'seg', options: [opt('auto', 'По формуле'), opt('yes', 'Проводилось'), opt('no', 'Не проводилось')], default: 'auto' },
        { key: 'bite', label: 'Прикус', type: 'select', options: [opt('ортогнатический'), opt('прямой'), opt('глубокий'), opt('прогнатический'), opt('прогенический'), opt('перекрёстный'), opt('открытый'), opt('без фиксированной межальвеолярной высоты', 'Без фиксированной высоты')] },
        { key: 'tmj', label: 'ВНЧС', type: 'seg', options: [opt('ok', 'Без особенностей'), opt('click', 'Щелчок'), opt('pain', 'Болезненность')], default: 'ok' },
        { key: 'mucosa', label: 'Слизистая протезного ложа', type: 'seg', options: [opt('ok', 'Без патологии'), opt('atrophy', 'Атрофия гребня'), opt('inflam', 'Воспаление')], default: 'ok' },
        { key: 'xray', label: 'Рентген / КЛКТ', type: 'toggle', default: false },
        { key: 'remU', autoText: 'по формуле', label: 'Съёмный протез в/ч', type: 'seg', options: [opt('', 'Нет'), opt('keep', 'Есть, оставляем'), opt('replace', 'Есть, заменяем')], default: '', adv: true },
        { key: 'remL', autoText: 'по формуле', label: 'Съёмный протез н/ч', type: 'seg', options: [opt('', 'Нет'), opt('keep', 'Есть, оставляем'), opt('replace', 'Есть, заменяем')], default: '', adv: true },
        { key: 'h1', label: 'План лечения', type: 'heading' },
        { key: 'plans', autoText: 'из плана', label: 'Планы SQNS', type: 'chips', emptyHint: 'планов лечения у пациента нет', optionsFn: (b, pg) => ((pg && pg.plans) || []).map((p) => opt(String(p.id), (p.title || 'План') + ' · ' + String(p.date || '').slice(0, 10).split('-').reverse().join('.') + (p.applied ? ' · применён' : ''))) },
        { key: 'mainPlan', label: 'Принятый вариант', type: 'select', optionsFn: (b, pg) => ((pg && pg.plans) || []).filter((p) => (b.params.plans || []).includes(String(p.id))).map((p) => opt(String(p.id), p.title || 'План')), show: (p) => (p.plans || []).length > 1 },
        { key: 'variants', label: 'Остальные — как варианты', type: 'toggle', default: true, show: (p) => (p.plans || []).length > 1 },
        { key: 'remove', autoText: 'из плана', label: 'Снимаем конструкции (несостоятельны)', type: 'toothSet', hl: (b, pg) => consTeeth(pg), hlText: 'конструкции в формуле', need: (b) => !!(b.miss || {}).remove, needText: 'снятие в плане без зубов — укажите' },
        { key: 'removePost', autoText: 'из плана', label: 'Извлекаем штифты / вкладки', type: 'toothSet', hl: (b, pg) => consTeeth(pg), hlText: 'конструкции в формуле', show: (p) => !!p._post, need: (b) => !!(b.miss || {}).removePost, needText: 'в плане без зубов — укажите' },
        { key: 'h2', label: 'Подготовка', type: 'heading' },
        { key: 'prepExt', autoText: 'из плана', label: 'Хирургия: удаление', type: 'toothSet', need: (b) => !!(b.miss || {}).prepExt, needText: 'в плане без зубов — укажите' },
        { key: 'prepImp', autoText: 'из плана', label: 'Хирургия: имплантация', type: 'toothSet', hl: (b, pg) => missTeeth(pg), hlText: 'отсутствующие зубы', need: (b) => !!(b.miss || {}).prepImp, needText: 'в плане без зубов — укажите' },
        { key: 'prepSurgText', label: 'Хирургия: прочее', type: 'text', placeholder: 'например: удаление экзостозов в области 3.4–3.6' },
        { key: 'prepCaries', autoText: 'из плана', label: 'Терапия: лечение кариеса', type: 'toothSet', hl: (b, pg) => cariesTeeth(pg), hlText: 'кариес в формуле', need: (b) => !!(b.miss || {}).prepCaries, needText: 'в плане без зубов — укажите' },
        { key: 'prepEndo', autoText: 'из плана', label: 'Терапия: эндодонтия', type: 'toothSet', need: (b) => !!(b.miss || {}).prepEndo, needText: 'в плане без зубов — укажите' },
        { key: 'prepTherText', label: 'Терапия: прочее', type: 'text', placeholder: 'например: профессиональная гигиена' },
        { key: 'diag', label: 'Диагноз', type: 'seg', options: [opt('auto', 'По формуле'), opt('K08.1', 'K08.1 адентия'), opt('K08.8', 'K08.8 коронки')], default: 'auto', adv: true },
        { key: 'kennedy', label: 'Уточнение (Кеннеди)', type: 'toggle', default: true, adv: true },
      ],
      init: (b, pg) => {
        b.pg = pg;
        const pl = (pg && pg.plans) || [];
        if (pl.length) {
          const applied = pl.filter((p) => p.applied); const pick = (applied.length ? applied : [pl.slice().sort((a, c) => String(c.date).localeCompare(String(a.date)))[0]]);
          b.params.plans = pick.map((p) => String(p.id)); b.params.mainPlan = b.params.plans[0]; b.auto.plans = 1;
        }
        const F = pg && pg.formula ? readFormula(pg.formula) : {};
        const hasU = Object.keys(F).some((t) => /^[12]/.test(t) && F[t].includes('construct_removable')), hasL = Object.keys(F).some((t) => /^[34]/.test(t) && F[t].includes('construct_removable'));
        if (hasU) { b.params.remU = 'keep'; b.auto.remU = 1; } if (hasL) { b.params.remL = 'keep'; b.auto.remL = 1; }
        fillFromPlan(b);
      },
      onParam: (b, key) => { if (key === 'plans' || key === 'mainPlan') fillFromPlan(b); },
      check: (b, blocks, pg) => {
        const out = [];
        if (!(pg && pg.formula)) out.push({ lvl: 'warn', text: 'Ортопедия: формула SQNS не найдена — статус зубов не будет заполнен' });
        const selP = ((pg && pg.plans) || []).filter((x) => (b.params.plans || []).includes(String(x.id)));
        if (selP.some((x) => !(x.treatmentPlanItems || []).length)) out.push({ lvl: 'bad', text: 'Состав плана не загружен: откройте план в разделе «План лечения», закройте его и нажмите ↻ вверху панели' });
        const M = b.miss || {}, L = { remove: 'снятие конструкций', removePost: 'извлечение штифтов / вкладок', prepExt: 'удаление', prepImp: 'имплантация', prepCaries: 'лечение кариеса', prepEndo: 'эндодонтия' };
        Object.keys(L).forEach((k) => { const n = (b.params[k] || []).length, q = (b.missQty || {})[k] || 0;
          if (M[k] && !n) out.push({ lvl: 'bad', text: 'План: ' + L[k] + ' без зубов — укажите зубы в блоке «Ортопедия»' });
          else if (M[k] && q > n) out.push({ lvl: 'warn', text: 'План: ' + L[k] + ' — в плане ' + q + ' шт., указано зубов ' + n }); });
        return out;
      },
      mkb: () => (ORTHO_MKB === 'K08.8' ? ['K08.8', 'K08.8 Другие уточненные изменения зубов и их опорного аппарата'] : ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни']),
      fields: (p, T, P, X) => orthoExamText(p, X),
    },

    {
      id: 'orthoStage', title: 'Ортопедия: этап', icon: '🔧', position: 'orthopedist', order: 51,
      params: [
        { key: 'why', label: 'Ход лечения', type: 'note', text: (b, pg) => stageWhy(b, pg) },
        { key: 'route', autoText: 'из плана', label: 'Конструкция', type: 'select', options: ROUTE_ORDER.map((r) => opt(r, ROUTES[r].title)) },
        { key: 'stages', autoText: 'следующий по истории', label: 'Этапы визита', type: 'chips', optionsFn: (b, pg) => { const S = routeStatus(b.params.route, pg); return S.list.map((s) => opt(s.id, (S.done[s.id] ? '✓ ' : '') + s.t.charAt(0).toUpperCase() + s.t.slice(1))); } },
        { key: 'teeth', autoText: 'из плана', label: 'Зубы', type: 'toothSet', show: (p) => ['fixed', 'implant', 'veneer'].includes(p.route), need: () => true, needText: 'укажите зубы' },
        { key: 'jaw', label: 'Челюсть', type: 'chips', options: [opt('upper', 'Верхняя'), opt('lower', 'Нижняя')], show: (p) => ['removable', 'complete', 'implRem'].includes(p.route) },
        { key: 'remTeeth', label: 'Снимаем с зубов', type: 'toothSet', show: (p) => (p.stages || []).includes('remove'), need: () => true, needText: 'укажите зубы' },
        { key: 'postTeeth', label: 'Вкладки / штифты', type: 'toothSet', show: (p) => (p.stages || []).some((x) => ['postLab', 'postFix', 'fiber'].includes(x)) },
        { key: 'postM', label: 'Вкладка', type: 'seg', options: [opt('lab', 'Лабораторная (оттиск)'), opt('direct', 'Прямой метод')], show: (p) => (p.stages || []).includes('postLab') },
        { key: 'postCem', label: 'Цемент вкладки', type: 'seg', options: [opt('gic', 'СИЦ'), opt('rmgi', 'RMGI')], default: 'gic', show: (p) => (p.stages || []).includes('postFix') },
        { key: 'tempImpM', autoText: 'из плана', label: 'Под временные', type: 'seg', options: [opt('alg', 'Альгинат'), opt('scan', 'Скан')], default: 'alg', show: (p) => (p.stages || []).includes('tempImp') },
        { key: 'temp', autoText: 'из плана', label: 'Временные коронки', type: 'seg', options: [opt('lab', 'Лабораторные'), opt('chair', 'В полости рта')], show: (p) => (p.stages || []).includes('prep') },
        { key: 'impM', autoText: 'из плана', label: 'Оттиск', type: 'seg', options: [opt('sil', 'А-силикон'), opt('scan', 'Скан')], show: (p) => (p.stages || []).some((x) => ['imp', 'iImp', 'vDiag', 'vPrep', 'irImp'].includes(x)) },
        { key: 'mu', label: 'С уровня мультиюнитов', type: 'toggle', default: false, show: (p) => (p.stages || []).some((x) => ['iImp', 'irImp'].includes(x)) },
        { key: 'shade', label: 'Цвет', type: 'text', placeholder: 'например: A2', show: (p) => (p.stages || []).some((x) => ['imp', 'iImp', 'vPrep'].includes(x)) },
        { key: 'rImpM', label: 'Оттискной материал', type: 'seg', options: [opt('alg', 'Альгинат'), opt('csil', 'С-силикон'), opt('asil', 'А-силикон')], default: 'alg', show: (p) => (p.stages || []).includes('rImp') },
        { key: 'cImpM', label: 'Функц. оттиск', type: 'seg', options: [opt('csil', 'С-силикон'), opt('asil', 'А-силикон')], default: 'csil', show: (p) => (p.stages || []).includes('cImp') },
        { key: 'biteM', autoText: 'по формуле', label: 'Прикус', type: 'seg', options: [opt('wax', 'Восковые валики'), opt('sil', 'Силиконовый регистрат')], show: (p) => (p.stages || []).includes('bite') },
        { key: 'cem', autoText: 'из плана', label: 'Цемент', type: 'select', options: [opt('gic', 'Стеклоиономерный'), opt('rmgi', 'СИЦ, модифицированный смолой (RMGI)'), opt('comp', 'Композитный двойного отверждения')], show: (p) => (p.stages || []).includes('fix') || ((p.stages || []).includes('iFix') && p.fixT === 'cem') },
        { key: 'fixT', autoText: 'из плана', label: 'Фиксация', type: 'seg', options: [opt('screw', 'Винтовая'), opt('cem', 'Цементная')], show: (p) => (p.stages || []).includes('iFix') },
        { key: 'torque', label: 'Торк, Н·см', type: 'number', default: 30, min: 10, max: 45, show: (p) => (p.stages || []).some((x) => ['iFix', 'irFix'].includes(x)) },
        { key: 'tempV', label: 'Временные виниры', type: 'toggle', default: false, show: (p) => (p.stages || []).includes('vPrep') },
        { key: 'kennedy', label: 'Уточнение (Кеннеди) в диагнозе', type: 'toggle', default: false, adv: true },
      ],
      init: (b, pg) => stageInit(b, pg, null),
      onParam: (b, key) => { if (key === 'route') stageInit(b, b.pg || {}, b.params.route); },
      check: (b) => {
        const out = [], p = b.params;
        if (!(p.stages || []).length) out.push({ lvl: 'bad', text: 'Ортопедия: этап — не выбран ни один этап' });
        if (['fixed', 'implant', 'veneer'].includes(p.route) && !(p.teeth || []).length) out.push({ lvl: 'bad', text: 'Ортопедия: этап — не указаны зубы' });
        if ((p.stages || []).includes('remove') && !(p.remTeeth || []).length) out.push({ lvl: 'bad', text: 'Ортопедия: этап — укажите зубы, с которых снимаются конструкции' });
        return out;
      },
      mkb: () => (ORTHO_MKB === 'K08.8' ? ['K08.8', 'K08.8 Другие уточненные изменения зубов и их опорного аппарата'] : ['K08.1', 'K08.1 Потеря зубов вследствие несчастного случая, удаления или локальной периодонтальной болезни']),
      fields: (p, T, P, X) => stageFields(p, X),
    },

  ];

  function formulaMarks(f) { const F = readFormula(f); const ks = Object.keys(F); return { missing: ks.filter((t) => !isImplant(F[t]) && (F[t].includes('removed') || F[t].includes('bridge_intermediate'))), implant: ks.filter((t) => isImplant(F[t])) }; }
  globalThis.SQNSMZ_CONFIG = { continuations, formulaMarks, _test: { kennedy, readFormula, formulaText, planText }, postBuild, IMPLANT_SYSTEMS, POSITIONS, POSITION_BY_CODE, SERVICE_RULES, DEFAULT_DURATION, ADMISSION_CONDITION, DIAG_DEFAULTS, fmtTooth, TEMPLATES };
})();
