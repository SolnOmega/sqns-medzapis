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
  // сколько каналов указано в услугах (берётся максимум) — для сверки с отмеченными каналами
  const canalHint = (b, n) => { b.hints.count = Math.max(b.hints.count || 0, +n || 0); };
  const countFromName = (name) => (/четыр/i.test(name) ? 4 : /тр[её]х/i.test(name) ? 3 : /двух/i.test(name) ? 2 : 0);

  const SERVICE_RULES = [
    // изоляция и прокладки
    { code: 'A02.07.001', name: /optra/i,           mod: { tpl: ['caries', 'endo', 'hygiene'], key: 'isol', value: 'ретрактором OptraGate' }, label: 'Изоляция OptraGate' },
    { code: 'A02.07.001', name: /коффердам/i,       mod: { tpl: ['caries', 'endo'], key: 'isol', value: 'коффердамом' }, label: 'Изоляция коффердам' },
    { code: 'A16.07.002', name: /лечебн\S* прокладк/i,   mod: { tpl: ['caries', 'endoRestore'], key: 'liner', add: 'cal' }, label: 'Лечебная прокладка' },
    { code: 'A16.07.002', name: /изолирующ\S* прокладк/i, mod: { tpl: ['caries', 'endoRestore'], key: 'liner', add: 'gic' }, label: 'Изолирующая прокладка' },
    // профессиональная гигиена
    { code: 'A16.07.051', name: /менее 14/i, block: { tpl: 'hygiene', merge: true, mergeAll: true, params: { scope: 'partial' } }, label: 'Гигиена (менее 14 зубов)' },
    { code: 'A16.07.051', block: { tpl: 'hygiene', merge: true, mergeAll: true, params: { scope: 'full' } }, label: 'Гигиена (полный комплекс)' },
    { code: 'A22.07.002', block: { tpl: 'hygiene', merge: true, mergeAll: true, qtyIsTeeth: true, params: { scope: 'teeth' } }, label: 'Гигиена: УЗ в области зуба' },
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
      id: 'caries', title: 'Кариес', icon: '🦷', position: 'therapist', order: 20, triggers: ['A16.07.002'], needTeeth: true, qtyIsTeeth: true,
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
        { key: 'since', label: 'Беспокоит', type: 'select', options: [opt('нескольких дней'), opt('1–2 недель'), opt('месяца'), opt('нескольких месяцев'), opt('', 'Не беспокоит (санация)')], default: '1–2 недель' },
        { key: 'prev', label: 'Ранее', type: 'seg', options: [opt('no', 'Не лечен'), opt('lost', 'Пломба утрачена')], default: 'no' },
        { key: 'isol', label: 'Изоляция', type: 'select', options: [opt('', 'Нет'), opt('коффердамом', 'Коффердам'), opt('ретрактором OptraGate', 'OptraGate'), opt('ватными валиками и слюноотсосом', 'Ватные валики')], default: '' },
        { key: 'adhesive', label: 'Адгезив', type: 'select', options: ADHESIVES },
        { key: 'liner', label: 'Прокладка', type: 'chips', options: [
          opt('cal', 'Лечебная (Ca(OH)₂)', { text: 'Наложение лечебной прокладки на основе гидроксида кальция.' }),
          opt('gic', 'Изолирующая СИЦ', { text: 'Наложение изолирующей прокладки из стеклоиономерного цемента.' }),
          opt('flow', 'Изолирующая текучий', { text: 'Наложение изолирующей прокладки из текучего композита.' }),
        ], default: [] },
        { key: 'material', label: 'Материал', type: 'select', options: MATERIALS },
        { key: 'xray', label: 'Рентген', type: 'seg', options: [opt('', 'Нет'), opt('yes', 'Есть')], default: '' },
      ],
      mkb: (p, P) => P.depth.mkb,
      fields: (p, T, P) => {
        const surf = (p.surf && p.surf.length ? p.surf.join('-') : '___');
        const complaints = {
          enamel: 'Жалобы на наличие пигментированного пятна (эстетический дефект) ' + T.gen + '.',
          dentin: 'Жалобы на кратковременную боль от сладкого и холодного в области ' + T.gen + ', проходящую сразу после устранения раздражителя.',
          cement: 'Жалобы на кратковременную боль от холодного и при чистке зубов в пришеечной области ' + T.gen + '.',
        }[p.depth];
        const sl = p.depth === 'enamel'
          ? 'На ' + surf + ' поверхности ' + T.gen + ' дефект в пределах эмали с пигментированным дном. Зондирование безболезненно. Перкуссия безболезненна. Реакция на холод отсутствует.'
          : 'На ' + surf + ' поверхности ' + T.gen + ' кариозная полость в пределах ' + P.depth.word + ', выполненная размягчённым пигментированным дентином. ' +
            'Зондирование болезненно по эмалево-дентинной границе. Перкуссия безболезненна. Реакция на холод кратковременная, проходит сразу после устранения раздражителя. ' +
            'Слизистая оболочка в области ' + T.gen + ' без патологических изменений.';
        return {
          complaints: p.since ? complaints : 'Жалоб нет. Обратился с целью санации полости рта.',
          anamnesisMorbi: (p.since ? 'Со слов пациента, ' + T.nom + ' беспокоит в течение ' + p.since + '. ' : '') +
            (p.prev === 'lost' ? 'Ранее ' + T.nom + ' лечен(ы), пломба частично утрачена.' : 'Ранее по поводу ' + T.gen + ' не лечился.'),
          statusLocalis: sl,
          xray: p.xray ? 'На прицельной рентгенограмме ' + T.gen + ': очаг деструкции твёрдых тканей в пределах ' + P.depth.word + ', связь с полостью зуба не определяется, периапикальные ткани без патологических изменений.' : '',
          diagnosis: P.depth.mkb[1].replace(/^K\S+\s/, '') + ' ' + T.gen + ' (' + p.black + ' класс по Блэку), ' + P.depth.mkb[0] + '.',
          treatment: T.Nom + ': ' + (p.isol ? 'изоляция ' + p.isol + '. Препарирование' : 'препарирование') + ' кариозной полости, некрэктомия. Медикаментозная обработка раствором хлоргексидина 0,05%. ' +
            linerText(p.liner) + 'Адгезивная подготовка: ' + p.adhesive + '. Восстановление ' + p.material + ' послойно. Финишная обработка, шлифовка, полировка. Окклюзия проверена.',
          recommendations: 'Не принимать пищу 2 часа. Индивидуальная гигиена полости рта 2 раза в день, использование флосса. Контрольный осмотр через 6 месяцев.',
        };
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
          opt('shaping', 'Обработка каналов'), opt('tempfill', 'Врем. пломбир. каналов'), opt('obtur', 'Пломбирование каналов'), opt('temp', 'Временная пломба'),
        ], default: [] },
        { key: 'canals', label: 'Каналы', type: 'chips', options: ['К', 'Щ', 'Н', 'В', 'Я', 'МЩ', 'МЩ2', 'МЯ', 'ДЩ', 'ДЯ', 'Д'].map((x) => opt(x)), default: [] },
        { key: 'wl', label: 'Рабочие длины', type: 'text', placeholder: 'необязательно, напр.: МЩ 20, МЯ 20,5, Д 21', show: (p) => (p.stages || []).some((x) => x === 'shaping' || x === 'obtur') },
        { key: 'isol', label: 'Изоляция', type: 'select', options: [opt('', 'Нет'), opt('коффердамом', 'Коффердам'), opt('ретрактором OptraGate', 'OptraGate'), opt('ватными валиками и слюноотсосом', 'Ватные валики')], default: '' },
        { key: 'retreatMat', label: 'Ранее пломбированы', type: 'seg', options: [
          opt('paste', 'Паста', { t: 'пастой' }), opt('gutta', 'Гуттаперча', { t: 'гуттаперчей' }), opt('resorcin', 'Резорцин-формалин / фосфат-цемент', { t: 'резорцин-формалиновым методом (фосфат-цементом)' }),
        ], default: 'paste', show: (p) => (p.stages || []).includes('retreat') },
        { key: 'instr', label: 'Инструменты', type: 'select', options: [
          opt('rotary', 'Ротационные NiTi', { t: 'ротационными NiTi-инструментами' }), opt('recip', 'Реципрокные NiTi', { t: 'реципрокными NiTi-инструментами' }), opt('hand', 'Ручные К-файлы', { t: 'ручными К-файлами' }),
        ], default: 'rotary', show: (p) => (p.stages || []).includes('shaping') },
        { key: 'hard', label: 'Труднопроходимые', type: 'toggle', default: false, show: (p) => (p.stages || []).includes('shaping') },
        { key: 'irrig', label: 'Ирригация', type: 'select', options: [
          opt('naocl', 'Гипохлорит натрия 3%', { t: 'раствором гипохлорита натрия 3%' }),
          opt('naocl_edta', 'Гипохлорит + ЭДТА 17%', { t: 'растворами гипохлорита натрия 3% и ЭДТА 17%' }),
          opt('naocl_edta_chx', 'Гипохлорит + ЭДТА + хлоргексидин', { t: 'растворами гипохлорита натрия 3%, ЭДТА 17%, финальная ирригация хлоргексидином 2%' }),
          opt('chx', 'Хлоргексидин 2%', { t: 'раствором хлоргексидина 2%' }),
        ], default: 'naocl', show: (p) => (p.stages || []).includes('shaping') },
        { key: 'us', label: 'УЗ-активация', type: 'toggle', default: true, show: (p) => (p.stages || []).includes('shaping') },
        { key: 'caoh', label: 'Препарат в каналы', type: 'select', options: [opt('пастой на основе гидроксида кальция', 'Гидроксид кальция'), opt('пастой на основе гидроксида кальция с йодоформом', 'Гидроксид кальция + йодоформ')], show: (p) => (p.stages || []).includes('tempfill') },
        { key: 'method', label: 'Метод', type: 'seg', options: [
          opt('lateral', 'Латеральная', { t: 'латеральной конденсации' }), opt('vertical', 'Вертикальная', { t: 'горячей вертикальной конденсации' }), opt('single', 'Одиночный штифт', { t: 'одиночного штифта' }),
        ], default: 'lateral', show: (p) => (p.stages || []).includes('obtur') },
        { key: 'sealer', label: 'Силер', type: 'seg', options: [
          opt('epoxy', 'Эпоксидный', { t: 'эпоксидным силером' }), opt('bio', 'Биокерамический', { t: 'биокерамическим силером' }), opt('zoe', 'Цинкоксидэвгенольный', { t: 'цинкоксидэвгенольным силером' }),
        ], default: 'epoxy', show: (p) => (p.stages || []).includes('obtur') },
        { key: 'ctrl', label: 'Контрольный снимок', type: 'toggle', default: false, show: (p) => (p.stages || []).includes('obtur') },
        { key: 'perc', label: 'Перкуссия', type: 'seg', options: [opt('', 'По диагнозу'), opt('безболезненна', 'Безбол.'), opt('слабоболезненна', 'Слабобол.'), opt('резко болезненна', 'Резко бол.')], default: '' },
        { key: 'xray', label: 'Рентген', type: 'toggle', default: true, show: (p) => p.visit === 'first' },
        { key: 'follow', label: 'Повторная явка', type: 'toggle', default: false },
        { key: 'days', label: 'Явка через', type: 'seg', options: [opt('3–5 дней'), opt('7 дней'), opt('14 дней')], default: '7 дней', show: (p) => p.follow },
      ],
      onTeeth: (b) => { if (!b.touched.canals) b.params.canals = b.teeth.length ? canalsForTooth(b.teeth[0]) : []; },
      finalize: (b, blocks) => {
        const st = b.params.stages || [];
        if (st.some((x) => ['pulpotomy', 'extirp', 'retreat'].includes(x))) b.params.visit = 'first';
        else if (st.includes('obtur')) { b.params.visit = 'repeat'; b.auto.visit = 1; }
        if (st.includes('retreat')) { b.params.diag = 'chronic_ap'; b.auto.diag = 1; }
        const restored = blocks.some((r) => r.tpl === 'endoRestore' && overlap(r, b));
        if (st.includes('tempfill') && !restored && !st.includes('temp')) { b.params.stages = st.concat('temp'); b.auto.stages = 1; }
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
        const restored = X.blocks.some((r) => r.tpl === 'endoRestore' && overlap(r, X.b));
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
          const cav = retreat ? 'На ' + T.loc + ' пломба с нарушением краевого прилегания.'
            : p.diag === 'acute_p' ? 'На ' + T.loc + ' глубокая кариозная полость, выполненная размягчённым дентином.'
            : 'На ' + T.loc + ' глубокая кариозная полость, сообщающаяся с полостью зуба.';
          const probe = { acute_p: 'Зондирование дна резко болезненно в одной точке. Реакция на холод резко болезненная, длительная.',
            chronic_p: 'Зондирование в точке сообщения с полостью зуба болезненно, кровоточивость. Реакция на холод болезненная, медленно проходящая.',
            acute_ap: 'Зондирование безболезненно. Реакция на холод отсутствует.', chronic_ap: 'Зондирование безболезненно. Реакция на холод отсутствует.' }[p.diag];
          const muc = p.diag === 'acute_ap' ? 'Слизистая оболочка в проекции верхушки корня гиперемирована, отёчна, пальпация болезненна.'
            : 'Слизистая оболочка в области ' + T.gen + ' без патологических изменений.';
          R.statusLocalis = [cav, retreat ? 'Реакция на холод отсутствует.' : probe, 'Перкуссия ' + perc + '.', muc].join(' ');
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
        else if (retreat) t.push('Удаление старой пломбы, раскрытие полости зуба.');
        else t.push('Препарирование кариозной полости, некрэктомия, раскрытие полости зуба.');
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
        if (has('temp')) t.push('Наложение временной пломбы.');
        const tx = t.join(' ');
        R.treatment = T.Nom + ': ' + tx.charAt(0).toLowerCase() + tx.slice(1);
        const r = ['Не принимать пищу 2 часа.'];
        if (has('temp')) r.push('Бережно относиться к временной пломбе, не жевать на стороне лечения.');
        if (has('obtur')) r.push('Возможна болезненность при накусывании в течение нескольких дней.');
        if (has('obtur') && !restored) r.push('Восстановление коронковой части ' + T.gen + ' в ближайшее время.');
        if (p.follow) r.push('Явка через ' + p.days + '.');
        r.push('При появлении боли или отёка — обратиться в клинику.');
        R.recommendations = r.join(' ');
        return R;
      },
    },

    {
      id: 'endoRestore', title: 'Реставрация после эндо', icon: '🧱', position: 'therapist', order: 26, needTeeth: true,
      params: [
        { key: 'post', label: 'Стекловолоконный штифт', type: 'toggle', default: false },
        { key: 'postCanal', label: 'Штифт в канал', type: 'text', placeholder: 'например: Н', show: (p) => p.post },
        { key: 'liner', label: 'Прокладка', type: 'chips', options: LINER_OPTS, default: [] },
        { key: 'adhesive', label: 'Адгезив', type: 'select', options: ADHESIVES },
        { key: 'material', label: 'Материал', type: 'select', options: MATERIALS },
      ],
      fields: (p, T) => ({
        treatment: 'Восстановление коронковой части ' + T.gen + '. ' + (p.post ? 'Установка стекловолоконного штифта' + (p.postCanal ? ' в канал ' + p.postCanal : '') + ' на композитный цемент. ' : '') +
          linerText(p.liner) + 'Адгезивная подготовка: ' + p.adhesive + '. Реставрация ' + p.material + ' послойно. Финишная обработка, шлифовка, полировка. Окклюзия проверена.',
        recommendations: 'Контрольный осмотр и рентгенограмма через 6 месяцев.',
      }),
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
      id: 'extraction', title: 'Удаление зуба', icon: '🔧', position: 'surgeon', order: 40, triggers: ['A16.07.001'], needTeeth: true, qtyIsTeeth: true,
      params: [
        { key: 'mkb', label: 'Диагноз', type: 'select', options: [
          opt('K04.5', 'K04.5 Хр. апикальный периодонтит', { mkb: ['K04.5', 'K04.5 Хронический апикальный периодонтит'], st: 'разрушена', xr: 'расширение периодонтальной щели, очаг деструкции костной ткани в области верхушки корня' }),
          opt('K08.3', 'K08.3 Оставшийся корень зуба', { mkb: ['K08.3', 'K08.3 Оставшийся корень зуба'], st: 'отсутствует, корень ниже уровня десны', xr: 'корень зуба, периапикальные изменения' }),
          opt('K05.3', 'K05.3 Хронический пародонтит', { mkb: ['K05.3', 'K05.3 Хронический пародонтит'], st: 'сохранна', xr: 'резорбция костной ткани более 2/3 длины корня' }),
          opt('K01.1', 'K01.1 Ретинированный зуб', { mkb: ['K01.1', 'K01.1 Импактные зубы'], st: 'не прорезалась', xr: 'ретинированный зуб в кости альвеолярного отростка' }),
        ] },
        { key: 'method', label: 'Удаление', type: 'seg', options: [opt('simple', 'Простое'), opt('complex', 'Сложное')], default: 'simple' },
        { key: 'mob', label: 'Подвижность', type: 'seg', options: [opt('отсутствует', 'Нет'), opt('I степени', 'I'), opt('II степени', 'II'), opt('III степени', 'III')], default: 'отсутствует' },
        { key: 'xray', label: 'Рентген', type: 'seg', options: [opt('yes', 'Есть'), opt('', 'Нет')], default: 'yes' },
        { key: 'sponge', label: 'Гемостатическая губка', type: 'toggle', default: false },
        { key: 'sutures', label: 'Швы', type: 'toggle', default: false },
      ],
      mkb: (p, P) => P.mkb.mkb,
      fields: (p, T, P) => ({
        complaints: p.mkb === 'K01.1' ? 'Направлен на удаление ретинированного ' + T.gen.replace(/^зуб(а|ов)/, 'зуба') + '.' :
          p.mkb === 'K05.3' ? 'Жалобы на подвижность ' + T.gen + ', дискомфорт при жевании.' : 'Жалобы на ноющую боль в области ' + T.gen + ', усиливающуюся при накусывании.',
        anamnesisMorbi: 'Со слов пациента, ' + T.nom + ' беспокоит длительное время. Ранее ' + T.nom + ' лечен(ы). Направлен на удаление.',
        statusLocalis: 'Коронковая часть ' + T.gen + ' ' + P.mkb.st + '. Перкуссия ' + (p.mkb === 'K01.1' ? 'не проводилась' : 'слабоболезненна') +
          '. Подвижность ' + p.mob + '. Слизистая оболочка в области ' + T.gen + ' ' + (p.mkb === 'K04.5' ? 'гиперемирована, отёчна' : 'без выраженных изменений') + '.',
        xray: p.xray ? 'На рентгенограмме (КЛКТ) ' + T.gen + ': ' + P.mkb.xr + '.' : '',
        diagnosis: P.mkb.mkb[1].replace(/^K\S+\s/, '') + ' ' + T.gen + ', ' + P.mkb.mkb[0] + '.',
        treatment: 'Удаление ' + T.gen + (p.method === 'complex' ? ' сложное: выкраивание слизисто-надкостничного лоскута, разъединение корней, поочерёдное удаление корней' : ' щипцами и элеватором') +
          '. Кюретаж лунки, антисептическая обработка. ' + (p.sponge ? 'В лунку введена гемостатическая губка. ' : 'Лунка заполнена кровяным сгустком. ') +
          (p.sutures ? 'Наложены швы. ' : '') + 'Гемостаз достигнут.',
        recommendations: 'Не принимать пищу 2 часа. В течение суток не полоскать рот, не греть, не употреблять горячую пищу и алкоголь, не курить. ' +
          'Холод на область вмешательства по 15 минут с перерывами в первые часы. При кровотечении, нарастании отёка или повышении температуры — обратиться в клинику.' +
          (p.sutures ? ' Снятие швов через 7–10 дней.' : ''),
      }),
    },
  ];

  globalThis.SQNSMZ_CONFIG = { POSITIONS, POSITION_BY_CODE, SERVICE_RULES, DEFAULT_DURATION, ADMISSION_CONDITION, DIAG_DEFAULTS, fmtTooth, TEMPLATES };
})();
