/* SQNS · Помощник медзаписи — СЦЕНАРИИ УСЛУГ (вкладка «Услуги»).
 * Каждый сценарий: параметры (что спрашиваем у врача) + build() → какие услуги добавить в визит.
 * Услуги указываются по id из прайса SQNS (колонка «№» в выгрузке «Список услуг»): один код МКБ-услуги
 * часто соответствует нескольким позициям прайса, поэтому только id.
 * Цены здесь не хранятся — помощник берёт актуальные из SQNS.
 */
(function () {
  'use strict';

  // id → код, короткое название для корзины, term — по каким словам искать карточку в SQNS
  const SVC = {
    3:   { code: 'B01.067.001', name: 'Приём хирурга первичный', term: 'врача-стоматолога-хирурга' },
    4:   { code: 'B01.067.002', name: 'Приём хирурга повторный', term: 'врача-стоматолога-хирурга' },
    14:  { code: 'B01.003.004.005', name: 'Инфильтрационная анестезия (1 карпула)', term: 'Инфильтрационная анестезия' },
    15:  { code: 'B01.003.004.002', name: 'Проводниковая анестезия (1 карпула)', term: 'Проводниковая анестезия' },
    184: { code: 'A16.07.097', name: 'Наложение шва на слизистую оболочку рта', term: 'Наложение шва на слизистую' },
    187: { code: 'A16.07.001.002', name: 'Удаление постоянного зуба', term: 'Удаление постоянного зуба' },
    188: { code: 'A16.07.001.003', name: 'Удаление зуба сложное с разъединением корней', term: 'Удаление зуба сложное' },
    189: { code: 'A16.07.024', name: 'Удаление ретенированного / дистопированного зуба', term: 'ретенированного' },
    237: { code: 'A11.12.009', name: 'PRF: забор крови, 1 пробирка', term: 'фибриновой мембраны' },
    238: { code: 'A11.12.009', name: 'PRF: дополнительная пробирка', term: 'фибриновой мембраны' },
  };

  const opt = (v, l) => ({ v, l });
  const lowerPost = (t) => /^[34][4-8]$/.test(String(t));          // нижние премоляры и моляры
  // Анестезия по умолчанию: по одной карпуле на сторону челюсти.
  // Нижние премоляры/моляры → проводниковая на эту сторону; остальные стороны → инфильтрационная.
  function anestDefaults(teeth) {
    const cond = new Set(teeth.filter(lowerPost).map((t) => String(t)[0]));
    const infil = new Set(teeth.filter((t) => !cond.has(String(t)[0])).map((t) => String(t)[0]));
    return { cond: cond.size, infil: teeth.length ? infil.size : 1 };
  }

  const EXT = { simple: 187, complex: 188, impacted: 189 };

  const SCENARIOS = [
    {
      id: 'extraction', title: 'Удаление зуба', icon: '🔧', cat: 'Хирургия', needTeeth: true,
      params: [
        { key: 'visit', label: 'Приём хирурга', type: 'seg', options: [opt('first', 'Первичный'), opt('repeat', 'Повторный')], default: 'repeat' },
        { key: 'anest', label: 'Анестезия', type: 'toggle', default: true },
        { key: 'infil', label: 'Инфильтрационная', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).infil },
        { key: 'cond', label: 'Проводниковая', unit: 'карп.', type: 'counter', min: 0, max: 8, show: (p) => p.anest, auto: (teeth) => anestDefaults(teeth).cond },
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
        if (p.anest && +p.infil > 0) L.push({ id: 14, qty: +p.infil });
        if (p.anest && +p.cond > 0) L.push({ id: 15, qty: +p.cond });
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

  globalThis.SQNSMZ_SERVICES = { SVC, SCENARIOS, _test: { anestDefaults } };
})();
