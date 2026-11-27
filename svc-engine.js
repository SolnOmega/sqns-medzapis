/* SQNS · Помощник медзаписи — ВКЛАДКА «УСЛУГИ»: сценарии → корзина → строки услуг визита SQNS.
 * Сценарии — в services.js. Панель и общие функции — в engine.js (он вызывает render/bind отсюда).
 * Запись идёт теми же функциями SQNS, что и ручной ввод: addItem → serviceChanged(карточка) → setTeeth → количество.
 * Визит не сохраняется: кнопку «Сохранить» нажимает врач.
 * Типы полей сценария, кроме описанных в services.js: group — раскрывающийся блок (выключатель в заголовке, внутри — поля с grp),
 *   stock — плашки-счётчики (клик +1, «−» убирает), toothSet (compact — свёрнутая строка с «Изменить», hl — пунктирная подсветка),
 *   perTooth с teethFrom — выбор по зубам другого набора, counter с default null — пусто, пока врач не укажет (need — красное).
 */
(function () {
  'use strict';
  const D = globalThis.SQNSMZ_SERVICES;
  if (!D) { console.error('[Медзапись] services.js не загружен'); return; }
  const { SVC, SCENARIOS } = D;
  const CATS_ALL = D.CATS || [{ id: 'all', title: 'Сценарии', icon: '🧾' }];

  const own = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  const up = (sc, fn) => { let p = sc; while (p) { if (own(p, fn) && typeof p[fn] === 'function') return p; p = p.$parent; } return null; };
  const ng = () => window.angular;
  const scopeOf = (el) => { try { return ng().element(el).scope(); } catch (e) { return null; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const applyRoot = (s) => { const r = s && (s.$root || s); if (r && !r.$$phase) r.$apply(); };
  const LAT = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };
  const normCode = (name) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[АВСЕКМНОРТХ]/g, (c) => LAT[c]);
  const scnById = (id) => SCENARIOS.find((s) => s.id === id);
  const LSK = 'sqnsmz.svcScn';
  const lsGet = () => { try { return localStorage.getItem(LSK); } catch (e) { return null; } };
  const lsSet = (v) => { try { localStorage.setItem(LSK, v); } catch (e) { /* */ } };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

  /* ---------------- карточки услуг из SQNS (цены — актуальные) ---------------- */
  const CARD = {}, CARD_LOAD = {};
  // Цена ещё грузится: перерисовать ОДИН раз, когда придёт. Без этого каждая перерисовка вешала новый обработчик
  // на ту же загрузку, и с каждой пришедшей ценой перерисовок становилось вдвое-втрое больше (план из нескольких этапов вешал вкладку).
  const WAIT = {};
  function whenCard(id, cb) {
    if (WAIT[id]) { WAIT[id].add(cb); return; }
    WAIT[id] = new Set([cb]);
    loadCard(id).then((x) => { const cbs = WAIT[id]; delete WAIT[id]; if (x && CARD[id]) cbs.forEach((f) => { try { f(); } catch (e) { /* */ } }); });
  }
  function loadCard(id) {
    if (CARD[id]) return Promise.resolve(CARD[id]);
    if (CARD_LOAD[id]) return CARD_LOAD[id];
    const s = SVC[id]; if (!s) return Promise.resolve(null);
    const terms = [s.term, s.code].filter(Boolean);
    CARD_LOAD[id] = (async () => {
      for (const t of terms) {
        try {
          const r = await fetch('/admin/service/suggest?term=' + encodeURIComponent(t), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
          if (!r.ok) continue;
          const arr = await r.json();
          (Array.isArray(arr) ? arr : []).forEach((x) => { const k = +(x.primaryKey || x.id); if (k && !CARD[k]) CARD[k] = x; });
          if (CARD[id]) return CARD[id];
        } catch (e) { /* следующий вариант поиска */ }
      }
      delete CARD_LOAD[id];
      return null;
    })();
    return CARD_LOAD[id];
  }

  /* ---------------- визит на странице ---------------- */
  function visitForm() {
    const el = document.querySelector('[ng-controller="VisitFormController"]');
    let s = el && scopeOf(el);
    let vf = s && up(s, 'addItem');
    if (!vf) { const tr = document.querySelector('tr[ng-controller="VisitServiceItemController"]'); vf = tr && up(scopeOf(tr), 'addItem'); }
    return vf || null;
  }
  function visitItems(vf) { try { return (vf.getForm ? vf.getForm() : vf.form).visitItems || []; } catch (e) { return []; } }
  async function showVisitTab() {
    const a = document.querySelector('a[href="#caseHistory"]');
    if (a && a.parentElement && !a.parentElement.classList.contains('ui-state-active')) { a.click(); await sleep(600); }
  }
  async function addOne(vf, line, rec) {
    let NEW = null;
    vf.addItem('service', (it) => { NEW = it; });
    applyRoot(vf);
    for (let i = 0; i < 25 && !NEW; i++) await sleep(200);          // SQNS может спросить сотрудника для первой строки
    if (!NEW) throw new Error('SQNS не создал строку услуги. Добавьте одну услугу вручную и повторите.');
    let row = null;
    for (let i = 0; i < 15 && !row; i++) {
      row = [...document.querySelectorAll('tr[ng-controller="VisitServiceItemController"]')].find((e) => { const s = scopeOf(e); return s && s.item === NEW; });
      if (!row) await sleep(150);
    }
    if (!row) throw new Error('Строка услуги не появилась на странице');
    const rs = scopeOf(row);
    rs.serviceChanged(rec); applyRoot(rs);
    if (line.teeth && line.teeth.length) { const ts = up(rs, 'setTeeth'); if (ts) ts.setTeeth(line.teeth.map(String).sort()); }
    if (line.qty > 1) {
      NEW.qty = line.qty;
      if (typeof rs.onQtyChange === 'function') rs.onQtyChange();
      const qc = up(rs, 'itemQtyChanged'); if (qc) qc.itemQtyChanged();
      if (typeof NEW.sync === 'function') NEW.sync();
    }
    applyRoot(rs);
    return NEW;
  }

  /* ---------------- скидка на визит (как поля «Итого» / «%» визита в SQNS) ---------------- */
  // SQNS (VisitFormController): totalFocus(поле) запоминает текущие итоги, затем в popupTotalDiscount (%) или popupTotalCost (итого)
  // пишется значение и вызывается totalCheck() — он раскладывает произвольную скидку по строкам (страховые строки не трогает)
  // и отправляет визит на обновление. Здесь — те же три шага.
  function visitDisc() {
    const el = document.querySelector('[ng-controller="VisitFormController"]');
    const s = el && up(scopeOf(el), 'totalCheck');
    return s && s.form && typeof s.totalFocus === 'function' ? s : null;
  }
  function visitTotals(vs) {
    try { const F = vs.form, full = +F.priceTotal() || 0, cost = +F.costTotal() || 0; return { full, cost, pct: full ? +F.discountTotal() || 0 : 0, n: (F.visitItems || []).length }; } catch (e) { return null; }
  }
  const parseNum = (v) => { const x = parseFloat(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return isFinite(x) ? x : null; };
  let VD = { open: false, mode: null, v: '' };
  function applyVisitDisc(API) {
    const vs = visitDisc(), v = parseNum(VD.v);
    if (!vs) { API.toast('Визит не открыт', 'bad'); return; }
    const T = visitTotals(vs);
    if (v == null || v < 0) { API.toast('Введите процент или итоговую сумму', 'warn'); return; }
    if (VD.mode === 'pct' && v > 100) { API.toast('Скидка не может быть больше 100 %', 'warn'); return; }
    if (VD.mode === 'sum' && T && v > T.full) { API.toast('Итого больше суммы без скидки', 'warn'); return; }
    const run = () => {
      if (VD.mode === 'pct') { vs.totalFocus('discount'); vs.form.popupTotalDiscount = v; }
      else { vs.totalFocus('cost'); vs.form.popupTotalCost = v; }
      vs.totalCheck();
    };
    try { const r = vs.$root || vs; if (r.$$phase) run(); else vs.$apply(run); }
    catch (e) { API.toast('Скидка: ' + ((e && e.message) || e), 'bad'); return; }
    VD = { open: false, mode: null, v: '' };
    const T2 = visitTotals(vs);
    API.toast('Скидка применена' + (T2 ? ': к оплате ' + rub(T2.cost) : '') + '. Проверьте итог в визите.', 'ok');
    API.rerender();
  }
  function discCard() {
    const vs = visitDisc(), T = vs && visitTotals(vs);
    if (!T || !T.n || !T.full) return '';
    const p = String(Math.round(T.pct * 100) / 100).replace('.', ',');
    let h = '<div class="sec"><h2>Скидка на визит</h2><div class="card"><div class="vd-h"><span>Сумма ' + rub(T.full) + (T.pct ? ' · скидка ' + p + ' %' : '') + ' · к оплате <b>' + rub(T.cost) + '</b></span>' +
      (VD.open ? '' : '<button class="link" data-vd="open">' + (T.pct ? 'Изменить' : 'Задать скидку') + '</button>') + '</div>';
    if (VD.open) h += '<div class="vd-r"><input type="text" inputmode="decimal" data-vdp="1" value="' + esc(VD.mode === 'pct' ? VD.v : '') + '" placeholder="' + esc(p) + '"><span>%</span><span class="vd-or">или итого</span>' +
      '<input type="text" inputmode="decimal" data-vds="1" value="' + esc(VD.mode === 'sum' ? VD.v : '') + '" placeholder="' + esc(String(T.cost).replace('.', ',')) + '"><span>₽</span>' +
      '<span class="vd-sp"></span><button class="link" data-vd="close">Отмена</button><button class="vd-b" data-vd="apply"' + (VD.mode ? '' : ' disabled') + '>Применить</button></div>' +
      '<div class="hint" style="margin:6px 0 0">Как в SQNS: скидка раскладывается на все услуги визита. После — проверьте итог и сохраните визит.</div>';
    return h + '</div></div>';
  }

  /* ---------------- зубная формула: изменения по услугам ---------------- */
  // Компонент формулы SQNS — scope с собственным changeConfigService (есть на странице и при свёрнутой формуле).
  // changeConfigService(['36'], участок, состояние, вкл/выкл, false) — тот же путь, что ручной клик:
  // формула меняется сразу, флаг needToSaveDentalFormula ставится сам, в базу всё уходит при сохранении визита.
  let FCOMP = null;
  function fComp() {
    if (FCOMP && !FCOMP.$$destroyed && typeof FCOMP.changeConfigService === 'function') return FCOMP;
    FCOMP = null;
    try {
      const root = ng().element(document.querySelector('[ng-app]') || document.documentElement).injector().get('$rootScope');
      let n = 0;
      (function w(x) {
        if (!x || FCOMP || n++ > 8000) return;
        if (own(x, 'changeConfigService') && typeof x.changeConfigService === 'function' && typeof x.getDentalFormulaFromService === 'function') { FCOMP = x; return; }
        for (let c = x.$$childHead; c; c = c.$$nextSibling) w(c);
      })(root);
    } catch (e) { FCOMP = null; }
    return FCOMP;
  }
  // живая формула из сервиса SQNS (с несохранёнными изменениями)
  function fJson(s) {
    try { let j = s.getDentalFormulaFromService(); if (typeof j === 'string') j = JSON.parse(j); return j && j.permanentTeeth && Object.keys(j.permanentTeeth).length ? j : null; } catch (e) { return null; }
  }
  const toothOf = (j, t) => (j.permanentTeeth || {})[t] || (j.deciduousTeeth || {})[t] || null;
  const reMatch = (r, v) => (r instanceof RegExp ? r.test(v) : r === v);
  // op сценария (см. services.js) → [{ t, loc, st, on }]: только то, что реально меняется и есть у этого зуба
  function formulaChanges(j, ops) {
    const cur = {}, want = {}, unrem = j.unremovableLocationsDueToothRemoval || ['gum', 'bone', 'default'];
    [...new Set(ops.map((o) => String(o.t)))].forEach((t) => {
      const L = (toothOf(j, t) || {}).locations || {};
      Object.keys(L).forEach((l) => Object.keys((L[l] || {}).states || {}).forEach((k) => { const key = t + '|' + l + '|' + k; cur[key] = want[key] = !!(L[l].states[k] || {}).isActive; }));
    });
    const canalLocs = (T, n) => Object.keys(T.locations || {}).filter((l) => /^canal/.test(l) && (l !== 'canalExtra' || n >= 2));
    ops.forEach((o) => {
      const t = String(o.t), T = toothOf(j, t); if (!T) return;
      Object.keys(want).forEach((key) => {
        const [kt, l, k] = key.split('|'); if (kt !== t || !want[key]) return;
        if (o.wipe && !unrem.includes(l)) want[key] = false;
        (o.clear || []).forEach(([lr, sr]) => { if (reMatch(lr, l) && reMatch(sr, k)) want[key] = false; });
      });
      (o.set || []).forEach(([l, k]) => (l === 'canals' ? canalLocs(T, o.n || 1) : [l]).forEach((x) => { const key = t + '|' + x + '|' + k; if (key in want) want[key] = true; }));
    });
    return Object.keys(want).filter((k) => want[k] !== cur[k]).map((k) => { const [t, loc, st] = k.split('|'); return { t, loc, st, on: want[k] }; });
  }
  // запись: сначала снимаем, потом ставим; одинаковые изменения на разных зубах — одним вызовом
  function applyChanges(s, ch) {
    const g = {};
    ch.forEach((c) => { const k = (c.on ? 1 : 0) + '|' + c.loc + '|' + c.st; (g[k] = g[k] || []).push(c.t); });
    const run = () => Object.keys(g).sort().forEach((k) => { const [on, loc, st] = k.split('|'); s.changeConfigService(g[k].slice().sort(), loc, st, on === '1', false); });
    const r = s.$root || s;
    if (r.$$phase) run(); else s.$apply(run);
  }
  const invert = (ch) => ch.map((c) => Object.assign({}, c, { on: !c.on }));
  // для предпросмотра: «3.6: + Пломбированный дентин · − Кариес»
  function changesText(j, ch, API) {
    const nm = (k) => { const v = ((j && j.stateNames) || {})[k]; const s = v && typeof v === 'object' ? (v.name || v.title) : v; return s || k.replace(/_/g, ' '); };
    const by = {};
    ch.forEach((c) => { const b = by[c.t] = by[c.t] || { on: [], off: [] }; const n = nm(c.st), a = c.on ? b.on : b.off; if (!a.includes(n)) a.push(n); });
    return Object.keys(by).sort().map((t) => ({ t: API.fmtTooth(t), on: by[t].on, off: by[t].off }));
  }
  // изменения для текущего сценария: { ok, comp, j, ch, why }
  function formulaPlan() {
    const sc = scnById(SS.scn);
    if (!sc || !sc.formula) return { ok: false, ch: [] };
    const comp = fComp(), j = comp && fJson(comp);
    if (!comp || !j) return { ok: false, ch: [], why: 'Зубная формула на странице не найдена — изменения в неё не внесутся' };
    let ops = [];
    try { ops = sc.formula(effParams(), SS.teeth.slice().sort()) || []; } catch (e) { console.warn('[Медзапись] формула', e); }
    return { ok: true, comp, j, ch: formulaChanges(j, ops) };
  }

  /* ---------------- состояние вкладки ---------------- */
  let SS = null;
  // Режим плана лечения (plan.js): формула — виртуальная (пациент + предыдущие этапы), «уже есть» — по строкам этапа, а не визита
  let CTX = { plan: false, formula: null, stageItems: [] };
  let OPEN_CAT;                  // открытый раздел (Терапия / Хирургия / Ортопедия)
  // значения полей карточки зуба по умолчанию
  function cardDefaults(pr) {
    const c = {};
    pr.fields.forEach((f) => {
      if (f.type === 'heading') return;
      if (f.type === 'fillings') c[f.key] = [{ mat: (f.materials[0] || {}).v, cls: '' }];
      else if (f.type === 'split') c[f.key] = { mode: f.default == null ? null : f.default, n: {} };
      else if (f.type === 'count') c[f.key] = null;
      else c[f.key] = f.default !== undefined ? clone(f.default) : f.type === 'toggle' ? false : null;
    });
    c._t = {};                     // поля, которые врач правил вручную (count не пересчитывается)
    return c;
  }
  const canalsKey = (sc) => { const pr = (sc ? sc.params : []).find((x) => x.type === 'canals'); return pr ? pr.key : null; };
  // каналов у зуба (1, если в сценарии каналов нет)
  function canalsOf(st, t) { const k = canalsKey(scnById(st.scn)); return k ? Math.max(1, +((st.params[k] || {})[t]) || 1) : 1; }
  // поля карточки зуба приводятся к числу каналов
  function normCard(pr, c, N) {
    pr.fields.forEach((f) => {
      if (f.type === 'count') { if (!c._t[f.key] || c[f.key] == null) c[f.key] = N; else c[f.key] = Math.min(+c[f.key], N); }
      if (f.type === 'split') {
        const s = c[f.key]; if (!s || s.mode !== 'mix') return;
        if (N === 1) { const k = Object.keys(s.n).find((x) => +s.n[x] > 0); s.mode = k || f.options[0].v; return; }
        if (f.options.length === 2) { const [a, b] = f.options.map((o) => o.v); s.n[b] = Math.min(N, +s.n[b] || 0); s.n[a] = N - s.n[b]; }
      }
    });
  }
  function fresh(id) {
    const sc = scnById(id);
    const st = { scn: id, teeth: [], params: {}, touched: {}, ctouched: {}, more: {}, tsOpen: {}, busy: false, done: null, error: '', fon: true, fch: null, fText: null };
    (sc ? sc.params : []).forEach((pr) => {
      if (pr.type === 'perTooth' || pr.type === 'teethCards' || pr.type === 'canals' || pr.type === 'stock') st.params[pr.key] = {};
      else if (pr.default !== undefined) st.params[pr.key] = clone(pr.default);
      else if (pr.type === 'counter') st.params[pr.key] = pr.min || 0;
      else if (pr.type === 'toggle') st.params[pr.key] = false;
      else if (pr.type === 'opt') st.params[pr.key] = null;
      else if (pr.type === 'toothSet') st.params[pr.key] = [];
      else if (pr.options) st.params[pr.key] = pr.options[0].v;
    });
    autoParams(st);
    return st;
  }
  function autoParams(st) {
    const sc = scnById(st.scn); if (!sc) return;
    sc.params.forEach((pr) => {
      if (pr.type === 'perTooth' || pr.type === 'teethCards' || pr.type === 'canals') {
        const m = st.params[pr.key] = st.params[pr.key] || {};
        const src = pr.teethFrom ? (st.params[pr.teethFrom] || []).map(String) : st.teeth;   // perTooth может идти по зубам другого набора
        Object.keys(m).forEach((t) => { if (!src.includes(t)) delete m[t]; });
        src.forEach((t) => {
          if (pr.type === 'canals') { if (!m[t] || !st.ctouched[t]) m[t] = pr.auto(t); return; }
          if (!m[t]) m[t] = pr.type === 'perTooth' ? (pr.default || pr.options[0].v) : cardDefaults(pr);
          if (pr.type === 'teethCards') normCard(pr, m[t], canalsOf(st, t));
        });
        return;
      }
      if (pr.auto && !st.touched[pr.key]) st.params[pr.key] = pr.auto(st.teeth, st.params);
    });
  }
  // Параметры для расчёта: скрытые (show = false) поля карточек считаются выключенными
  const OFF = { toggle: false, opt: null, seg: null, split: null, count: 0, fillings: [] };
  // Поля раскрывающегося блока (grp): выключен блок или само поле скрыто — в расчёт не идут
  const OFFP = { toggle: false, opt: null, seg: null, counter: 0, toothSet: [], stock: {}, perTooth: {} };
  function effParams() {
    const sc = scnById(SS.scn), out = Object.assign({}, SS.params);
    sc.params.forEach((pr) => {
      if (!pr.grp || !(pr.type in OFFP)) return;
      if (!SS.params[pr.grp] || (pr.show && !pr.show(SS.params))) out[pr.key] = clone(OFFP[pr.type]);
    });
    sc.params.forEach((pr) => {
      if (pr.type !== 'teethCards') return;
      const m = {}; Object.keys(SS.params[pr.key] || {}).forEach((t) => {
        const c = SS.params[pr.key][t], e = Object.assign({}, c);
        pr.fields.forEach((f) => { if (f.show && !f.show(c) && f.type in OFF) e[f.key] = OFF[f.type]; });
        m[t] = e;
      });
      out[pr.key] = m;
    });
    return out;
  }
  function lines() {
    const sc = scnById(SS.scn); if (!sc) return [];
    const L = sc.build(effParams(), SS.teeth.slice().sort());
    const vf = CTX.plan ? null : visitForm(), items = CTX.plan ? CTX.stageItems : vf ? visitItems(vf) : [];
    L.forEach((l) => {
      const s = SVC[l.id] || {};
      if (l.skipIfCode && items.some((it) => normCode(it.name).startsWith(l.skipIfCode))) l.skip = CTX.plan ? 'уже в этапе' : 'уже в визите';
      else if (items.some((it) => +it.serviceID === l.id && (it.teeth || []).map(String).sort().join() === (l.teeth || []).map(String).sort().join())) l.dup = true;
      l.code = s.code; l.name = s.name;
    });
    return L;
  }

  /* ---------------- рендер ---------------- */
  const CSS = `
  .vtabs{display:flex;gap:4px;background:#e2e8f0;padding:3px;border-radius:12px;margin-bottom:12px}
  .vtabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:8px;font-weight:700;font-size:13px;color:#475569;cursor:pointer}
  .vtabs button.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.12)}
  .cnt{display:inline-flex;align-items:center;gap:6px} .cnt button{width:30px;height:30px;border-radius:9px;border:1px solid #cbd5e1;background:#fff;font-size:16px;font-weight:700;color:#334155;cursor:pointer}
  .cnt button:hover{border-color:#818cf8;color:#4338ca} .cnt b{min-width:22px;text-align:center;font-size:15px} .cnt span{font-size:12px;color:#64748b}
  .ptm{display:flex;align-items:center;gap:8px;margin:5px 0} .ptm .tchip{min-width:40px;text-align:center}
  .optc{display:flex;align-items:center;gap:8px;flex-wrap:wrap} .optc .badge,.wrow .badge{margin-top:4px}
  .tcard{margin:10px 0 4px;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
  .tcard .tch{display:flex;align-items:center;gap:8px;margin-bottom:4px} .tcard .tch .tchip{font-size:13.5px}
  .tcard .row{grid-template-columns:132px 1fr;margin:6px 0}
  .frow{margin:8px 0} .flbl{font-size:12px;color:#475569;font-weight:600;margin-bottom:4px}
  .fcl{display:flex;align-items:center;gap:8px;flex-wrap:wrap} .fcl>span{font-size:11.5px;color:#64748b;font-weight:600}
  .fcl .seg button{min-width:34px}
  .fill{background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:8px;margin:4px 0}
  .fill.need{border-color:#fca5a5;background:#fff7f7}
  .fill .fh2{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:#475569;margin-bottom:5px}
  .fill .fh2 .sp{flex:1} .fill .seg{margin-bottom:5px} .fill .seg:last-child{margin-bottom:0}
  .fill .xdel{border:0;background:#f1f5f9;color:#64748b;border-radius:7px;width:22px;height:22px;cursor:pointer;font-size:13px}
  .fill .xdel:hover{background:#fee2e2;color:#b91c1c}
  .cart{font-size:12.5px} .cl{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;padding:7px 2px;border-bottom:1px dashed #e2e8f0}
  .cl:last-child{border:0} .cl .cd{font-family:ui-monospace,Consolas,monospace;color:#475569;font-size:11.5px} .cl .q{font-weight:700;white-space:nowrap} .cl .pr{white-space:nowrap;color:#334155;text-align:right;min-width:70px}
  .cl.skip{opacity:.5} .tot{display:flex;justify-content:space-between;font-weight:800;padding:8px 2px 0;font-size:13.5px}
  .done{background:#f0fdf4;border-color:#bbf7d0}
  .cats{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;background:#e0e7ff;padding:4px;border-radius:13px}
  .cat{display:flex;align-items:center;gap:7px;border:0;background:transparent;border-radius:10px;padding:8px 10px;cursor:pointer;color:#3730a3;text-align:left;font-weight:700}
  .cat:hover{background:rgba(255,255,255,.65)} .cat .cv{color:#6366f1;font-size:11px}
  .cat.has{background:rgba(255,255,255,.55)}
  .cat.open{background:linear-gradient(135deg,#0ea5a3,#6366f1);color:#fff;box-shadow:0 3px 10px rgba(79,70,229,.3)} .cat.open .cv{color:#e0e7ff}
  .catl{margin-top:10px}
  .csub{margin:10px 0 4px;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6366f1;font-weight:800}
  .catl .csub:first-child{margin-top:2px}
  .wrow{margin:6px 0}
  .canals{margin:-2px 0 10px;padding:8px 10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
  .canr{display:flex;align-items:center;gap:10px;margin:4px 0} .canr .tchip{min-width:40px;text-align:center}
  .mix{margin-top:5px;display:flex;flex-direction:column;gap:3px} .mixr{display:flex;align-items:center;justify-content:space-between;gap:8px} .mixr>span{font-size:12px;color:#475569}
  .muted{color:#64748b;font-size:12px}
  .grp{margin:8px 0;border:1px solid #e2e8f0;border-radius:12px;background:#fff}
  .grp.on{border-color:#c7d2fe;background:#fafbff}
  .gh{display:flex;align-items:center;gap:8px;padding:8px 10px}
  .gh .gt{flex:1;font-size:13px;font-weight:700;color:#334155} .gh .gn{font-size:11.5px;color:#4f46e5;font-weight:700}
  .gb{padding:2px 10px 6px;border-top:1px dashed #e2e8f0}
  .gb .row{grid-template-columns:1fr auto;margin:5px 0}
  .gsub{margin:-2px 0 8px 8px;padding-left:10px;border-left:2px solid #e0e7ff}
  .gsub .row{margin:4px 0} .gsub .formula.mini{margin:4px 0 2px}
  .stock{display:flex;flex-direction:column;gap:6px;margin:4px 0 6px}
  .stkr{display:grid;grid-template-columns:112px 1fr;gap:6px;align-items:center}
  .stkl{font-size:12px;color:#475569;font-weight:600}
  .stkc{display:flex;flex-wrap:wrap;gap:5px}
  .stk{display:inline-flex;align-items:stretch;border:1.5px solid #e2e8f0;border-radius:9px;background:#fff;overflow:hidden}
  .stk button{border:0;background:transparent;padding:5px 9px;font-size:12.5px;font-weight:600;color:#334155;cursor:pointer}
  .stk button:hover{background:#eef2ff;color:#4338ca}
  .stk.on{border-color:#818cf8;background:#eef2ff} .stk.on button{color:#3730a3} .stk b{font-weight:800}
  .stk .m{border-left:1px solid #c7d2fe;padding:5px 8px;color:#64748b}
  .stkt{font-size:12px;font-weight:700;color:#4338ca}
  .tsr{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:6px 0} .tsr .flbl{margin:0}
  .fdiff{margin-top:6px;font-size:12.5px} .fdr{display:flex;align-items:flex-start;gap:8px;padding:4px 0;border-bottom:1px dashed #e2e8f0} .fdr:last-child{border:0}
  .fdr .tchip{min-width:40px;text-align:center} .fdr>span:last-child{display:flex;flex-wrap:wrap;gap:4px 10px;padding-top:2px}
  .fon{color:#15803d;font-weight:600} .foff{color:#b91c1c}
  .vd-h{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12.5px;color:#334155}
  .vd-r{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px} .vd-r input{width:76px;padding:6px 8px} .vd-r input[data-vds]{width:120px}
  .vd-r span{font-size:12.5px;color:#475569} .vd-r .vd-or{margin:0 4px;color:#94a3b8} .vd-sp{flex:1}
  .vd-b{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:9px;padding:6px 11px;font-size:12.5px;font-weight:700;cursor:pointer} .vd-b:disabled{opacity:.45;cursor:default}
  ` + Object.values(D.TYPES || {}).map((t) => t.css || '').join('');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (lvl, t) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(t) + '</span>';
  const rub = (n) => (Math.round(n * 100) / 100).toLocaleString('ru-RU') + ' ₽';
  const segH = (attr, opts, cur) => '<div class="seg">' + opts.map((o) => '<button ' + attr + ' data-v="' + esc(o.v) + '" class="' + (o.v === cur ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
  // выключатель + выбор варианта (значение null — выключено)
  const optH = (attrT, attrV, opts, cur) => '<div class="optc"><button class="tg ' + (cur ? 'on' : '') + '" ' + attrT + '></button>' + (cur ? segH(attrV, opts, cur) : '') + '</div>';

  const fDiffH = (T) => T.map((x) => '<div class="fdr"><span class="tchip">' + esc(x.t) + '</span><span>' +
    x.on.map((n) => '<span class="fon">+ ' + esc(n) + '</span>').concat(x.off.map((n) => '<span class="foff">− ' + esc(n) + '</span>')).join(' ') + '</span></div>').join('');
  function renderFillings(pk, f, t, list) {
    return list.map((x, i) => {
      const cls = f.classes[x.mat], need = cls && !x.cls;
      const id = pk + '|' + t + '|' + i;
      return '<div class="fill' + (need ? ' need' : '') + '">' +
        (list.length > 1 ? '<div class="fh2">Пломба ' + (i + 1) + '<span class="sp"></span><button class="xdel" data-fdel="' + id + '" title="Убрать">×</button></div>' : '') +
        segH('data-fmat="' + id + '"', f.materials, x.mat) +
        (cls ? '<div class="fcl"><span>Класс</span>' + segH('data-fcls="' + id + '"', cls.map((c) => ({ v: c, l: c })), x.cls) + (need ? badge('bad', 'выберите класс') : '') + '</div>' : '') +
        '</div>';
    }).join('') + (list.length < (f.max || 3) ? '<button class="link" data-fadd="' + pk + '|' + t + '">＋ Вторая пломба на этом зубе</button>' : '');
  }
  const cntH = (attr, v, unit) => '<div class="cnt"><button ' + attr + ' data-d="-1">−</button><b>' + (+v || 0) + '</b><button ' + attr + ' data-d="1">+</button><span>' + esc(unit || '') + '</span></div>';
  // каналы по видам: «все — один вид» или «разные» со счётчиками
  function renderSplit(f, a, s, N) {
    s = s || { mode: null, n: {} };
    const opts = f.options.map((o) => ({ v: o.v, l: (N > 1 && o.s) || o.l })).concat(N > 1 ? [{ v: 'mix', l: 'Разные' }] : []);
    let h = segH('data-csplit="' + a + '"', opts, s.mode);
    if (!s.mode) h += badge('bad', 'выберите');
    if (s.mode === 'mix') {
      const sum = f.options.reduce((x, o) => x + (+s.n[o.v] || 0), 0);
      h += '<div class="mix">' + f.options.map((o) => '<div class="mixr"><span>' + esc(o.l) + '</span>' + cntH('data-cspc="' + a + '|' + o.v + '"', s.n[o.v], 'кан.') + '</div>').join('') +
        (sum !== N ? badge('bad', 'отмечено ' + sum + ' из ' + N + ' кан.') : '') + '</div>';
    }
    return h;
  }
  function renderCards(pr, API) {
    if (!SS.teeth.length) return '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', 'отметьте зубы') + '</div></div>';
    const store = SS.params[pr.key] || {}, hasCanals = !!canalsKey(scnById(SS.scn));
    return SS.teeth.slice().sort().map((t) => {
      const c = store[t] || {}, N = canalsOf(SS, t);
      const vis = (f) => !f.show || f.show(c);
      const row = (f) => {
        if (!vis(f)) return '';
        const a = pr.key + '|' + t + '|' + f.key;
        if (f.type === 'heading') return '<div class="csub">' + esc(f.label) + '</div>';
        if (f.type === 'fillings') return '<div class="frow"><div class="flbl">' + esc(f.label) + '</div>' + renderFillings(pr.key, f, t, c[f.key] || []) + '</div>';
        let ctl = '';
        if (f.type === 'toggle') ctl = '<div class="optc"><button class="tg ' + (c[f.key] ? 'on' : '') + '" data-ctg="' + a + '"></button>' + (f.perCanal && c[f.key] ? '<span class="muted">× ' + N + ' кан.</span>' : '') + '</div>';
        else if (f.type === 'opt') ctl = optH('data-copt="' + a + '"', 'data-coptv="' + a + '"', f.options, c[f.key]);
        else if (f.type === 'seg') ctl = segH('data-cseg="' + a + '"', f.options, c[f.key]);
        else if (f.type === 'split') ctl = renderSplit(f, a, c[f.key], N);
        else if (f.type === 'count') ctl = cntH('data-ccount="' + a + '"', c[f.key], 'из ' + N + ' кан.');
        if (f.wide || !f.label) return '<div class="wrow">' + (f.label ? '<div class="flbl">' + esc(f.label) + '</div>' : '') + ctl + '</div>';
        return '<div class="row"><label>' + esc(f.label) + '</label><div>' + ctl + '</div></div>';
      };
      const main = pr.fields.filter((f) => !f.adv), adv = pr.fields.filter((f) => f.adv);
      const advOn = adv.filter((f) => c[f.key]).length, open = SS.more[t] || advOn > 0;
      return '<div class="tcard"><div class="tch"><span class="tchip">Зуб ' + API.fmtTooth(t) + '</span>' + (hasCanals ? '<span class="muted">' + N + ' ' + plural(N, 'канал', 'канала', 'каналов') + '</span>' : '') + '</div>' + main.map(row).join('') +
        (adv.length ? (open ? '<div class="csub">Ещё</div>' + adv.map(row).join('') : '') + (advOn ? '' : '<button class="morebtn" data-cmore="' + t + '">' + (open ? '▴ Скрыть' : '▾ Ещё (' + adv.length + ')') + '</button>') : '') + '</div>';
    }).join('');
  }
  const plural = (n, one, few, many) => { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; };
  // счётчик каналов у каждого зуба — сразу под формулой
  function renderCanals(pr, API) {
    if (!SS.teeth.length) return '';
    const m = SS.params[pr.key] || {};
    return '<div class="canals"><div class="flbl">Каналов в зубе</div>' + SS.teeth.slice().sort().map((t) =>
      '<div class="canr"><span class="tchip">' + API.fmtTooth(t) + '</span>' + cntH('data-canal="' + pr.key + '|' + t + '"', m[t], '') +
      (SS.ctouched[t] ? '' : '<span class="auto">● по зубу</span>') + '</div>').join('') + '</div>';
  }

  // мини-формула для выбора зубов отдельной услуги (attr — data-атрибут кнопок)
  function teethGrid(API, sel, attr, title, need, hl, extra) {
    const M = API.marks(), H = (hl || []).map(String);
    const lbl = (t) => (!M ? { txt: t, cls: '' } : M.missing.includes(t) ? { txt: '0', cls: ' miss' } : M.implant.includes(t) ? { txt: 'И', cls: ' impl' } : { txt: t, cls: '' });
    const btn = (t) => { t = String(t); const L = lbl(t); return '<button class="tb' + L.cls + (sel.includes(t) ? ' on' : H.includes(t) ? ' dv' : '') + '" ' + attr + ' data-t="' + t + '" title="' + t + '">' + L.txt + '</button>'; };
    const r = (a, z) => Array.from({ length: z }, (_, i) => a + i), half = (arr) => '<div class="half">' + arr.map(btn).join('') + '</div>';
    const row = (L, R) => '<div class="jaw">' + half(L) + '<div class="mid"></div>' + half(R) + '</div>';
    return '<div class="formula mini"><div class="fh"><span class="fl">' + esc(title) + '</span><span class="fs">' + esc(sel.slice().sort().map(API.fmtTooth).join(', ')) + '</span>' + (!sel.length && need ? badge('bad', 'выберите зубы') : '') + (extra || '') + '</div>' +
      row(r(11, 8).reverse(), r(21, 8)) + '<div class="occl"></div>' + row(r(41, 8).reverse(), r(31, 8)) + '</div>';
  }
  // мини-формула отдельной услуги. compact: выбранные зубы свёрнуты в строку «… Изменить»; пусто — формула открыта
  function renderToothSet(pr, API) {
    const p = SS.params, sel = (p[pr.key] || []).map(String).sort(), hl = pr.hl ? pr.hl(p, SS.teeth) : [];
    let at = pr.auto && !SS.touched[pr.key] ? (typeof pr.autoText === 'function' ? pr.autoText(p, SS.teeth) : pr.autoText) : '';
    if (at && !sel.length) at = '';
    const autoH = at ? '<span class="auto">● ' + esc(at) + '</span>' : '';
    const hlH = pr.hlText && hl.length ? '<div class="hint" style="margin:-2px 4px 6px">пунктир — ' + esc(pr.hlText) + '</div>' : '';
    if (pr.compact) {
      const open = SS.tsOpen[pr.key] || !sel.length;
      if (!open) return '<div class="tsr"><span class="flbl">' + esc(pr.label) + '</span><span class="fs">' + esc(sel.map(API.fmtTooth).join(', ')) + '</span>' + autoH + '<button class="link" data-stso="' + pr.key + '">Изменить</button></div>';
      return teethGrid(API, sel, 'data-sts="' + pr.key + '"', pr.label, true, hl, (autoH ? ' ' + autoH : '') + (sel.length ? '<button class="link" data-stso="' + pr.key + '">Готово</button>' : '')) + hlH;
    }
    return teethGrid(API, sel, 'data-sts="' + pr.key + '"', pr.label, true, hl) + hlH + (at ? '<div class="hint" style="margin:-4px 4px 8px">● ' + esc(at) + '</div>' : '');
  }
  // плашки-счётчики: клик по плашке +1, «−» убирает одну; total — итог по vol (кость, см³)
  function renderStock(pr) {
    const v = SS.params[pr.key] || {}; let total = 0, any = false;
    const rows = pr.rows.map((r) => '<div class="stkr"><span class="stkl">' + esc(r.l) + '</span><div class="stkc">' + r.items.map((it) => {
      const n = +v[it.id] || 0, a = pr.key + '|' + it.id; total += n * (it.vol || 0); if (n) any = true;
      return '<span class="stk' + (n ? ' on' : '') + '"><button data-sstk="' + a + '">' + esc(it.l) + (n ? ' <b>×' + n + '</b>' : '') + '</button>' + (n ? '<button class="m" data-sstkm="' + a + '" title="Убрать одну">−</button>' : '') + '</span>';
    }).join('') + '</div></div>').join('');
    return '<div class="stock">' + rows + (pr.total && total ? '<div class="stkt">Итого: ' + String(+total.toFixed(1)).replace('.', ',') + ' ' + esc(pr.unit || '') + '</div>' : '') +
      (!any && !pr.optional ? '<div>' + badge('bad', pr.needText || 'выберите') + '</div>' : '') + '</div>';
  }
  // раскрывающийся блок: выключатель в заголовке, внутри — поля с grp === key
  function renderGroup(pr, all, API) {
    const on = !!SS.params[pr.key], kids = all.filter((x) => x.grp === pr.key);
    const n = kids.filter((k) => k.type === 'toggle' && SS.params[k.key]).length;
    const sum = pr.summary ? pr.summary(SS.params) : n ? n + ' ' + plural(n, 'позиция', 'позиции', 'позиций') : '';
    return '<div class="grp' + (on ? ' on' : '') + '"><div class="gh"><span class="gt">' + esc(pr.label) + '</span>' + (on && sum ? '<span class="gn">' + esc(sum) + '</span>' : '') +
      '<button class="tg ' + (on ? 'on' : '') + '" data-stg="' + pr.key + '"></button></div>' + (on ? '<div class="gb">' + kids.map((k) => renderP(k, API)).join('') + '</div>' : '') + '</div>';
  }
  function renderP(pr, API) { const h = renderParam(pr, API); return pr.sub && h ? '<div class="gsub">' + h + '</div>' : h; }
  const renderList = (params, API) => params.filter((pr) => !pr.grp).map((pr) => (pr.type === 'group' ? renderGroup(pr, params, API) : renderP(pr, API))).join('');
  function renderParam(pr, API) {
    const p = SS.params, v = p[pr.key];
    if (pr.show && !pr.show(p)) return '';
    const TY = (D.TYPES || {})[pr.type];
    if (TY && TY.render) return TY.render(pr, p, { API, esc, badge });
    if (pr.type === 'teethPick') return renderTeeth(API, pr.label);
    if (pr.type === 'toothSet') return renderToothSet(pr, API);
    if (pr.type === 'stock') return renderStock(pr);
    if (pr.type === 'teethCards') return renderCards(pr, API);
    if (pr.type === 'canals') return renderCanals(pr, API);
    const auto = pr.auto && !SS.touched[pr.key] && SS.teeth.length ? '<br><span class="auto">● по зубам</span>' : '';
    let ctl = '';
    if (pr.type === 'seg') ctl = segH('data-sseg="' + pr.key + '"', pr.options, v);
    if (pr.type === 'seg' && pr.wide) return '<div class="wrow"><div class="flbl">' + esc(pr.label) + '</div>' + ctl + '</div>';
    else if (pr.type === 'toggle') ctl = '<button class="tg ' + (v ? 'on' : '') + '" data-stg="' + pr.key + '"></button>';
    else if (pr.type === 'opt') ctl = optH('data-sopt="' + pr.key + '"', 'data-soptv="' + pr.key + '"', pr.options, v);
    // «укажите» — слева от счётчика: когда надпись пропадает, кнопки не сдвигаются (счётчик прижат вправо)
    else if (pr.type === 'counter') ctl = '<div class="cnt">' + (v == null && pr.need ? badge('bad', 'укажите') : '') + '<button data-scnt="' + pr.key + '" data-d="-1">−</button><b>' + (v == null ? '—' : +v || 0) + '</b><button data-scnt="' + pr.key + '" data-d="1">+</button><span>' + esc(pr.unit || '') + '</span></div>';
    else if (pr.type === 'perTooth') {
      const tt = (pr.teethFrom ? (p[pr.teethFrom] || []) : SS.teeth).map(String);
      if (!tt.length) return pr.teethFrom ? '' : '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', 'отметьте зубы') + '</div></div>';
      ctl = tt.slice().sort().map((t) => '<div class="ptm">' + (tt.length > 1 || pr.teethFrom ? '<span class="tchip">' + API.fmtTooth(t) + '</span>' : '') + '<div class="seg">' + pr.options.map((o) => '<button data-spt="' + pr.key + '" data-t="' + t + '" data-v="' + esc(o.v) + '" class="' + ((v || {})[t] === o.v ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div></div>').join('');
    }
    if (pr.type === 'perTooth' && pr.wide) return '<div class="wrow"><div class="flbl">' + esc(pr.label) + '</div>' + ctl + '</div>';
    return '<div class="row"><label>' + esc(pr.label) + auto + '</label><div>' + ctl + '</div></div>';
  }

  // активные состояния по зубам (живая формула, иначе формула страницы): { '36': ['crown:dentin_caries', …] }
  function fStates(API) {
    const j = baseJson(API);
    const out = {}, T = (j && j.permanentTeeth) || {};
    Object.keys(T).forEach((t) => { const L = (T[t] || {}).locations || {};
      Object.keys(L).forEach((l) => Object.keys((L[l] || {}).states || {}).forEach((k) => { if ((L[l].states[k] || {}).isActive) (out[t] = out[t] || []).push(l + ':' + k); })); });
    return out;
  }
  // то же, но null, если формулы нет совсем (для ортопедии: «нет формулы» ≠ «все зубы здоровы»)
  // формула для подсказок: в плане — виртуальная, иначе живая из SQNS или формула страницы
  function baseJson(API) {
    if (CTX.plan) return CTX.formula || null;
    const comp = fComp(), pg = API && API.page && API.page();
    return (comp && fJson(comp)) || (pg && pg.formula) || null;
  }
  function fInfo(API) {
    const j = baseJson(API);
    return j && j.permanentTeeth && Object.keys(j.permanentTeeth).length ? fStates(API) : null;
  }
  // подсказка сценария: зубы, подходящие по формуле, — пунктиром (только подсветка)
  function hintTeeth(API) {
    const sc = scnById(SS.scn); if (!sc || !sc.hint) return [];
    try { const st = fStates(API); return Object.keys(st).filter((t) => sc.hint.test(st[t])); } catch (e) { return []; }
  }
  function renderTeeth(API, title) {
    const M = API.marks(), sc = scnById(SS.scn), H = hintTeeth(API);
    const lbl = (t) => (!M ? { txt: t, cls: '' } : M.missing.includes(t) ? { txt: '0', cls: ' miss' } : M.implant.includes(t) ? { txt: 'И', cls: ' impl' } : { txt: t, cls: '' });
    const btn = (t) => { t = String(t); const L = lbl(t); return '<button class="tb' + L.cls + (SS.teeth.includes(t) ? ' on' : H.includes(t) ? ' dv' : '') + '" data-stooth="' + t + '" title="' + t + '">' + L.txt + '</button>'; };
    const r = (a, z) => Array.from({ length: z }, (_, i) => a + i), half = (arr) => '<div class="half">' + arr.map(btn).join('') + '</div>';
    const row = (L, R) => '<div class="jaw">' + half(L) + '<div class="mid"></div>' + half(R) + '</div>';
    const sel = SS.teeth.slice().sort().map(API.fmtTooth).join(', ');
    const hintH = H.length && sc && sc.hint ? '<div class="ff"><span class="hint">пунктир — ' + esc(sc.hint.text) + '</span></div>' : '';
    return '<div class="formula"><div class="fh"><span class="fl">' + esc(title || 'Зубы') + '</span><span class="fs">' + esc(sel) + '</span>' + (SS.teeth.length ? '<button class="link" data-sclear="1">Сбросить</button>' : badge('bad', 'выберите зубы')) + '</div>' +
      row(r(11, 8).reverse(), r(21, 8)) + '<div class="occl"></div>' + row(r(41, 8).reverse(), r(31, 8)) +
      (M && (M.missing.length || M.implant.length) ? '<div class="ff"><span class="hint">формула пациента: 0 — нет зуба, И — имплантат</span></div>' : '') + hintH + '</div>';
  }

  // разделы, разрешённые текущему врачу (настройки врача в doctors.js)
  const catOk = (id) => { const D2 = globalThis.SQNSMZ_DOCTORS; return !D2 || D2.allowed(id); };
  function render(API) {
    const okScn = (x) => x && catOk(x.cat || 'all');
    if (CTX.plan) { if (!SS) SS = fresh(null); }
    else if (!SS || !okScn(scnById(SS.scn))) {
      const last = lsGet(), first = SCENARIOS.find(okScn) || SCENARIOS[0];
      SS = fresh(okScn(scnById(last)) ? last : first.id); OPEN_CAT = undefined;
    }
    const CATS = CATS_ALL.filter((c) => catOk(c.id));
    const sc = scnById(SS.scn);
    // свои типы полей (ортопедия): один раз подтянуть формулу SQNS
    if (sc) sc.params.forEach((pr) => { const TY = (D.TYPES || {})[pr.type]; if (TY && TY.prepare && TY.prepare(SS.params[pr.key], () => fInfo(API))) autoParams(SS); });
    let h = '';
    // выбор сценария: разделы → список шаблонов (подгруппы — sub)
    if (OPEN_CAT === undefined) OPEN_CAT = sc ? sc.cat : null;
    const PL = CTX.plan;
    h += '<div class="sec"><h2>Что делаем</h2><div class="card"><div class="cats" style="grid-template-columns:repeat(' + Math.max(1, CATS.length) + ',1fr)">' + CATS.map((c) => {
      const has = sc && sc.cat === c.id;
      return '<button class="cat' + (OPEN_CAT === c.id ? ' open' : '') + (has ? ' has' : '') + '" data-scat="' + c.id + '"><span class="ti-ic">' + c.icon + '</span><span class="ti-t">' + esc(c.title) + '</span>' + (SCENARIOS.filter((x) => (x.cat || 'all') === c.id).length === 1 ? '' : '<span class="cv">' + (OPEN_CAT === c.id ? '▴' : '▾') + '</span>') + '</button>';
    }).join('') + '</div>';
    const oc = CATS.find((c) => c.id === OPEN_CAT);
    if (oc) {
      const list = SCENARIOS.filter((x) => (x.cat || 'all') === oc.id);
      const tile = (x) => '<button class="tile' + (x.id === SS.scn ? ' on' : '') + '" data-sscn="' + x.id + '"><span class="ti-ic">' + x.icon + '</span><span class="ti-t">' + esc(x.title) + '</span></button>';
      const subs = [...new Set(list.map((x) => x.sub || ''))];
      if (list.length !== 1) h += '<div class="catl">' + (list.length ? subs.map((sb) => (sb ? '<div class="csub">' + esc(sb) + '</div>' : '') + '<div class="tiles">' + list.filter((x) => (x.sub || '') === sb).map(tile).join('') + '</div>').join('')
        : '<div class="hint">' + esc(oc.empty || 'Сценариев пока нет.') + '</div>') + '</div>';
    }
    h += '</div></div>';
    if (SS.done && !PL) {
      h += '<div class="sec"><div class="card done"><b>Добавлено в визит: ' + SS.done.length + '</b>' +
        (SS.fText && SS.fText.length ? '<div class="fdiff" style="margin-top:8px"><div class="flbl">Внесено в зубную формулу</div>' + fDiffH(SS.fText) + '</div>' : '') +
        '<div class="hint" style="margin:6px 0 0">Проверьте строки услуг' + (SS.fText && SS.fText.length ? ' и формулу' : '') + ' и нажмите «Сохранить» в визите. Дневник теперь можно заполнить по этим услугам.</div>' +
        (globalThis.SQNSMZ_PRINT && catOk('print') ? '<div style="margin-top:8px"><button class="vd-b" id="svcact" title="Акт по всем услугам визита">🖨 Акт выполненных работ</button></div>' : '') + '</div></div>';
    }
    if (sc) {
      h += '<div class="sec"><h2>' + esc(sc.icon + ' ' + sc.title) + '</h2><div class="card">' + (sc.needTeeth && !sc.params.some((x) => x.type === 'teethPick') ? renderTeeth(API, sc.teethTitle) : '') + renderList(sc.params, API) + '</div></div>';
      const L = lines(); let total = 0, missingPrice = false;
      h += '<div class="sec"><h2>' + (PL ? 'В этап' : 'Будет добавлено') + '</h2><div class="card cart">' + (L.length ? L.map((l) => {
        const c = CARD[l.id]; if (!c) whenCard(l.id, API.rerender);
        const price = c ? parseFloat(c.price) || 0 : null; if (!l.skip) { if (price == null) missingPrice = true; else total += price * l.qty; }
        return '<div class="cl' + (l.skip ? ' skip' : '') + '"><div><div class="cd">' + esc(l.code) + '</div>' + esc(l.name) +
          ((l.teeth || []).length ? ' ' + l.teeth.slice().sort().map((t) => '<span class="tchip">' + API.fmtTooth(t) + '</span>').join(' ') : '') +
          (l.skip ? ' ' + badge('ok', l.skip) : l.dup ? ' ' + badge('warn', 'такая строка уже есть') : '') + '</div><div class="q">× ' + l.qty + '</div><div class="pr">' + (l.skip ? '—' : price == null ? '…' : rub(price * l.qty)) + '</div></div>';
      }).join('') + '<div class="tot"><span>Итого</span><span>' + (missingPrice ? '…' : rub(total)) + '</span></div>' : '<div class="hint">Пока нечего добавлять</div>') + '</div></div>';
      // зубная формула: переключатель (по умолчанию вкл.) и что изменится
      if (sc.formula && !SS.done && !PL) {
        const F = formulaPlan(), T = F.ok ? changesText(F.j, F.ch, API) : [];
        h += '<div class="sec"><h2>Зубная формула</h2><div class="card"><div class="row" style="grid-template-columns:1fr auto;margin:0"><label>Внести изменения в зубную формулу</label><div><button class="tg ' + (SS.fon ? 'on' : '') + '" data-sfon="1"></button></div></div>' +
          (!SS.fon ? '' : !F.ok ? '<div style="margin-top:6px">' + badge('warn', F.why || 'формула недоступна') + '</div>'
            : T.length ? '<div class="fdiff">' + fDiffH(T) + '</div>' : '<div class="hint" style="margin:6px 0 0">' + (SS.teeth.length || !sc.needTeeth ? 'Всё уже отмечено — менять нечего' : 'Отметьте зубы') + '</div>') +
          '</div></div>';
      }
      const iss = (sc.check ? sc.check(effParams(), SS.teeth, { touched: SS.touched }) : []);
      if (!PL && !visitForm()) iss.unshift({ lvl: 'bad', text: 'Визит не открыт: откройте визит пациента на вкладке «История болезни»' });
      if (SS.error) iss.unshift({ lvl: 'bad', text: SS.error });
      if (iss.length) h += '<div class="sec"><h2>Проверка</h2><div class="iss">' + iss.map((i) => '<div class="' + i.lvl + '">' + (i.lvl === 'bad' ? '⛔' : '⚠️') + ' ' + esc(i.text) + '</div>').join('') + '</div></div>';
      SS._bad = iss.some((i) => i.lvl === 'bad' && i.text !== SS.error) || !L.some((l) => !l.skip);
    }
    if (!PL) h += discCard();
    if (PL) return { body: h, foot: '', bad: !sc || !!SS._bad };
    // после добавления следующий шаг — дневник: он становится главной кнопкой
    const foot = SS.done && !SS.busy
      ? '<button class="btn sec2" id="svcundo">↶ Отменить</button><button class="btn sec2" id="svcadd"' + (SS._bad ? ' disabled' : '') + '>＋ Добавить ещё</button><button class="btn pri" id="svcdiary">📝 Заполнить дневник →</button>'
      : '<button class="btn pri" id="svcadd"' + (SS._bad || SS.busy ? ' disabled' : '') + '>' + (SS.busy ? 'Добавляю…' : 'Добавить в визит') + '</button>';
    return { body: h, foot };
  }

  function bind(P, API) {
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    const touch = (k) => { SS.touched[k] = 1; };
    const re = () => { autoParams(SS); API.rerender(); };
    const prOf = (k) => scnById(SS.scn).params.find((x) => x.key === k);
    // карточка зуба: "ключ|зуб|поле" → { c (значения зуба), f (описание поля) }
    const cell = (s) => { const [k, t, fk] = s.split('|'); const pr = prOf(k); const c = SS.params[k][t]; return { c, f: pr.fields.find((x) => x.key === fk), t, fk }; };
    const pickScn = (id) => {   // зубы и вручную заданные каналы переходят в новый шаблон
      const keep = SS.teeth.slice(), ck = canalsKey(scnById(SS.scn)), canals = ck ? Object.assign({}, SS.params[ck]) : null, ct = Object.assign({}, SS.ctouched);
      SS = fresh(id); SS.teeth = keep; const nk = canalsKey(scnById(SS.scn));
      if (nk && canals) { SS.params[nk] = canals; SS.ctouched = ct; }
      autoParams(SS); lsSet(SS.scn); API.rerender(); };
    on('[data-sscn]', 'click', (e) => pickScn(e.currentTarget.dataset.sscn));
    on('[data-stooth]', 'click', (e) => { const t = e.currentTarget.dataset.stooth; SS.teeth = SS.teeth.includes(t) ? SS.teeth.filter((x) => x !== t) : SS.teeth.concat(t); SS.done = null; re(); });
    on('[data-sts]', 'click', (e) => { const k = e.currentTarget.dataset.sts, t = e.currentTarget.dataset.t, a = (SS.params[k] || []).slice();
      SS.params[k] = a.includes(t) ? a.filter((x) => x !== t) : a.concat(t); touch(k); SS.tsOpen[k] = true; re(); });
    on('[data-stso]', 'click', (e) => { const k = e.currentTarget.dataset.stso; SS.tsOpen[k] = !SS.tsOpen[k]; API.rerender(); });
    on('[data-sstk]', 'click', (e) => { const [k, id] = e.currentTarget.dataset.sstk.split('|'); const m = SS.params[k] = SS.params[k] || {}; m[id] = Math.min(20, (+m[id] || 0) + 1); touch(k); re(); });
    on('[data-sstkm]', 'click', (e) => { const [k, id] = e.currentTarget.dataset.sstkm.split('|'); const m = SS.params[k] = SS.params[k] || {}; m[id] = (+m[id] || 0) - 1; if (m[id] <= 0) delete m[id]; touch(k); re(); });
    on('[data-sclear]', 'click', () => { SS.teeth = []; re(); });
    on('[data-sfon]', 'click', () => { SS.fon = !SS.fon; API.rerender(); });
    on('[data-sseg]', 'click', (e) => { const k = e.currentTarget.dataset.sseg; SS.params[k] = e.currentTarget.dataset.v; touch(k); re(); });
    on('[data-stg]', 'click', (e) => { const k = e.currentTarget.dataset.stg; SS.params[k] = !SS.params[k]; touch(k); re(); });
    on('[data-sopt]', 'click', (e) => { const k = e.currentTarget.dataset.sopt, pr = prOf(k); SS.params[k] = SS.params[k] ? null : (pr.onDefault || pr.default || pr.options[0].v); touch(k); re(); });
    on('[data-soptv]', 'click', (e) => { const k = e.currentTarget.dataset.soptv; SS.params[k] = e.currentTarget.dataset.v; touch(k); re(); });
    on('[data-scnt]', 'click', (e) => { const k = e.currentTarget.dataset.scnt, pr = prOf(k), d = +e.currentTarget.dataset.d;
      if (SS.params[k] == null && d < 0) return;                       // счётчик без значения: «−» ничего не делает
      SS.params[k] = Math.max(pr.min || 0, Math.min(pr.max || 99, (SS.params[k] == null ? 0 : +SS.params[k]) + d)); touch(k); re(); });
    on('[data-spt]', 'click', (e) => { const d = e.currentTarget.dataset; SS.params[d.spt] = SS.params[d.spt] || {}; SS.params[d.spt][d.t] = d.v; re(); });
    on('[data-ctg]', 'click', (e) => { const x = cell(e.currentTarget.dataset.ctg); x.c[x.fk] = !x.c[x.fk]; re(); });
    on('[data-copt]', 'click', (e) => { const x = cell(e.currentTarget.dataset.copt); x.c[x.fk] = x.c[x.fk] ? null : (x.f.onDefault || x.f.options[0].v); re(); });
    on('[data-coptv]', 'click', (e) => { const x = cell(e.currentTarget.dataset.coptv); x.c[x.fk] = e.currentTarget.dataset.v; re(); });
    on('[data-scat]', 'click', (e) => {
      const c = e.currentTarget.dataset.scat, list = SCENARIOS.filter((x) => (x.cat || 'all') === c);
      // в разделе один шаблон (ортопедия) — клик по разделу сразу открывает его
      if (list.length === 1) { OPEN_CAT = c; if (SS.scn !== list[0].id) pickScn(list[0].id); else API.rerender(); return; }
      OPEN_CAT = OPEN_CAT === c ? null : c; API.rerender(); });
    on('[data-cseg]', 'click', (e) => { const x = cell(e.currentTarget.dataset.cseg); x.c[x.fk] = e.currentTarget.dataset.v; re(); });
    on('[data-ccount]', 'click', (e) => { const x = cell(e.currentTarget.dataset.ccount), N = canalsOf(SS, x.t);
      x.c[x.fk] = Math.max(0, Math.min(N, (+x.c[x.fk] || 0) + +e.currentTarget.dataset.d)); x.c._t[x.fk] = 1; re(); });
    on('[data-csplit]', 'click', (e) => { const x = cell(e.currentTarget.dataset.csplit), v = e.currentTarget.dataset.v, N = canalsOf(SS, x.t), s = x.c[x.fk];
      if (v === 'mix' && s.mode !== 'mix') { s.n = {}; x.f.options.forEach((o, i) => { s.n[o.v] = s.mode === o.v ? N : (!s.mode && i === 0 && x.f.options.length === 2 ? N : 0); }); }
      s.mode = v; re(); });
    on('[data-cspc]', 'click', (e) => { const [k, t, fk, ov] = e.currentTarget.dataset.cspc.split('|'); const x = cell(k + '|' + t + '|' + fk), s = x.c[fk], N = canalsOf(SS, t);
      const opts = x.f.options.map((o) => o.v), d = +e.currentTarget.dataset.d;
      const nv = Math.max(0, Math.min(N, (+s.n[ov] || 0) + d));
      if (opts.length === 2) { const other = opts.find((o) => o !== ov); s.n[ov] = nv; s.n[other] = N - nv; }
      else s.n[ov] = nv;
      re(); });
    on('[data-canal]', 'click', (e) => { const [k, t] = e.currentTarget.dataset.canal.split('|'); const pr = prOf(k);
      SS.params[k][t] = Math.max(pr.min || 1, Math.min(pr.max || 6, (+SS.params[k][t] || 1) + +e.currentTarget.dataset.d)); SS.ctouched[t] = 1; re(); });
    on('[data-cmore]', 'click', (e) => { const t = e.currentTarget.dataset.cmore; SS.more[t] = !SS.more[t]; API.rerender(); });
    const fill = (s) => { const [k, t, i] = s.split('|'); const f = prOf(k).fields.find((x) => x.type === 'fillings'); return { list: SS.params[k][t][f.key], i: +i, f }; };
    on('[data-fmat]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fmat), it = x.list[x.i]; it.mat = e.currentTarget.dataset.v;
      const cls = x.f.classes[it.mat]; if (!cls || !cls.includes(it.cls)) it.cls = ''; re(); });
    on('[data-fcls]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fcls); x.list[x.i].cls = e.currentTarget.dataset.v; re(); });
    on('[data-fdel]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fdel); if (x.list.length > 1) x.list.splice(x.i, 1); re(); });
    on('[data-fadd]', 'click', (e) => { const [k, t] = e.currentTarget.dataset.fadd.split('|'); const f = prOf(k).fields.find((x) => x.type === 'fillings');
      const list = SS.params[k][t][f.key]; if (list.length < (f.max || 3)) list.push({ mat: (f.materials[0] || {}).v, cls: '' }); re(); });
    // свои типы полей: reset(keys) — вернуть поля к умолчаниям (и снова считать автоматически), touch(keys) — отметить как заданные врачом
    const tyCtx = {
      reset: (keys) => { const sc = scnById(SS.scn); keys.forEach((k) => { const pr = sc.params.find((x) => x.key === k); if (!pr) return; delete SS.touched[k];
        SS.params[k] = pr.default !== undefined ? clone(pr.default) : pr.type === 'toggle' ? false : pr.type === 'counter' ? (pr.min || 0) : pr.type === 'stock' ? {} : null; }); },
      touch: (keys) => keys.forEach((k) => { SS.touched[k] = 1; }),
    };
    (scnById(SS.scn) || { params: [] }).params.forEach((pr) => { const TY = (D.TYPES || {})[pr.type]; if (TY && TY.bind) TY.bind(P, pr, SS.params, re, tyCtx); });
    on('[data-vd]', 'click', (e) => { const a = e.currentTarget.dataset.vd; if (a === 'apply') { applyVisitDisc(API); return; } VD = { open: a === 'open', mode: null, v: '' }; API.rerender(); });
    const vdIn = (mode, other) => (e) => { VD.mode = mode; VD.v = e.target.value; const o = P.querySelector(other); if (o) o.value = ''; const b = P.querySelector('[data-vd="apply"]'); if (b) b.disabled = false; };
    on('[data-vdp]', 'input', vdIn('pct', '[data-vds]'));
    on('[data-vds]', 'input', vdIn('sum', '[data-vdp]'));
    on('[data-vdp],[data-vds]', 'keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') applyVisitDisc(API); });
    const add = P.querySelector('#svcadd'); if (add) add.onclick = () => doAdd(API);
    const undo = P.querySelector('#svcundo'); if (undo) undo.onclick = () => doUndo(API);
    const act = P.querySelector('#svcact'); if (act) act.onclick = async () => { act.disabled = true; try { await globalThis.SQNSMZ_PRINT.printAct(API); } finally { act.disabled = false; } };
    const dia = P.querySelector('#svcdiary'); if (dia) dia.onclick = () => API.gotoDiary();
  }

  async function doAdd(API) {
    if (SS.busy) return;
    SS.busy = true; SS.error = ''; API.rerender();
    const created = [];
    try {
      await showVisitTab();
      const vf = visitForm(); if (!vf) throw new Error('Визит не открыт');
      const L = lines().filter((l) => !l.skip);
      for (const l of L) {
        const rec = await loadCard(l.id);
        if (!rec) throw new Error('Не нашёл в SQNS услугу ' + l.code + ' (id ' + l.id + ')');
        created.push(await addOne(vf, l, rec));
      }
      SS.done = created; SS.vf = vf;
      // зубная формула — только если все услуги добавились
      let fMsg = '';
      SS.fch = null; SS.fText = null;
      if (SS.fon) {
        const F = formulaPlan();
        if (F.ok && F.ch.length) {
          try { applyChanges(F.comp, F.ch); SS.fch = F.ch; SS.fComp = F.comp; SS.fText = changesText(F.j, F.ch, API); fMsg = ', зубная формула обновлена'; }
          catch (e) { console.warn('[Медзапись] запись формулы', e); fMsg = '. Формулу обновить не удалось'; }
        } else if (!F.ok && F.why) fMsg = '. Формула на странице не найдена — не обновлена';
      }
      API.toast('Добавлено услуг: ' + created.length + fMsg + '. Проверьте и сохраните визит.', 'ok');
    } catch (e) {
      SS.error = String(e && e.message || e); SS.done = created.length ? created : null; SS.vf = visitForm();
      API.toast('Ошибка: ' + SS.error, 'bad');
    }
    SS.busy = false; API.rebuild(); API.rerender();
  }
  function doUndo(API) {
    const vf = SS.vf || visitForm(); if (!vf || !SS.done) return;
    SS.done.forEach((it) => { try { vf.removeRow(it); } catch (e) { /* */ } });
    applyRoot(vf);
    let fMsg = '';
    if (SS.fch && SS.fch.length) {
      const comp = (SS.fComp && !SS.fComp.$$destroyed) ? SS.fComp : fComp();
      try { if (!comp) throw new Error('нет формулы'); applyChanges(comp, invert(SS.fch)); fMsg = ', изменения формулы отменены'; }
      catch (e) { fMsg = '. Формулу вернуть не удалось — проверьте её вручную'; }
    }
    SS.done = null; SS.fch = null; SS.fText = null; API.rebuild(); API.rerender(); API.toast('Добавленные строки удалены' + fMsg, 'ok');
  }

  /* ---------------- для вкладки «План» (plan.js) ---------------- */
  // Состояние блока сохраняется в рецепте плана (комментарий плана SQNS) — только данные, без служебных ссылок
  const KEEP = ['scn', 'teeth', 'params', 'touched', 'ctouched', 'more', 'tsOpen', 'fon'];
  function stateJSON(st) { const o = {}; KEEP.forEach((k) => { if (st[k] !== undefined) o[k] = clone(st[k]); }); return o; }
  function stateFrom(o) {
    const st = fresh(o && o.scn && scnById(o.scn) ? o.scn : null);
    if (o) KEEP.slice(1).forEach((k) => { if (o[k] !== undefined) st[k] = clone(o[k]); });
    autoParams(st); return st;
  }
  function withState(st, fn) { const prev = SS; SS = st; try { return fn(); } finally { SS = prev; } }
  // строки, сумма и проблемы текущего (или переданного) состояния; цены догружаются, onPrice — перерисовать
  function cartOf(onPrice) {
    const sc = scnById(SS.scn); if (!sc) return { lines: [], total: 0, missing: false, bad: true, issues: [] };
    const L = lines().filter((l) => !l.skip); let total = 0, missing = false;
    L.forEach((l) => { const c = CARD[l.id]; if (!c) { missing = true; if (onPrice) whenCard(l.id, onPrice); else loadCard(l.id); } else total += (parseFloat(c.price) || 0) * l.qty; });
    const iss = sc.check ? sc.check(effParams(), SS.teeth, { touched: SS.touched }) : [];
    return { lines: L, total, missing, issues: iss, bad: iss.some((i) => i.lvl === 'bad') || !L.length };
  }
  function formulaOps() { const sc = scnById(SS.scn); if (!sc || !sc.formula) return []; try { return sc.formula(effParams(), SS.teeth.slice().sort()) || []; } catch (e) { return []; } }
  // применить изменения к копии формулы (виртуальная формула плана)
  function applyToJson(j, ops) {
    formulaChanges(j, ops).forEach((c) => { const T = toothOf(j, c.t); const L = T && T.locations && T.locations[c.loc]; if (L && L.states && L.states[c.st]) L.states[c.st].isActive = c.on; });
    return j;
  }
  // вход в план: состояние вкладки «Услуги» откладывается и возвращается при выходе (SS и раздел общие)
  let VISIT = null;
  const PLAN = {
    setCtx: (c) => { if (!CTX.plan) VISIT = { SS, OPEN_CAT }; CTX = Object.assign({ formula: null, stageItems: [] }, c || {}, { plan: true }); },
    leave: () => { if (!CTX.plan) return; SS = VISIT ? VISIT.SS : null; OPEN_CAT = VISIT ? VISIT.OPEN_CAT : undefined; VISIT = null; CTX = { plan: false, formula: null, stageItems: [] }; },
    inPlan: () => CTX.plan,
    getState: () => SS, setState: (st) => { SS = st; }, fresh: (id) => fresh(id), stateJSON, stateFrom, withState,
    cartOf, formulaOps, applyToJson, liveFormula: (API) => { const comp = fComp(); return (comp && fJson(comp)) || ((API && API.page && API.page()) || {}).formula || null; },
    scnById, SCENARIOS, CATS: CATS_ALL, SVC, CARD, loadCard, normCode, catOk,
    setOpenCat: (v) => { OPEN_CAT = v; },
  };

  globalThis.SQNSMZ_SVCVIEW = { css: CSS, render, bind, plan: PLAN, _test: { lines: () => lines(), state: () => SS, reset: () => { SS = null; }, CARD, formulaChanges, formulaPlan, changesText, hintTeeth: (API) => hintTeeth(API) } };
})();
