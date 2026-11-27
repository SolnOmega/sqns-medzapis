/* SQNS · Помощник медзаписи — ДВИЖОК (панель, чтение и запись данных SQNS).
 * Шаблоны и настройки — в templates.js.
 */
(function () {
  'use strict';
  const C = globalThis.SQNSMZ_CONFIG;
  if (!C) { console.error('[Медзапись] templates.js не загружен'); return; }
  const { POSITIONS, POSITION_BY_CODE, SERVICE_RULES, DEFAULT_DURATION, ADMISSION_CONDITION, DIAG_DEFAULTS, fmtTooth, TEMPLATES } = C;
  const ruleFor = (s) => SERVICE_RULES.find((r) => s.code.startsWith(r.code) && (!r.name || r.name.test(s.name)));

  /* =====================================================================
   *  3. ДОСТУП К ДАННЫМ SQNS (AngularJS)
   * ===================================================================== */

  const DIARY_MAP = {           // наше поле → handle раздела дневника
    diagnosis: 'diagnosis', complaints: 'complaints', anamnesisVitae: 'generalAnamnesis', objective: 'objectively',
    statusLocalis: 'statusLocalis', treatment: 'treatment', recommendations: 'recommendations', prognosis: 'prognosis',
    anamnesisMorbi: 'dentalHistory', xray: 'xray',
  };
  const DIARY_LABELS = {
    complaints: 'Жалобы', anamnesisMorbi: 'Анамнез стоматологический', anamnesisVitae: 'Общий анамнез', objective: 'Объективно',
    statusLocalis: 'Status localis', xray: 'Рентгенологически', diagnosis: 'Диагноз', treatment: 'Лечение', recommendations: 'Рекомендации', prognosis: 'Прогноз',
  };
  const EGISZ_FIELDS = [
    ['patientComplaints', 'Жалобы пациента'], ['anamnesisDisease', 'Анамнез заболевания'], ['anamnesisLife', 'Анамнез жизни'],
    ['objectively', 'Объективно'], ['conclusion', 'Заключение'], ['regimenAndRecommendations', 'Режим и рекомендации'],
  ];

  const ng = () => window.angular;
  const scopeOf = (el) => { try { return ng().element(el).scope(); } catch (e) { return null; } };
  const LAT = { 'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'Т': 'T', 'Х': 'X' };
  const normCode = (name) => ((name || '').trim().split(/\s+/)[0] || '').replace(/[АВСЕКМНОРТХ]/g, (c) => LAT[c]);

  const ENGINE_VERSION = '1.8.3';
  // В визите может быть несколько дневников: SQNS держит их все на странице (каждый со своим journalIndex).
  // Какой открыт, по странице не понять, поэтому: выбранный в панели → иначе последний пустой → иначе последний.
  let JPICK = null;   // индекс дневника, выбранный врачом в панели
  const jEmpty = (j) => !(j.journalItems || []).some((it) => String(it.content || '').replace(/<[^>]+>|&nbsp;|\s/g, ''));
  function allJournals() {
    const out = [];
    document.querySelectorAll('.egisz-fields-list__semd').forEach((eg) => {
      const s2 = scopeOf(eg); const js = s2 && s2.form && s2.form.journals; const j2 = js && js[s2.journalIndex];
      if (j2 && j2.journalItems && !out.some((x) => x.j === j2)) out.push({ sc: s2, j: j2, idx: s2.journalIndex, all: js });
    });
    if (!out.length) document.querySelectorAll('[ng-controller="JournalItemController"]').forEach((ji) => {
      const s2 = scopeOf(ji); if (s2 && s2.journal && s2.journal.journalItems && !out.some((x) => x.j === s2.journal)) out.push({ sc: s2, j: s2.journal, idx: out.length, all: null });
    });
    return out.sort((a, b) => a.idx - b.idx);
  }
  function getCtx() {
    if (!ng()) return null;
    const L = allJournals(); if (!L.length) return null;
    let c = JPICK != null ? L.find((x) => x.idx === JPICK) : null;
    if (!c) c = L.slice().reverse().find((x) => jEmpty(x.j)) || L[L.length - 1];
    return { sc: c.sc, j: c.j, d: c.j.signableDocJournalInfoData || null, idx: c.idx, list: L };
  }

  function getServices() {
    return [...document.querySelectorAll('tr[ng-controller="VisitServiceItemController"]')].map((tr) => {
      const s = scopeOf(tr), it = s && s.item;
      if (!it || !it.name) return null;
      return { name: it.name, code: normCode(it.name), teeth: (it.teeth || []).map(String), qty: +it.qty || 1 };
    }).filter(Boolean);
  }

  function apply(sc, fn) {
    const root = sc.$root || sc;
    if (root.$$phase) fn(); else sc.$apply(fn);
  }

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const htmlToText = (h) => { const d = document.createElement('div'); d.innerHTML = h || ''; return (d.innerText || d.textContent || '').trim(); };
  const textToHtml = (t) => t.split(/\n+/).filter((x) => x.trim()).map((x) => '<p>' + esc(x) + '</p>').join('');

  /* =====================================================================
   *  4. СОСТОЯНИЕ ПАНЕЛИ
   * ===================================================================== */

  const tplById = (id) => TEMPLATES.find((t) => t.id === id);
  const LS = { get: (k, d) => { try { const v = localStorage.getItem('sqnsmz.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
               set: (k, v) => { try { localStorage.setItem('sqnsmz.' + k, JSON.stringify(v)); } catch (e) {} } };

  let S = null;          // состояние: blocks, position, duration, mode, edits, tab
  let undoSnap = null;
  let uid = 1;

  function defaultParams(tpl) {
    const p = {};
    (tpl.params || []).forEach((pr) => {
      if (pr.default !== undefined) p[pr.key] = Array.isArray(pr.default) ? pr.default.slice() : pr.default;
      else if (pr.type === 'heading' || pr.type === 'note') return;
      else if ((pr.type === 'select' || pr.type === 'seg') && pr.optionsFn) p[pr.key] = '';
      else if (pr.type === 'select' || pr.type === 'seg') p[pr.key] = pr.options[0].v;
      else if (pr.type === 'chips') p[pr.key] = [];
      else if (pr.type === 'perTooth') p[pr.key] = {};
      else if (pr.type === 'teethSub' || pr.type === 'toothSet') p[pr.key] = [];
      else if (pr.type === 'toggle') p[pr.key] = false;
      else p[pr.key] = '';
    });
    return p;
  }
  // Данные страницы SQNS: формула текущего визита, планы лечения, история визитов (только чтение)
  let PAGE = null;
  // ---- Состав планов лечения: в списке SQNS отдаёт планы без услуг, догружаем каждый план с сервера ----
  // Адрес как у самого SQNS: /admin/treatmentPlan/getJson/page/0/wid/<WID>/id/<ID>/sessionKeyAction
  let WID = null; const PLAN_ITEMS = {}, PLAN_LOAD = {};
  (function hookWid() {
    const grab = (u) => { const m = String(u || '').match(/\/wid\/([A-Za-z0-9]+)/); if (m) WID = m[1]; };
    const o = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) { try { grab(u); } catch (e) { /* */ } return o.apply(this, arguments); };
    const f = window.fetch; if (f) window.fetch = function (u) { try { grab(u && u.url ? u.url : u); } catch (e) { /* */ } return f.apply(this, arguments); };
  })();
  function findWid() {
    if (WID) return WID;
    try {
      const html = document.documentElement.innerHTML; const m = html.match(/\/wid\/([A-Za-z0-9]{16,})/) || html.match(/["']wid["']\s*[:=]\s*["']([A-Za-z0-9]{16,})/); if (m) return (WID = m[1]);
      const app = document.querySelector('[ng-app]'); const root = ng().element(app).injector().get('$rootScope'); let n = 0, found = null;
      (function walk(sc) { if (!sc || found || n++ > 5000) return; if (typeof sc.wid === 'string' && sc.wid.length >= 16) found = sc.wid; for (let c = sc.$$childHead; c; c = c.$$nextSibling) walk(c); })(root);
      if (found) return (WID = found);
    } catch (e) { /* */ }
    return null;
  }
  function findItems(o, d) {
    if (!o || typeof o !== 'object' || d > 6) return null;
    if (Array.isArray(o.treatmentPlanItems)) return o.treatmentPlanItems;
    for (const k of Object.keys(o)) { const r = findItems(o[k], (d || 0) + 1); if (r) return r; }
    return null;
  }
  function loadPlanItems(id) {
    const w = findWid(), key = id + '|' + (w || '');
    if (PLAN_LOAD[key]) return PLAN_LOAD[key];
    const urls = (w ? ['/admin/treatmentPlan/getJson/page/0/wid/' + w + '/id/' + id + '/sessionKeyAction'] : []).concat(['/admin/treatmentPlan/getJson/page/0/id/' + id + '/sessionKeyAction', '/admin/treatmentPlan/getJson/id/' + id]);
    PLAN_LOAD[key] = (async () => {
      for (const u of urls) {
        try {
          const r = await fetch(u, { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
          if (!r.ok) continue;
          const j = await r.json(); const it = findItems(j, 0);
          if (it) { PLAN_ITEMS[id] = it; console.log('[Медзапись] состав плана ' + id + ' загружен: ' + it.length + ' поз.'); return true; }
        } catch (e) { /* пробуем следующий адрес */ }
      }
      console.warn('[Медзапись] не удалось загрузить состав плана ' + id); return false;
    })();
    return PLAN_LOAD[key];
  }
  function ensurePlanItems(plans) {
    const w = findWid();
    const need = plans.filter((p) => !(p.treatmentPlanItems || []).length && !(String(p.id) in PLAN_ITEMS) && !PLAN_LOAD[p.id + '|' + (w || '')]);
    if (!need.length) return;
    Promise.all(need.map((p) => loadPlanItems(p.id))).then((res) => {
      if (!res.some(Boolean)) return;
      const untouched = !S || (!Object.keys(S.edits || {}).length && S.blocks.every((b) => !Object.keys(b.touched || {}).length));
      if (S && untouched) { buildInitialState(); if (isOpen) render(); }
      else if (S && isOpen) toast('Состав плана загружен — нажмите ↻, чтобы обновить блок');
    });
  }
  function readPage() {
    const out = { formula: null, plans: [], history: null, clientID: null };
    try {
      const app = document.querySelector('[ng-app]') || document.documentElement;
      const root = ng().element(app).injector().get('$rootScope');
      let n = 0, live = null;
      (function walk(sc) {
        if (!sc || n++ > 5000) return;
        if (Object.prototype.hasOwnProperty.call(sc, 'form') && sc.form && sc.form.dentalFormula && !out.formula) {
          const fm = sc.form; out.formula = fm.dentalFormula; out.visitId = fm.id || fm.visitID || null;
          const jd = (fm.journals || []).map((j) => j.startDate).filter(Boolean);
          out.visitDate = jd[0] || fm.date || fm.startDate || fm.visitDate || fm.datetime || fm.start || null;
          out.visitJournals = fm.journals || [];
        }
        if (Object.prototype.hasOwnProperty.call(sc, 'treatmentPlans') && Array.isArray(sc.treatmentPlans) && !out.plans.length) out.plans = sc.treatmentPlans;
        if (Object.prototype.hasOwnProperty.call(sc, 'caseHistory') && sc.caseHistory && !out.history) out.history = sc.caseHistory;
        if (!live && Object.prototype.hasOwnProperty.call(sc, 'changeConfigService') && typeof sc.getDentalFormulaFromService === 'function') live = sc;
        for (let c = sc.$$childHead; c; c = c.$$nextSibling) walk(c);
      })(root);
      // живая формула из компонента SQNS: в ней уже есть несохранённые изменения (в т. ч. внесённые вкладкой «Услуги»)
      if (live && out.formula) {
        try { let j = live.getDentalFormulaFromService(); if (typeof j === 'string') j = JSON.parse(j); if (j && j.permanentTeeth && Object.keys(j.permanentTeeth).length) out.formula = j; } catch (e) { /* остаётся form.dentalFormula */ }
      }
      if (!out.formula && out.history && out.history.visits && out.history.visits[0]) out.formula = out.history.visits[0].dentalFormula || null;
      const pl = out.plans[0]; if (pl) out.clientID = pl.clientInfoID;
      out.plans = out.plans.map((p) => (!(p.treatmentPlanItems || []).length && PLAN_ITEMS[p.id] ? Object.assign({}, p, { treatmentPlanItems: PLAN_ITEMS[p.id], _loaded: true }) : p));
      ensurePlanItems(out.plans);
      const cx = getCtx();
      if (!out.visitDate && cx && cx.j) out.visitDate = cx.j.startDate;
      // другие дневники этого же визита (например, план записан в первом, а сейчас открыт второй)
      out.otherJournals = (out.visitJournals || []).filter((j) => !(cx && cx.j === j));
    } catch (e) { console.warn('[Медзапись] не удалось прочитать данные страницы', e); }
    return out;
  }

  function newBlock(tplId, teeth, src) {
    const t = tplById(tplId);
    const b = { uid: uid++, tpl: tplId, teeth: (teeth || []).slice(), params: defaultParams(t), src: src || 'manual', pickerOpen: false, auto: {}, touched: {}, hints: {}, sort: 0 };
    if (t.init) { try { t.init(b, PAGE || (PAGE = readPage())); } catch (e) { console.warn(e); } }
    if (t.onTeeth) t.onTeeth(b);
    return b;
  }
  const tplMatch = (tpl, id) => (Array.isArray(tpl) ? tpl.includes(id) : tpl === id);
  function setParam(b, key, val) {
    if (Array.isArray(val)) { const a = b.params[key] || []; b.params[key] = a.concat(val.filter((v) => !a.includes(v))); }
    else b.params[key] = val;
    b.auto[key] = 1;
  }

  function noTeethHint(b, s) {
    if (s.teeth.length) return;
    b.hints.noTeeth = true;
    if (tplById(b.tpl).qtyIsTeeth || (b.rule && b.rule.block && b.rule.block.qtyIsTeeth) || s.qtyIsTeeth) b.hints.teethQty = (b.hints.teethQty || 0) + s.qty;
  }
  function buildInitialState() {
    PAGE = readPage();
    const services = getServices();
    const blocks = [newBlock('base', [], 'fixed')];
    const unmatched = [], mods = [];
    services.forEach((s) => {
      const rule = ruleFor(s);
      if (POSITION_BY_CODE.some(([c]) => s.code.startsWith(c)) && !(rule && rule.block)) return;
      if (rule && rule.info) return;
      if (rule && rule.unmatched) { unmatched.push(s); return; }
      if (rule && rule.mod) { mods.push({ rule, s }); if (!rule.pass) return; }
      if (rule && rule.block && rule.block.merge && !rule.pass) {
        const rb = rule.block;
        if (rb.qtyIsTeeth) s.qtyIsTeeth = true;
        let b = rb.mergeAll ? blocks.find((x) => x.tpl === rb.tpl)
          : rb.mergeBy ? blocks.find((x) => x.tpl === rb.tpl && x.params[rb.mergeBy] === rb.params[rb.mergeBy])
          : blocks.find((x) => x.tpl === rb.tpl && x.teeth.join() === s.teeth.join());
        if (b && (rb.mergeAll || rb.mergeBy)) s.teeth.forEach((t) => { if (!b.teeth.includes(t)) b.teeth = b.teeth.concat(t).sort(); });
        if (!b && !s.teeth.length && !rb.mergeBy) { const c = blocks.filter((x) => x.tpl === rb.tpl); if (c.length === 1) b = c[0]; }
        if (!b) { b = newBlock(rb.tpl, s.teeth, 'service'); blocks.push(b); }
        Object.keys(rb.params || {}).forEach((k) => setParam(b, k, rb.params[k]));
        if (rb.hint) rb.hint(b, s);
        noTeethHint(b, s);
        return;
      }
      if (rule && rule.block && !rule.pass) {
        const rb = rule.block;
        const same = blocks.find((b) => b.rule === rule && b.teeth.join() === s.teeth.join());
        if (same) { same.params.qty = (+same.params.qty || 0) + s.qty; return; }
        const b = newBlock(rb.tpl, s.teeth, 'service'); b.rule = rule; b.sort = rb.sort || 0;
        Object.assign(b.params, rb.params || {}); b.params.qty = s.qty;
        Object.keys(rb.params || {}).forEach((k) => { b.auto[k] = 1; });
        blocks.push(b); return;
      }
      const tpl = TEMPLATES.find((t) => (t.triggers || []).some((c) => s.code.startsWith(c)));
      if (!tpl) { unmatched.push(s); return; }
      const same = blocks.find((b) => b.tpl === tpl.id && b.src === 'service' && b.teeth.join() === s.teeth.join());
      if (same) { if (same.params.qty != null) same.params.qty = (+same.params.qty || 0) + s.qty; noTeethHint(same, s); (same.svc = same.svc || []).push(s); return; }
      const b = newBlock(tpl.id, s.teeth, 'service'); if (b.params.qty != null) b.params.qty = s.qty; noTeethHint(b, s); b.svc = [s]; blocks.push(b);
    });
    // пломба на зубе с эндолечением → постоянная реставрация внутри блока «Эндодонтия»
    blocks.slice().forEach((b) => {
      if (b.tpl !== 'caries' || b.src !== 'service') return;
      const endos = blocks.filter((e) => e.tpl === 'endo');
      let e = endos.find((x) => x.teeth.some((t) => b.teeth.includes(t)));
      if (!e && endos.length === 1 && (!b.teeth.length || !endos[0].teeth.length)) e = endos[0];
      if (!e) return;
      if (!e.teeth.length && b.teeth.length) { e.teeth = b.teeth.slice(); const t = tplById('endo'); if (t.onTeeth) t.onTeeth(e); }
      e.hints.filled = true;
      (b.svc || []).forEach((s) => { s.badge = 'Эндо: постоянная реставрация'; });
      blocks.splice(blocks.indexOf(b), 1);
    });
    // модификаторы: на блоки того же шаблона (с общими зубами, если зубы у услуги указаны)
    mods.forEach(({ rule, s }) => {
      const m = rule.mod;
      blocks.filter((b) => tplMatch(m.tpl, b.tpl) && (!s.teeth.length || b.teeth.some((t) => s.teeth.includes(t)))).forEach((b) => {
        const keys = (tplById(b.tpl).params || []).map((x) => x.key);
        if (m.set) { Object.keys(m.set).forEach((k) => { if (keys.includes(k)) { b.params[k] = m.set[k]; b.auto[k] = 1; } }); return; }
        if (m.add) { const a = b.params[m.key] || []; if (!a.includes(m.add)) b.params[m.key] = a.concat(m.add); } else b.params[m.key] = m.value;
        b.auto[m.key] = 1;
      });
    });
    if (C.postBuild) C.postBuild(blocks, { newBlock, tplById, setParam, page: PAGE, services });
    blocks.forEach((b) => { const t = tplById(b.tpl); if (t.finalize) t.finalize(b, blocks, PAGE); });
    const recPos = services.map((s) => (POSITION_BY_CODE.find(([c]) => s.code.startsWith(c)) || [])[1]).find(Boolean) || null;
    S = { services, unmatched, blocks, recPos, position: null, posTouched: false, duration: LS.get('duration', DEFAULT_DURATION), mode: 'replace', edits: {}, tab: 'diary', conts: [], contPick: new Set(), manualOk: false };
    initConts();
  }

  /* ---- визит без услуг: продолжение лечения (ортопедия по этапам, осмотр после операции…) или шаблон вручную ---- */
  // Выбор врача помним по визиту, чтобы он не терялся при пересборке панели
  let CONT_MEM = { visit: null, ids: null, manual: false };
  const visitKey = () => String((PAGE && PAGE.visitId) || '') + '|' + (JPICK == null ? '' : JPICK);
  function initConts() {
    if (S.services.length || !C.continuations) return;
    let list = [];
    try { list = C.continuations(PAGE) || []; } catch (e) { console.warn('[Медзапись] продолжение лечения', e); }
    const me = [localStorage.getItem('currentEmployeeId'), localStorage.getItem('currentUserId')].filter(Boolean);
    list.forEach((c) => { c.emp = c.emp || []; c.who = !c.emp.length ? '' : c.emp.some((x) => me.includes(x)) ? 'mine' : 'other'; });
    list.sort((a, b) => (a.who === 'other') - (b.who === 'other'));
    S.conts = list;
    let ids;
    if (CONT_MEM.visit === visitKey() && CONT_MEM.ids) { ids = CONT_MEM.ids.filter((id) => list.some((c) => c.id === id)); S.manualOk = CONT_MEM.manual; }
    else {
      // сам выбираем, только если вариант один или ровно один ведёт этот врач (а у остальных автор известен и он другой)
      const mine = list.filter((c) => c.who === 'mine'), unknown = list.filter((c) => !c.who);
      const auto = list.length === 1 ? list[0] : mine.length === 1 && !unknown.length ? mine[0] : null;
      ids = auto ? [auto.id] : [];
      CONT_MEM = { visit: visitKey(), ids: ids.slice(), manual: false };
    }
    ids.forEach((id) => addCont(id));
  }
  function addCont(id) {
    const c = S.conts.find((x) => x.id === id); if (!c || S.contPick.has(id)) return;
    let bl = [];
    try { bl = c.make({ newBlock, tplById, setParam, page: PAGE }) || []; } catch (e) { console.warn(e); }
    bl.forEach((b) => { b.contId = id; const t = tplById(b.tpl); if (t.finalize) try { t.finalize(b, S.blocks.concat(bl), PAGE); } catch (e) { /* */ } });
    S.blocks.push(...bl); S.contPick.add(id);
  }
  function toggleCont(id) {
    if (S.contPick.has(id)) { S.blocks = S.blocks.filter((b) => b.contId !== id); S.contPick.delete(id); }
    else addCont(id);
    CONT_MEM = { visit: visitKey(), ids: [...S.contPick], manual: S.manualOk };
  }
  function contCard() {
    const card = (c) => {
      const on = S.contPick.has(c.id);
      const who = c.who === 'mine' ? badge('ok', 'ведёте вы') : c.who === 'other' ? badge('warn', 'ведёт другой врач') : '';
      return '<button class="cont' + (on ? ' on' : '') + '" data-cont="' + esc(c.id) + '"><span class="ci">' + c.icon + '</span><span class="ct"><b>' + esc(c.title) + '</b><span>' + esc(c.detail) + '</span>' + (who ? '<span>' + who + '</span>' : '') + '</span><span class="ck">' + (on ? '✓' : '＋') + '</span></button>';
    };
    return '<div class="sec"><h2>Визит без услуг</h2><div class="card">' +
      (S.conts.length ? '<div class="hint" style="margin:0 0 8px">Продолжение лечения пациента' + (S.conts.length > 1 ? ' — выберите, что записать (можно несколько)' : '') + ':</div>' + S.conts.map(card).join('')
        : '<div class="hint" style="margin:0 0 8px">Незавершённого лечения у пациента не найдено.</div>') +
      '<div class="cbtns">' + (S.manualOk ? '<span class="hint">Все шаблоны — ниже, в разделе «Шаблоны».</span>' : '<button class="addb" id="manualok">✍️ Выбрать шаблон вручную</button>') +
      (SVCV() ? '<button class="link" data-view="svc">🧾 Добавить услуги в визит</button>' : '') + '</div></div></div>';
  }

  /* =====================================================================
   *  5. СБОРКА ТЕКСТА
   * ===================================================================== */

  function teethHelper(teeth) {
    const f = teeth.map(fmtTooth), list = f.join(', '), one = f.length === 1, has = f.length > 0;
    const t = (a, b) => (has ? (one ? a : b) + ' ' + list : '___');
    return { has, list, nom: t('зуб', 'зубы'), Nom: t('Зуб', 'Зубы'), gen: t('зуба', 'зубов'), acc: t('зуб', 'зубы'), loc: t('зубе', 'зубах') };
  }
  function resolvedParams(tpl, p) {
    const P = {};
    (tpl.params || []).forEach((pr) => { if (pr.options) P[pr.key] = pr.options.find((o) => o.v === p[pr.key]) || pr.options[0]; });
    return P;
  }
  function blockTeeth(b) {
    const tpl = tplById(b.tpl);
    if (tpl.teethFromOthers && !b.teeth.length) {
      const all = new Set(); S.blocks.forEach((x) => { if (x !== b && tplById(x.tpl).needTeeth) x.teeth.forEach((t) => all.add(t)); });
      return [...all].sort();
    }
    return b.teeth;
  }

  function compose() {
    const order = S.blocks.slice().sort((a, b) => (tplById(a.tpl).order - tplById(b.tpl).order) || (a.sort - b.sort));
    const F = {}; const diags = [];
    order.forEach((b) => {
      const tpl = tplById(b.tpl), T = teethHelper(blockTeeth(b)), P = resolvedParams(tpl, b.params);
      const out = tpl.fields(b.params, T, P, { b, blocks: S.blocks, page: PAGE }) || {};
      Object.keys(out).forEach((k) => { if (out[k]) { F[k] = F[k] || []; if (!F[k].includes(out[k])) F[k].push(out[k]); } });
      if (tpl.mkb) { const m = tpl.mkb(b.params, P); if (m && !diags.some((x) => x[0] === m[0])) diags.push(m); }
    });
    const J = (k) => (F[k] || []).join('\n');
    if (!F.complaints) F.complaints = ['Жалоб нет.'];
    const diary = {}; Object.keys(DIARY_MAP).forEach((k) => { diary[k] = J(k); });
    const egisz = {
      patientComplaints: J('complaints'),
      anamnesisDisease: J('anamnesisMorbi') || 'Обратился для планового лечения.',
      anamnesisLife: J('anamnesisVitae'),
      objectively: [J('objective'), J('statusLocalis'), J('xray')].filter(Boolean).join('\n'),
      conclusion: [J('diagnosis') && 'Диагноз: ' + J('diagnosis').replace(/\n/g, ' '), J('treatment') && 'Проведено: ' + J('treatment').replace(/\n/g, ' ')].filter(Boolean).join('\n'),
      regimenAndRecommendations: J('recommendations'),
    };
    // ручные правки поверх
    Object.keys(S.edits).forEach((key) => { const [grp, k] = key.split(':'); (grp === 'diary' ? diary : egisz)[k] = S.edits[key]; });
    return { diary, egisz, diags };
  }

  function positionInfo() {
    if (S.posTouched && S.position) return { key: S.position, src: 'manual', lvl: 'ok', note: 'выбрано вручную' };
    const fromTpl = [...new Set(S.blocks.map((b) => tplById(b.tpl).position).filter(Boolean))];
    if (fromTpl.length === 1) return { key: fromTpl[0], lvl: 'ok', note: 'из шаблона' };
    if (fromTpl.length > 1) return { key: null, lvl: 'bad', note: 'шаблоны разных специальностей — выберите' };
    if (S.recPos) return { key: S.recPos, lvl: 'ok', note: 'из услуги приёма' };
    const last = LS.get('lastPosition', null);
    if (last) return { key: last, lvl: 'warn', note: 'как в прошлый раз' };
    return { key: null, lvl: 'bad', note: 'не определена — выберите' };
  }

  function timeInfo(ctx) {
    if (!ctx || !ctx.j.endTime || !ctx.j.endDate) return null;
    const [dd, mm, yy] = ctx.j.endDate.split('.').map(Number), [h, mi] = ctx.j.endTime.split(':').map(Number);
    const end = new Date(yy, mm - 1, dd, h, mi), start = new Date(end.getTime() - S.duration * 60000);
    const p2 = (n) => String(n).padStart(2, '0');
    return { startDate: p2(start.getDate()) + '.' + p2(start.getMonth() + 1) + '.' + start.getFullYear(), startTime: p2(start.getHours()) + ':' + p2(start.getMinutes()), endTime: ctx.j.endTime, endDate: ctx.j.endDate };
  }

  function issues(ctx) {
    const list = [];
    if (!ctx) { list.push({ lvl: 'bad', text: 'Дневник приёма не создан или не открыт визит' }); return list; }
    S.blocks.forEach((b) => { const t = tplById(b.tpl); if (t.needTeeth && !b.teeth.length) list.push({ lvl: 'bad', text: t.title + ': не выбран зуб' });
      if (t.check) (t.check(b, S.blocks, PAGE) || []).forEach((x) => list.push(x)); });
    const pi = positionInfo();
    if (!pi.key) list.push({ lvl: 'bad', text: 'Должность: ' + pi.note });
    else if (!POSITIONS[pi.key].id) list.push({ lvl: 'warn', text: POSITIONS[pi.key].name + ': код не подтверждён — должность выберите в протоколе вручную' });
    if (!ctx.d) list.push({ lvl: 'warn', text: 'Протокол ЕГИСЗ не найден — заполнится только дневник' });
    // зубы блоков vs зубы услуг
    const svcTeeth = new Set(S.services.flatMap((s) => s.teeth));
    S.blocks.forEach((b) => { if (tplById(b.tpl).needTeeth && svcTeeth.size && !b.hints.noTeeth) b.teeth.forEach((t) => { if (!svcTeeth.has(t)) list.push({ lvl: 'warn', text: 'Зуб ' + fmtTooth(t) + ' не указан ни в одной услуге визита' }); }); });
    S.unmatched.forEach((s) => list.push({ lvl: 'warn', text: 'Нет шаблона для услуги: ' + s.name.slice(0, 60) }));
    if (S.blocks.length === 1) list.push({ lvl: 'warn', text: 'Добавьте хотя бы один блок лечения' });
    return list;
  }

  /* =====================================================================
   *  6. ВСТАВКА И ОТМЕНА
   * ===================================================================== */

  function snapshot(ctx) {
    const { j, d } = ctx;
    return {
      items: j.journalItems.map((it) => it.content), startTime: j.startTime, startDate: j.startDate,
      d: d ? JSON.parse(JSON.stringify({ f: EGISZ_FIELDS.map(([k]) => d[k]), pos: d.employeePosition, ac: d.admissionCondition, dg: d.diagnosesSemd227, sc: d.semdCode })) : null,
      mkb: (j.uniqueJournalItems || []).map((u) => ({ content: u.content, mkbDisease: u.mkbDisease })),
    };
  }
  function restore(ctx, s) {
    const { sc, j, d } = ctx;
    apply(sc, () => {
      j.journalItems.forEach((it, i) => { it.content = s.items[i]; });
      j.startTime = s.startTime; j.startDate = s.startDate;
      if (d && s.d) { EGISZ_FIELDS.forEach(([k], i) => { d[k] = s.d.f[i]; }); d.employeePosition = s.d.pos; d.admissionCondition = s.d.ac; d.diagnosesSemd227 = s.d.dg; d.semdCode = s.d.sc; }
      (j.uniqueJournalItems || []).forEach((u, i) => { if (s.mkb[i]) { u.content = s.mkb[i].content; u.mkbDisease = s.mkb[i].mkbDisease; } });
      if (sc.startDateTimeChange) try { sc.startDateTimeChange(); } catch (e) {}
    });
  }

  function doInsert() {
    const ctx = getCtx(); if (!ctx) return toast('Дневник не найден', 'bad');
    const { sc, j, d } = ctx; const R = compose(); const pi = positionInfo(); const ti = timeInfo(ctx);
    undoSnap = snapshot(ctx);
    const merge = (oldV, newV, html) => {
      if (!newV) return oldV;
      if (S.mode === 'append' && oldV && (html ? htmlToText(oldV) : String(oldV).trim())) return html ? oldV + newV : oldV + '\n' + newV;
      return newV;
    };
    apply(sc, () => {
      // дневник
      Object.keys(DIARY_MAP).forEach((k) => {
        const it = j.journalItems.find((x) => x.section && x.section.handle === DIARY_MAP[k]);
        if (it && R.diary[k]) it.content = merge(it.content, textToHtml(R.diary[k]), true);
      });
      const main = R.diags[0];
      const mkbItem = (j.uniqueJournalItems || []).find((u) => u.uniqueSectionID === 1 || (u.uniqueSection && u.uniqueSection.type === 'mkb_disease'));
      if (main && mkbItem && (S.mode === 'replace' || !mkbItem.content)) {
        mkbItem.content = main[0];
        mkbItem.mkbDisease = { name: main[1], id: main[0], modelClass: 'EgiszMkbDisease', primaryKey: main[0] };
      }
      // время
      if (ti) { j.startDate = ti.startDate; j.startTime = ti.startTime; }
      // протокол
      if (d) {
        if (!d.semdCode) d.semdCode = 227;
        EGISZ_FIELDS.forEach(([k]) => { d[k] = merge(d[k], R.egisz[k], false); });
        d.admissionCondition = ADMISSION_CONDITION;
        if (pi.key && POSITIONS[pi.key].id) {
          const P = POSITIONS[pi.key];
          d.employeePosition = { name: P.name, id: P.id, modelClass: 'EgiszEmployeePosition', primaryKey: P.id };
        }
        if (main) {
          const exists = (d.diagnosesSemd227 || []).some((x) => x.mkb10 && x.mkb10.externalId === main[0]);
          const dg = {
            nosologicalDiagnosisType: DIAG_DEFAULTS.nosologicalDiagnosisType, mkb10: { externalId: main[0], name: main[1] },
            diagnosisDegreeValidityType: null, diseaseNatureType: DIAG_DEFAULTS.diseaseNatureType,
            externalCauseMKB10: { externalId: null, name: null }, injuryReceiptMethod: { externalId: null, name: null },
            firstDiagnosisInLifeInformation: { date: null, confirmationReliabilityType: null, patientAgeAtDiagnosisDate: null },
          };
          if (S.mode === 'replace' || !(d.diagnosesSemd227 || []).length) d.diagnosesSemd227 = [dg];
          else if (!exists) d.diagnosesSemd227.push(dg);
        }
      }
      if (sc.startDateTimeChange) try { sc.startDateTimeChange(); } catch (e) {}
    });
    if (pi.key) LS.set('lastPosition', pi.key);
    LS.set('duration', S.duration);
    render();
    toast('Готово. Проверьте поля и сохраните визит.', 'ok');
  }

  function doUndo() {
    const ctx = getCtx(); if (!ctx || !undoSnap) return;
    restore(ctx, undoSnap); undoSnap = null; render(); toast('Вставка отменена', 'ok');
  }

  async function createDiary() {
    JPICK = null;
    const before = getCtx(), oldJ = before && before.j, oldN = before && before.sc && before.sc.form && before.sc.form.journals ? before.sc.form.journals.length : 0;
    const btn = document.querySelector('.case-history-journal-add__button');
    if (!btn) return toast('Кнопка «Дневник приема» не найдена — откройте визит', 'bad');
    btn.click();
    const radio = await waitFor('#protocol-create-mode-standard', 5000);
    if (!radio) return toast('Окно выбора шаблона не появилось', 'bad');
    radio.click();
    await sleep(150);
    const submit = [...document.querySelectorAll('.modal-footer button')].find((b) => /Создать/.test(b.textContent));
    if (submit) submit.click();
    const ok = await waitFor('[ng-controller="JournalItemController"]', 8000);
    if (!ok) return toast('Дневник не появился', 'bad');
    if (oldJ) {   // второй и следующие дневники: ждём, пока откроется новый
      const t0 = Date.now(); let c = getCtx();
      while (Date.now() - t0 < 8000 && c && c.j === oldJ) { await sleep(200); c = getCtx(); }
      const n = c && c.sc && c.sc.form && c.sc.form.journals ? c.sc.form.journals.length : 0;
      if (c && c.j === oldJ) { toast(n > oldN ? 'Новый дневник создан — откройте его и нажмите ↻' : 'Новый дневник не появился', n > oldN ? 'warn' : 'bad'); return; }
    }
    await sleep(400);
    undoSnap = null;
    buildInitialState(); render();
    toast('Новый дневник создан' + (oldJ ? ' — блоки подобраны заново' : ''));
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(sel, ms) { const t = Date.now(); while (Date.now() - t < ms) { const el = document.querySelector(sel); if (el) return el; await sleep(150); } return null; }

  /* =====================================================================
   *  7. ИНТЕРФЕЙС
   * ===================================================================== */

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .strip{position:fixed;top:0;left:0;right:0;height:4px;z-index:2147483000;pointer-events:none;display:none}
  .strip.show{display:block}
  .dock{position:fixed;right:0;top:34%;z-index:2147483000;display:flex;flex-direction:column;align-items:stretch;gap:6px}
  .di{position:relative;display:flex;align-items:center;gap:9px;height:42px;padding:0 14px 0 11px;border:1px solid #e2e8f0;border-right:0;border-radius:13px 0 0 13px;
    background:#fff;color:#0f172a;cursor:pointer;font-size:13px;font-weight:700;white-space:nowrap;box-shadow:0 6px 20px rgba(15,23,42,.14);
    transform:translateX(calc(100% - 48px));transition:transform .22s ease,background .15s}
  .dock:hover .di,.dock.pin .di{transform:none} .di:hover{background:#f1f5f9}
  .di .ic{width:24px;text-align:center;font-size:19px;line-height:1;flex:none}
  .di.doc{background:var(--c);border-color:var(--c);color:#fff;height:46px} .di.doc:hover{filter:brightness(1.07);background:var(--c)}
  .di.doc .av{width:28px;height:28px;margin:0 -2px;border-radius:50%;background:#fff;color:var(--c);display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;flex:none}
  .di.doc .cv{font-size:11px;opacity:.85}
  .di.warn{--c:#f59e0b} .di.gray{--c:#94a3b8}
  .di .nd{position:absolute;left:6px;top:6px;width:9px;height:9px;border-radius:50%;background:#ef4444;border:2px solid #fff}
  .di.soon{color:#94a3b8} .di .sn{font-size:10px;font-weight:700;background:#f1f5f9;color:#64748b;border-radius:8px;padding:1px 6px}
  .lock{position:fixed;inset:0;z-index:2147483003;background:rgba(15,23,42,.55);display:none;align-items:center;justify-content:center}
  .lock.show{display:flex}
  .lk{background:#fff;color:#0f172a;border-radius:18px;padding:22px 24px;max-width:420px;box-shadow:0 24px 64px rgba(15,23,42,.35);font-size:14px;line-height:1.5}
  .lk b{display:block;font-size:16px;margin-bottom:6px} .lk p{margin:0 0 14px;color:#334155}
  .cont{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:10px 12px;margin:0 0 7px;cursor:pointer;color:#0f172a}
  .cont:hover{border-color:#818cf8} .cont.on{border-color:#6366f1;background:linear-gradient(135deg,rgba(14,165,163,.08),rgba(99,102,241,.12))}
  .cont .ci{font-size:22px} .cont .ct{flex:1;display:flex;flex-direction:column;gap:3px;min-width:0} .cont .ct b{font-size:13.5px} .cont .ct>span{font-size:12px;color:#475569}
  .cont .ck{font-size:16px;font-weight:800;color:#4f46e5;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#eef2ff;flex:none}
  .cont.on .ck{background:#4f46e5;color:#fff}
  .cbtns{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:4px}
  .ftnote{flex-basis:100%;font-size:12.5px;font-weight:600;color:#166534;background:#dcfce7;border-radius:10px;padding:7px 10px}
  .wrap{position:fixed;inset:0;z-index:2147483001;pointer-events:none}
  .shade{position:absolute;inset:0;background:rgba(15,23,42,.18);opacity:0;transition:opacity .25s}
  .panel{position:absolute;top:12px;right:12px;bottom:12px;width:min(560px,calc(100vw - 24px));background:#f8fafc;border-radius:20px;
    box-shadow:0 24px 64px rgba(15,23,42,.28);display:flex;flex-direction:column;overflow:hidden;transform:translateX(110%);transition:transform .3s cubic-bezier(.2,.8,.2,1);color:#0f172a}
  .open .panel{transform:none;pointer-events:auto} .open .shade{opacity:1;pointer-events:auto}
  .hd{padding:16px 18px;background:linear-gradient(135deg,#0ea5a3,#6366f1);color:#fff;display:flex;align-items:center;gap:12px}
  .hd h1{margin:0;font-size:17px;font-weight:700;flex:1} .hd small{display:block;font-weight:500;opacity:.85;font-size:12px;margin-top:2px}
  .x{border:0;background:rgba(255,255,255,.18);color:#fff;width:32px;height:32px;border-radius:10px;font-size:18px;cursor:pointer}
  .x:hover{background:rgba(255,255,255,.3)}
  .body{flex:1;overflow:auto;padding:14px 14px 6px}
  .sec{margin-bottom:14px} .sec>h2{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:4px 4px 8px;font-weight:700}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:12px;margin-bottom:10px;box-shadow:0 1px 2px rgba(15,23,42,.04)}
  .ch{display:flex;align-items:center;gap:8px;margin-bottom:8px} .ch .ti{font-weight:700;font-size:14px;flex:1}
  .ch .em{font-size:18px} .del{border:0;background:#f1f5f9;color:#64748b;border-radius:8px;width:26px;height:26px;cursor:pointer}
  .del:hover{background:#fee2e2;color:#b91c1c}
  .svc{display:flex;gap:8px;align-items:flex-start;font-size:12.5px;padding:6px 2px;border-bottom:1px dashed #e2e8f0}
  .svc:last-child{border:0} .svc .cd{font-family:ui-monospace,Consolas,monospace;color:#475569;white-space:nowrap}
  .svc .nm{flex:1;color:#1e293b}
  .row{display:grid;grid-template-columns:118px 1fr;gap:8px;align-items:center;margin:7px 0}
  .row>label{font-size:12px;color:#475569;font-weight:600}
  select,input[type=text],input[type=number],textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:7px 9px;font-size:13px;background:#fff;color:#0f172a;outline:none}
  select:focus,input:focus,textarea:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
  textarea{min-height:58px;resize:vertical;line-height:1.4}
  .seg{display:flex;flex-wrap:wrap;gap:4px;background:#f1f5f9;padding:3px;border-radius:10px}
  .seg button,.chip{border:0;background:transparent;padding:6px 10px;border-radius:8px;font-size:12.5px;cursor:pointer;color:#334155;font-weight:600}
  .seg button.on{background:#fff;color:#4338ca;box-shadow:0 1px 3px rgba(15,23,42,.15)}
  .chips{display:flex;flex-wrap:wrap;gap:5px} .chip{background:#f1f5f9;border:1px solid transparent}
  .chip.on{background:#eef2ff;border-color:#a5b4fc;color:#4338ca}
  .tg{position:relative;width:40px;height:22px;border-radius:22px;background:#cbd5e1;border:0;cursor:pointer;transition:background .2s}
  .tg::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s}
  .tg.on{background:#6366f1} .tg.on::after{left:21px}
  .teeth{display:flex;flex-wrap:wrap;gap:5px;align-items:center}
  .tchip{background:#ecfeff;color:#0e7490;border:1px solid #a5f3fc;border-radius:8px;padding:3px 8px;font-size:12.5px;font-weight:700}
  .link{border:0;background:none;color:#4f46e5;font-weight:600;font-size:12.5px;cursor:pointer;padding:3px 4px}
  .formula{margin:6px 0 10px;padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px}
  .fh{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
  .fl{font-size:12px;font-weight:700;color:#475569} .fs{font-size:13px;font-weight:700;color:#4338ca;flex:1}
  .jaw{display:flex;align-items:stretch;gap:0} .half{flex:1;display:grid;grid-template-columns:repeat(8,1fr);gap:3px}
  .milk .half{grid-template-columns:repeat(5,1fr)} .milk{margin-top:10px;padding-top:8px;border-top:1px dashed #cbd5e1}
  .mid{width:2px;background:#cbd5e1;margin:0 6px;border-radius:2px}
  .occl{height:2px;background:#cbd5e1;margin:5px 0;border-radius:2px}
  .tb{position:relative;height:32px;min-width:0;border-radius:9px;border:1.5px solid #e2e8f0;background:#fff;font-size:12.5px;font-weight:700;color:#64748b;cursor:pointer;transition:all .12s;padding:0}
  .tb:hover{border-color:#818cf8;color:#4338ca;transform:translateY(-1px)}
  .tb.on{background:linear-gradient(135deg,#0ea5a3,#6366f1);border-color:transparent;color:#fff;box-shadow:0 3px 10px rgba(79,70,229,.35)}
  .tsum{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-height:26px} .muted{color:#94a3b8;font-size:12.5px} .formula.mini{margin:6px 0 2px;padding:8px} .formula.mini .tb{height:26px;font-size:11.5px}
  .tb.miss{background:#f1f5f9;color:#94a3b8;border-color:#e2e8f0} .tb.impl{color:#7c3aed;border-color:#ddd6fe}
  .tb.dv{border:1.5px dashed #818cf8;background:#eef2ff;color:#4338ca}
  .tb.svc::after{content:"";position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:12px;height:3px;border-radius:3px;background:#06b6d4}
  .tb.on.svc::after{background:#fff}
  .ff{display:flex;align-items:center;justify-content:space-between;margin-top:6px}
  .sdot{display:inline-block;width:12px;height:3px;border-radius:3px;background:#06b6d4;vertical-align:middle}
  .badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap}
  .ok{background:#dcfce7;color:#166534} .warn{background:#fef3c7;color:#92400e} .bad{background:#fee2e2;color:#991b1b}
  .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:7px}
  .tile{position:relative;display:flex;align-items:center;gap:8px;text-align:left;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:9px 10px;cursor:pointer;transition:all .12s;color:#334155}
  .tile:hover{border-color:#818cf8;transform:translateY(-1px)}
  .tile.on{background:linear-gradient(135deg,rgba(14,165,163,.10),rgba(99,102,241,.14));border-color:#818cf8;color:#312e81}
  .ti-ic{font-size:18px} .ti-t{flex:1;font-size:12.5px;font-weight:700;line-height:1.2}
  .ti-n{font-size:11px;font-weight:800;color:#fff;background:linear-gradient(135deg,#0ea5a3,#6366f1);border-radius:20px;padding:1px 7px}
  .ti-p{font-size:15px;color:#94a3b8;font-weight:700}
  .ti-s{position:absolute;bottom:-7px;right:8px;font-size:9.5px;font-weight:700;background:#fff;border:1px solid #c7d2fe;color:#4338ca;border-radius:10px;padding:0 6px}
  .tsel{flex:1;width:auto;font-weight:700;font-size:14px;border:1.5px solid transparent;background:#f8fafc;padding:5px 8px;border-radius:9px;cursor:pointer}
  .tsel:hover{border-color:#c7d2fe}
  .add{display:flex;flex-wrap:wrap;gap:6px}
  .note{font-size:12.5px;line-height:1.45;color:#1e293b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:8px 10px}
  .subh{margin:14px 0 4px;padding-top:10px;border-top:1px solid #e2e8f0;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6366f1;font-weight:800}
  .pt{margin:8px 0;padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc}
  .pt-h{font-size:12px;font-weight:700;color:#475569;margin-bottom:6px}
  .pt-r{display:flex;align-items:flex-end;gap:6px;padding:6px 0;border-top:1px dashed #e2e8f0} .pt-r:first-of-type{border-top:0}
  .pt-r .tchip{margin-bottom:6px}
  .pt-f{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0} .pt-f:nth-of-type(1){flex:1.8} .pt-t{flex:1.2} .pt-t input{padding:6px;font-size:12.5px} .pt-f span{font-size:10.5px;color:#64748b;font-weight:600}
  .pt-f select{padding:6px 6px;font-size:12.5px} .pt-f select:disabled{background:#f1f5f9;color:#94a3b8}
  select.need{border-color:#fca5a5;background:#fff7f7}
  .morebtn{display:block;width:100%;margin-top:6px;border:1px dashed #cbd5e1;background:#f8fafc;color:#475569;border-radius:10px;padding:7px;font-size:12.5px;font-weight:600;cursor:pointer}
  .morebtn:hover{background:#eef2ff;color:#4338ca;border-color:#a5b4fc}
  .addb{border:1px dashed #a5b4fc;background:#fff;color:#4338ca;border-radius:10px;padding:7px 11px;font-size:12.5px;font-weight:600;cursor:pointer}
  .addb:hover{background:#eef2ff}
  .tabs{display:flex;gap:4px;background:#e2e8f0;padding:3px;border-radius:12px;margin-bottom:10px}
  .tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px;font-weight:700;font-size:12.5px;color:#475569;cursor:pointer}
  .tabs button.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.12)}
  .pf{margin-bottom:9px} .pf .lb{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px}
  .pf .lb .sp{flex:1} .pf .rs{border:0;background:none;color:#64748b;cursor:pointer;font-size:12px}
  .iss{font-size:12.5px;display:flex;flex-direction:column;gap:5px}
  .iss div{display:flex;gap:7px;align-items:flex-start;padding:7px 9px;border-radius:10px}
  .ft{padding:12px 14px;background:#fff;border-top:1px solid #e2e8f0;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
  .btn{border:0;border-radius:12px;padding:11px 16px;font-weight:700;font-size:13.5px;cursor:pointer}
  .pri{flex:1;background:linear-gradient(135deg,#0ea5a3,#6366f1);color:#fff;box-shadow:0 6px 18px rgba(79,70,229,.3)}
  .pri:disabled{background:#cbd5e1;box-shadow:none;cursor:not-allowed}
  .sec2{background:#f1f5f9;color:#334155} .sec2:hover{background:#e2e8f0}
  .empty{text-align:center;padding:26px 10px;color:#475569;font-size:13.5px}
  .toast{position:fixed;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);opacity:0;z-index:2147483002;padding:11px 16px;border-radius:12px;
    font-size:13.5px;font-weight:600;box-shadow:0 10px 30px rgba(15,23,42,.25);transition:all .25s;pointer-events:none}
  .toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
  .hint{font-size:11.5px;color:#64748b;margin:2px 4px 0}
  .auto{font-size:10.5px;color:#15803d;font-weight:600}
  `;

  let host, root, wrap, isOpen = false;

  function mount() {
    if (host) return;
    host = document.createElement('div'); host.id = 'sqns-medzapis';
    document.body.appendChild(host);
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = '<style>' + CSS + ((globalThis.SQNSMZ_SVCVIEW || {}).css || '') + (DOCS() ? DOCS().css : '') + '</style>' +
      '<div class="strip" id="strip"></div><div class="dock" id="dock"></div><div class="dpop" id="dpop"></div>' +
      '<div class="wrap" id="wrap"><div class="shade" id="shade"></div><div class="panel" id="panel"></div></div>' +
      '<div class="toast" id="toast"></div><div class="lock" id="lock"></div>';
    wrap = root.getElementById('wrap');
    root.getElementById('shade').onclick = () => closePanel();
    root.getElementById('dock').addEventListener('click', (e) => { const b = e.target.closest('[data-dk]'); if (b) { e.stopPropagation(); dockAction(b.dataset.dk); } });
    DOCK_HTML = ''; renderDock(); renderPopIfOpen();
  }
  // Открыть панель на нужной вкладке. Без указания: в визите нет услуг → «Услуги», есть → «Медзапись».
  function openPanel(v) { buildInitialState(); undoSnap = undoSnap || null; togglePop(false);
    if (SVCV()) VIEW = v === 'svc' || v === 'diary' ? v : (S.services.length ? 'diary' : 'svc');
    render(); wrap.classList.add('open'); isOpen = true; }
  function closePanel() { wrap.classList.remove('open'); isOpen = false; }

  /* ---- боковые кнопки: врач, Услуги, Медзапись, План, Печать ---- */
  const DOCS = () => globalThis.SQNSMZ_DOCTORS || null;
  const tplAllowed = (t) => !DOCS() || DOCS().allowedPos(t.position);   // шаблоны дневника по разделам врача
  let DOCK_HTML = '', popOpen = false;
  function dockState() {   // красные точки: что ещё не сделано в открытом визите
    const out = { svc: false, diary: false };
    try {
      if (!document.querySelector('[ng-controller="VisitFormController"]')) return out;
      // визит без услуг бывает нормой (ортопедия с оплатой в конце) — точку ставим только на пустой дневник
      const c = getCtx(); out.diary = !c || jEmpty(c.j);
    } catch (e) { /* */ }
    return out;
  }
  function renderDock() {
    const D = root && root.getElementById('dock'); if (!D) return;
    const st = dockState(), cur = DOCS() ? DOCS().current() : null, ok = (f) => !DOCS() || DOCS().allowed(f);
    let doc = '';
    if (cur) {
      if (cur.mode === 'doc') doc = '<button class="di doc" style="--c:' + esc(cur.doc.color) + '" data-dk="doc" title="Сменить врача (Alt+D)"><span class="av">' + esc(cur.ini) + '</span><span>' + esc(cur.name) + '</span><span class="cv">▾</span></button>';
      else if (cur.mode === 'login') doc = '<button class="di doc warn" data-dk="doc"><span class="av">→</span><span>' + esc(cur.text) + '</span><span class="cv">▾</span></button>';
      else if (cur.mode !== 'none') doc = '<button class="di doc gray" data-dk="doc" title="Врачи (Alt+D)"><span class="av">' + (cur.mode === 'wait' ? '…' : '?') + '</span><span>' + esc(cur.text) + '</span><span class="cv">▾</span></button>';
    }
    const it = (k, ic, t, dot, extra) => '<button class="di' + (extra || '') + '" data-dk="' + k + '">' + (dot ? '<span class="nd"></span>' : '') + '<span class="ic">' + ic + '</span><span>' + t + '</span>' + (k === 'print' ? '<span class="sn">скоро</span>' : '') + '</button>';
    const h = cur && cur.mode === 'login' ? doc : doc + (SVCV() ? it('svc', '🧾', 'Услуги', st.svc) : '') + it('diary', '📝', 'Медзапись', st.diary) + (ok('plan') ? it('plan', '📋', 'План') : '') + (ok('print') ? it('print', '🖨️', 'Печать', false, ' soon') : '');
    if (h !== DOCK_HTML) { D.innerHTML = h; DOCK_HTML = h; }
    D.classList.toggle('pin', popOpen);
    const S2 = root.getElementById('strip');
    if (cur && cur.mode === 'doc') { S2.style.background = cur.doc.color; S2.classList.add('show'); } else S2.classList.remove('show');
  }
  function renderPopIfOpen() {
    const P = root && root.getElementById('dpop'); if (!P || !DOCS()) return;
    P.classList.toggle('show', popOpen);
    if (popOpen) {
      P.innerHTML = DOCS().renderPop(); DOCS().bindPop(P);
      const D = root.getElementById('dock'); D.classList.add('pin');   // окно — слева от раскрытых кнопок
      setTimeout(() => { const w = Math.max(...[...D.children].map((x) => x.getBoundingClientRect().width), 60); P.style.right = (w + 10) + 'px'; }, 240);
    }
  }
  function togglePop(v) { popOpen = v == null ? !popOpen : v; if (!popOpen && DOCS()) DOCS().POP.edit = null; renderPopIfOpen(); renderDock(); }
  function dockAction(k) {
    if (k === 'doc') { if (!DOCS()) return; if (isOpen) closePanel(); togglePop(); return; }
    togglePop(false);
    if (k === 'svc' || k === 'diary') { if (isOpen && VIEW === k) closePanel(); else openPanel(k); return; }
    if (k === 'plan') {   // своей вкладки плана пока нет — открываем «Планы лечения» в карточке пациента
      const a = document.querySelector('a[href="#treatmentPlan"]');
      if (a) { closePanel(); a.click(); toast('Открыты «Планы лечения»'); } else toast('Откройте карточку пациента', 'warn');
      return;
    }
    if (k === 'print') toast('Печать актов и планов — скоро', 'warn');
  }
  function lockTab(msg) {
    const L = root && root.getElementById('lock'); if (!L) return;
    if (!msg) { L.classList.remove('show'); return; }
    L.innerHTML = '<div class="lk"><b>Врач сменился</b><p>' + esc(msg) + ' Эта вкладка теперь тоже работает от его имени — несохранённое здесь уйдёт не от того врача.</p><button class="btn pri" id="lkre" style="width:100%">Обновить страницу</button></div>';
    L.classList.add('show'); L.querySelector('#lkre').onclick = () => location.reload();
  }
  function toast(msg, lvl) {
    const t = root.getElementById('toast'); t.textContent = msg; t.className = 'toast show ' + (lvl || 'ok');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast ' + (lvl || 'ok'); }, 3200);
  }

  const badge = (lvl, text) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(text) + '</span>';

  function renderParam(b, pr) {
    const tpl = tplById(b.tpl); const v = b.params[pr.key]; const id = 'b' + b.uid + '.' + pr.key;
    if (pr.show && !pr.show(b.params)) return '';
    if (pr.adv && !b.showAdv && !b.auto[pr.key] && !b.touched[pr.key]) return '';
    if (pr.type === 'perTooth') return renderPerTooth(b, pr);
    if (pr.optionsFn) pr = Object.assign({}, pr, { options: pr.optionsFn(b, PAGE) || [] });
    if (pr.type === 'note') { const txt = pr.text(b, PAGE); return txt ? '<div class="row"><label>' + esc(pr.label) + '</label><div class="note">' + txt + '</div></div>' : ''; }
    if (pr.optionsFn && !pr.options.length) return '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', pr.emptyHint || 'нет данных') + '</div></div>';
    if (pr.type === 'heading') return '<div class="subh">' + esc(pr.label) + '</div>';
    let ctl = '';
    if (pr.type === 'select') ctl = '<select data-p="' + id + '">' + pr.options.map((o) => '<option value="' + esc(o.v) + '"' + (o.v === v ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select>';
    else if (pr.type === 'seg') ctl = '<div class="seg">' + pr.options.map((o) => '<button data-seg="' + id + '" data-v="' + esc(o.v) + '" class="' + (o.v === v ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
    else if (pr.type === 'teethSub') ctl = b.teeth.length ? '<div class="chips">' + b.teeth.map((t) => '<button data-chip="' + id + '" data-v="' + esc(t) + '" class="chip ' + ((v || []).includes(t) ? 'on' : '') + '">' + fmtTooth(t) + '</button>').join('') + '</div>' : badge('warn', 'отметьте зубы в формуле');
    else if (pr.type === 'toothSet') {
      const val = (v || []).map(String), hl = new Set(((pr.hl && pr.hl(b, PAGE)) || []).map(String)), open = (b.tsOpen || {})[pr.key];
      const need = pr.need && pr.need(b, PAGE) && !val.length;
      const M = fMarks();
      const btn = (t) => { t = String(t); const L = tLabel(M, t); return '<button class="tb' + L.cls + (val.includes(t) ? ' on' : hl.has(t) ? ' dv' : '') + '" data-ts="' + id + '" data-t="' + t + '" title="' + t + '">' + L.txt + '</button>'; };
      const r = (a, z) => Array.from({ length: z }, (_, i) => a + i), half = (arr) => '<div class="half">' + arr.map(btn).join('') + '</div>';
      const row = (L, R) => '<div class="jaw">' + half(L) + '<div class="mid"></div>' + half(R) + '</div>';
      ctl = '<div class="tsum">' + (val.length ? '<span class="fs">' + val.slice().sort().map(fmtTooth).join(', ') + '</span>' : need ? badge('bad', pr.needText || 'укажите зубы') : '<span class="muted">не выбрано</span>') +
        ' <button class="link" data-tso="' + id + '">' + (open ? 'Свернуть' : val.length ? 'Изменить' : 'Выбрать') + '</button></div>' +
        (open ? '<div class="formula mini">' + row(r(11, 8).reverse(), r(21, 8)) + '<div class="occl"></div>' + row(r(41, 8).reverse(), r(31, 8)) + (pr.hlText && hl.size ? '<div class="ff"><span class="hint">пунктир — ' + esc(pr.hlText) + '</span></div>' : '') + (fCaption(M) ? '<div class="ff">' + fCaption(M) + '</div>' : '') + '</div>' : '');
    }
    else if (pr.type === 'chips') ctl = '<div class="chips">' + pr.options.map((o) => '<button data-chip="' + id + '" data-v="' + esc(o.v) + '" class="chip ' + ((v || []).includes(o.v) ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
    else if (pr.type === 'toggle') ctl = '<button class="tg ' + (v ? 'on' : '') + '" data-tg="' + id + '"></button>';
    else if (pr.type === 'number') ctl = '<input type="number" data-p="' + id + '" value="' + esc(v) + '" min="' + (pr.min || 0) + '" max="' + (pr.max || 99) + '" style="width:90px">';
    else ctl = '<input type="text" data-p="' + id + '" value="' + esc(v) + '" placeholder="' + esc(pr.placeholder || '') + '">';
    void tpl;
    return '<div class="row"><label>' + esc(pr.label) + (b.auto && b.auto[pr.key] ? '<br><span class="auto">● ' + esc(pr.autoText || 'из услуги') + '</span>' : '') + '</label><div>' + ctl + '</div></div>';
  }

  function hasFormula(tpl) { return tpl.needTeeth || tpl.teethFromOthers || tpl.teethOptional; }

  function ptRow(b, pr, t) {
    const store = b.params[pr.key] || (b.params[pr.key] = {});
    if (!store[t]) store[t] = pr.init ? pr.init(b, t) : {};
    return store[t];
  }
  function renderPerTooth(b, pr) {
    const rows = pr.rowsFor ? pr.rowsFor(b) : b.teeth;
    if (!rows.length) return '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', pr.emptyHint || 'отметьте зубы в формуле') + '</div></div>';
    let h = '<div class="pt"><div class="pt-h">' + esc(pr.label) + '</div>';
    rows.forEach((t) => {
      const row = ptRow(b, pr, t);
      h += '<div class="pt-r"><span class="tchip">' + fmtTooth(t) + '</span>' + pr.fields.map((f) => {
        if (f.type === 'text') return '<label class="pt-f pt-t"><span>' + esc(f.label) + '</span><input type="text" placeholder="' + esc(f.placeholder || '') + '" value="' + esc(row[f.key] || '') + '" data-pt="' + b.uid + '|' + pr.key + '|' + t + '|' + f.key + '"></label>';
        const opts = f.options(row) || [];
        const bad = !f.optional && !row[f.key];
        return '<label class="pt-f"><span>' + esc(f.label) + '</span><select class="' + (bad && opts.length ? 'need' : '') + '" data-pt="' + b.uid + '|' + pr.key + '|' + t + '|' + f.key + '"' + (opts.length ? '' : ' disabled') + '>' +
          '<option value="">' + (opts.length ? '—' : '…') + '</option>' +
          opts.map((o) => '<option value="' + esc(o.v) + '"' + (String(row[f.key]) === String(o.v) ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select></label>';
      }).join('') + '</div>';
    });
    return h + '</div>';
  }

  function advLink(b) {
    const t = tplById(b.tpl);
    const hidden = (t.params || []).filter((pr) => pr.adv && (!pr.show || pr.show(b.params)) && !b.auto[pr.key] && !b.touched[pr.key]).length;
    if (!hidden && !b.showAdv) return '';
    return '<button class="morebtn" data-adv="' + b.uid + '">' + (b.showAdv ? '▴ Скрыть дополнительные' : '▾ Ещё параметры (' + hidden + ')') + '</button>';
  }

  // Формула пациента из SQNS поверх нашей сетки: отсутствующие — «0» серым, имплантаты — «И». Выбирать их всё равно можно.
  function fMarks() { if (S.plainFormula || !PAGE || !PAGE.formula || !C.formulaMarks) return null; try { return C.formulaMarks(PAGE.formula); } catch (e) { return null; } }
  function tLabel(M, t) { return !M ? { txt: t, cls: '' } : M.missing.includes(t) ? { txt: '0', cls: ' miss' } : M.implant.includes(t) ? { txt: 'И', cls: ' impl' } : { txt: t, cls: '' }; }
  function fCaption(M) {
    if (!PAGE || !PAGE.formula || !C.formulaMarks) return '';
    return S.plainFormula ? '<span class="hint">обычная формула · <button class="link" data-plainf="0">формула пациента</button></span>'
      : '<span class="hint">формула из карточки пациента' + (M && (M.missing.length || M.implant.length) ? ' (0 — нет зуба, И — имплантат)' : '') + ' · <button class="link" data-plainf="1">сброс</button></span>';
  }
  function renderTeeth(b) {
    const tpl = tplById(b.tpl);
    if (!hasFormula(tpl)) return '';
    const derived = tpl.teethFromOthers && !b.teeth.length ? blockTeeth(b) : [];
    const svcT = new Set(S.services.flatMap((s) => s.teeth));
    const M = fMarks();
    const btn = (t) => { t = String(t); const on = b.teeth.includes(t), dv = !on && derived.includes(t), L = tLabel(M, t);
      return '<button class="tb' + L.cls + (on ? ' on' : dv ? ' dv' : '') + (svcT.has(t) ? ' svc' : '') + '" data-tooth="' + b.uid + '" data-t="' + t + '" title="' + t + '">' + L.txt + '</button>'; };
    const half = (arr) => '<div class="half">' + arr.map(btn).join('') + '</div>';
    const r = (a, z) => Array.from({ length: z }, (_, i) => a + i);
    const row = (L, R) => '<div class="jaw">' + half(L) + '<div class="mid"></div>' + half(R) + '</div>';
    const sel = b.teeth.length ? b.teeth.map(fmtTooth).join(', ') : derived.length ? derived.map(fmtTooth).join(', ') + ' (как в блоках)' : '';
    let note = '';
    if (!b.teeth.length && !derived.length) {
      note = tpl.needTeeth ? badge('bad', 'выберите зубы') : '';
      if (b.hints.noTeeth && (tpl.needTeeth || b.hints.teethQty)) note = badge(tpl.needTeeth ? 'bad' : 'warn', 'в услуге зубы не указаны' + (b.hints.teethQty ? ' · кол-во ' + b.hints.teethQty : '') + ' — отметьте');
    } else if (b.hints.teethQty && b.teeth.length && b.hints.teethQty !== b.teeth.length) note = badge('warn', 'по услугам ' + b.hints.teethQty + ' шт., отмечено ' + b.teeth.length);
    return '<div class="formula"><div class="fh"><span class="fl">Зубы</span><span class="fs">' + esc(sel) + '</span>' + note +
      (b.teeth.length ? '<button class="link" data-clear="' + b.uid + '">Сбросить</button>' : '') + '</div>' +
      row(r(11, 8).reverse(), r(21, 8)) + '<div class="occl"></div>' + row(r(41, 8).reverse(), r(31, 8)) +
      (S.showMilk ? '<div class="milk">' + row([55, 54, 53, 52, 51, 0, 0, 0].filter(Boolean), r(61, 5)) + '<div class="occl"></div>' + row([85, 84, 83, 82, 81], r(71, 5)) + '</div>' : '') +
      (fCaption(M) ? '<div class="ff">' + fCaption(M) + '</div>' : '') +
      '<div class="ff"><button class="link" data-milk="1">' + (S.showMilk ? 'Скрыть молочные' : 'Молочные зубы') + '</button>' +
      (svcT.size ? '<span class="hint"><span class="sdot"></span> зуб есть в услугах</span>' : '') + '</div></div>';
  }

  // ---- вкладки панели: «Услуги» (svc-engine.js) и «Дневник» (медзапись) ----
  let VIEW = 'svc';
  const SVCV = () => globalThis.SQNSMZ_SVCVIEW || null;
  const SVC_API = {
    toast: (m, l) => toast(m, l), rerender: () => render(), rebuild: () => buildInitialState(),
    fmtTooth, marks: () => fMarks(), page: () => PAGE,
    gotoDiary: () => { VIEW = 'diary'; buildInitialState(); render(); },
  };
  const viewTabs = () => '';   // вкладки заменены боковыми кнопками
  function bindViews(P) {
    P.querySelectorAll('[data-view]').forEach((el) => el.addEventListener('click', (e) => { VIEW = e.currentTarget.dataset.view; buildInitialState(); render(); }));
  }
  function renderSvc(P) {
    const prevScroll = P.querySelector('.body') ? P.querySelector('.body').scrollTop : 0;
    const v = SVCV().render(SVC_API);
    P.innerHTML = '<div class="hd"><div style="font-size:26px">🧾</div><h1>Услуги визита<small>услуг в визите: ' + S.services.length + ' · v' + ENGINE_VERSION + '</small></h1>' +
      '<button class="x" id="refresh" title="Перечитать страницу">↻</button><button class="x" id="close">×</button></div><div class="body">' + viewTabs() + v.body + '</div><div class="ft">' + v.foot + '</div>';
    P.querySelector('#close').onclick = closePanel;
    P.querySelector('#refresh').onclick = () => { buildInitialState(); render(); toast('Данные страницы перечитаны'); };
    bindViews(P); SVCV().bind(P, SVC_API);
    const body = P.querySelector('.body'); if (body) body.scrollTop = prevScroll;
  }
  function render() {
    const P = root.getElementById('panel'); const ctx = getCtx();
    if (!S) buildInitialState();
    if (VIEW === 'svc' && SVCV()) { renderSvc(P); return; }
    const prevScroll = P.querySelector('.body') ? P.querySelector('.body').scrollTop : 0;
    if (!S) buildInitialState();
    const pi = positionInfo(); const ti = timeInfo(ctx); const iss = issues(ctx); const hasBad = iss.some((i) => i.lvl === 'bad' && !/код не подтверждён/.test(i.text));
    S.blocks.forEach((b) => (tplById(b.tpl).params || []).forEach((pr) => { if (pr.type === 'perTooth') (pr.rowsFor ? pr.rowsFor(b) : b.teeth).forEach((t) => ptRow(b, pr, t)); }));
    const R = compose();

    let h = '<div class="hd"><div style="font-size:26px">🦷</div><h1>Медзапись<small>' +
      (ctx ? (ctx.list.length > 1 ? 'Дневников в визите: ' + ctx.list.length : 'Дневник найден') + ' · услуг в визите: ' + S.services.length : 'Дневник не найден') + ' · v' + ENGINE_VERSION + '</small></h1><button class="x" id="refresh" title="Перечитать страницу (планы, формулу, услуги)">↻</button><button class="x" id="close">×</button></div><div class="body">' + viewTabs();

    // визит без услуг: продолжение лечения или шаблон вручную (дневник без услуг не запрещаем)
    if (!S.services.length) {
      h += contCard();
      if (!S.contPick.size && !S.manualOk) { h += '</div>'; P.innerHTML = h; bind(P); return; }
    }

    if (!ctx) {
      h += '<div class="card empty">Откройте визит пациента.<br>Если дневника ещё нет — создам его со стандартным шаблоном.<br><br>' +
        '<button class="btn pri" id="mkdiary" style="flex:none">＋ Создать дневник приёма</button><br><br><button class="link" id="rescan">Обновить</button></div></div>';
      P.innerHTML = h; bind(P); return;
    }
    if (ctx.list.length > 1) {
      h += '<div class="card"><div class="subh" style="margin-top:0">В какой дневник вставлять</div><div class="seg">' + ctx.list.map((x, i) =>
        '<button data-jpick="' + x.idx + '" class="' + (x.j === ctx.j ? 'on' : '') + '">Дневник ' + (i + 1) + (x.j.startTime ? ' · ' + esc(x.j.startTime) : '') + (jEmpty(x.j) ? ' · пустой' : ' · заполнен') + '</button>').join('') +
        '</div><div class="hint" style="margin-top:6px">Выбирайте тот, что открыт в SQNS. По умолчанию — последний пустой.</div></div>';
    }

    // Шаблоны: что выбрано и быстрый выбор
    const userBlocks = S.blocks.filter((b) => !tplById(b.tpl).fixed);
    h += '<div class="sec"><h2>Шаблоны</h2><div class="card">' +
      (userBlocks.length ? '' : '<div class="hint" style="margin:0 0 8px">Шаблон не выбран — услуги не распознаны или их ещё нет. Выберите вручную:</div>') +
      '<div class="tiles">' + TEMPLATES.filter((t) => !t.fixed && tplAllowed(t)).map((t) => {
        const bs = userBlocks.filter((b) => b.tpl === t.id), n = bs.length, auto = bs.some((b) => b.src === 'service'), byPlan = bs.some((b) => b.src === 'auto');
        return '<button class="tile' + (n ? ' on' : '') + '" data-add="' + t.id + '" title="Добавить блок «' + esc(t.title) + '»">' +
          '<span class="ti-ic">' + t.icon + '</span><span class="ti-t">' + esc(t.title) + '</span>' +
          (n ? '<span class="ti-n">' + (n > 1 ? '×' + n : '✓') + '</span>' : '<span class="ti-p">＋</span>') +
          (n ? '<span class="ti-s">' + (auto ? 'из услуг' : bs.some((b) => b.contId) ? 'продолжение' : byPlan ? 'по плану' : 'вручную') + '</span>' : '') + '</button>';
      }).join('') + '</div><div class="hint" style="margin-top:6px">Нажмите, чтобы добавить блок. Сменить шаблон блока — в его заголовке, удалить — ×.</div></div></div>';

    // Услуги визита
    h += '<div class="sec"><h2>Услуги визита</h2><div class="card">' + (S.services.length ? S.services.map((s) => {
      const isRec = POSITION_BY_CODE.some(([c]) => s.code.startsWith(c));
      const rule = ruleFor(s);
      if (rule) return '<div class="svc"><span class="cd">' + esc(s.code) + '</span><span class="nm">' + esc(s.name.replace(/^\S+\s/, '')) +
        (s.teeth.length ? ' ' + s.teeth.map((t) => '<span class="tchip">' + fmtTooth(t) + '</span>').join(' ') : '') + '</span>' + badge(rule.unmatched ? 'warn' : 'ok', rule.unmatched ? rule.label + ': нет шаблона' : rule.label) + '</div>';
      const tpl = TEMPLATES.find((t) => (t.triggers || []).some((c) => s.code.startsWith(c)));
      return '<div class="svc"><span class="cd">' + esc(s.code) + '</span><span class="nm">' + esc(s.name.replace(/^\S+\s/, '')) +
        (s.teeth.length ? ' ' + s.teeth.map((t) => '<span class="tchip">' + fmtTooth(t) + '</span>').join(' ') : '') + '</span>' +
        (isRec ? badge('ok', 'приём') : s.badge ? badge('ok', s.badge) : tpl ? badge('ok', tpl.title) : badge('warn', 'нет шаблона')) + '</div>';
    }).join('') : '<div class="hint">Услуги не найдены</div>') + '</div></div>';

    // Блоки
    h += '<div class="sec"><h2>Блоки записи</h2>';
    S.blocks.forEach((b) => {
      const t = tplById(b.tpl);
      h += '<div class="card"><div class="ch"><span class="em">' + t.icon + '</span>' + (t.fixed ? '<span class="ti">' + esc(t.title) + '</span>' :
        '<select class="tsel" data-switch="' + b.uid + '">' + TEMPLATES.filter((x) => !x.fixed && (tplAllowed(x) || x.id === b.tpl)).map((x) => '<option value="' + x.id + '"' + (x.id === b.tpl ? ' selected' : '') + '>' + esc(x.title) + '</option>').join('') + '</select>') +
        (b.src === 'service' ? badge('ok', 'из услуг') : b.src === 'auto' ? badge('ok', b.autoNote || 'подобран автоматически') : b.src === 'fixed' ? '' : badge('warn', 'добавлен вручную')) +
        (t.fixed ? '' : '<button class="del" data-del="' + b.uid + '" title="Удалить блок">×</button>') + '</div>' +
        renderTeeth(b) + (t.params || []).map((pr) => renderParam(b, pr)).join('') + advLink(b) + '</div>';
    });
    h += '</div>';

    // Протокол
    h += '<div class="sec"><h2>Протокол ЕГИСЗ</h2><div class="card">' +
      '<div class="row"><label>Должность</label><div><div class="seg">' + Object.keys(POSITIONS).map((k) =>
        '<button data-pos="' + k + '" class="' + (pi.key === k ? 'on' : '') + '">' + POSITIONS[k].name.replace('Врач-стоматолог-', '') + '</button>').join('') + '</div>' +
        '<div style="margin-top:5px">' + badge(pi.lvl, pi.note) + '</div></div></div>' +
      '<div class="row"><label>Время приёма</label><div>' + (ti ? '<b>' + ti.startTime + '</b> → <b>' + ti.endTime + '</b>' +
        (ti.startDate !== ti.endDate ? ' <span class="hint">(начало ' + ti.startDate + ')</span>' : '') : badge('warn', 'нет данных')) +
        ' &nbsp;<input type="number" id="dur" value="' + S.duration + '" min="5" max="600" style="width:72px"> мин</div></div>' +
      '<div class="row"><label>Состояние</label><div>' + badge('ok', 'Удовлетворительное') + '</div></div>' +
      '<div class="row"><label>Диагноз МКБ</label><div>' + (R.diags.length ? R.diags.map((d, i) => badge(i ? 'warn' : 'ok', d[0] + (i ? ' (только в тексте)' : ' основной'))).join(' ') : badge('bad', 'нет')) + '</div></div>' +
      '<div class="row"><label>Если поле заполнено</label><div class="seg"><button data-mode="replace" class="' + (S.mode === 'replace' ? 'on' : '') + '">Заменить</button>' +
        '<button data-mode="append" class="' + (S.mode === 'append' ? 'on' : '') + '">Дописать</button></div></div>' +
      '</div></div>';

    // Предпросмотр
    const cur = currentValues(ctx);
    h += '<div class="sec"><h2>Предпросмотр</h2><div class="tabs"><button data-tab="diary" class="' + (S.tab === 'diary' ? 'on' : '') + '">Дневник приёма</button>' +
      '<button data-tab="egisz" class="' + (S.tab === 'egisz' ? 'on' : '') + '">Протокол ЕГИСЗ</button></div><div class="card">';
    const fields = S.tab === 'diary' ? Object.keys(DIARY_LABELS).map((k) => [k, DIARY_LABELS[k]]) : EGISZ_FIELDS;
    fields.forEach(([k, label]) => {
      const key = S.tab + ':' + k; const val = (S.tab === 'diary' ? R.diary : R.egisz)[k] || ''; const old = cur[key];
      if (!val && !old) return;
      h += '<div class="pf"><div class="lb">' + esc(label) + '<span class="sp"></span>' +
        (S.edits[key] != null ? badge('warn', 'правлено') + '<button class="rs" data-reset="' + key + '" title="Вернуть из шаблона">↺</button>' : '') +
        (old ? badge('warn', S.mode === 'replace' ? 'заменит текущее' : 'допишется') : '') + '</div>' +
        '<textarea data-edit="' + key + '">' + esc(val) + '</textarea></div>';
    });
    h += '</div></div>';

    // Проблемы
    if (iss.length) h += '<div class="sec"><h2>Проверка</h2><div class="iss">' + iss.map((i) => '<div class="' + i.lvl + '">' + (i.lvl === 'bad' ? '⛔' : '⚠️') + ' ' + esc(i.text) + '</div>').join('') + '</div></div>';

    h += '</div><div class="ft">' + (undoSnap ? '<div class="ftnote">✓ Вставлено. Проверьте поля и нажмите «Сохранить» в визите.</div><button class="btn sec2" id="undo">↶ Отменить вставку</button>' : '') +
      (ctx ? '<button class="btn sec2" id="mkdiary2" title="Добавить ещё один дневник приёма в этот визит">＋ Ещё дневник</button>' : '') +
      '<button class="btn pri" id="insert"' + (hasBad ? ' disabled title="Исправьте пункты с ⛔"' : '') + '>' + (undoSnap ? 'Вставить заново' : 'Вставить в визит') + '</button></div>';

    P.innerHTML = h; bind(P);
    const fit = (t) => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    P.querySelectorAll('textarea').forEach((t) => { fit(t); t.addEventListener('input', () => fit(t)); });
    const body = P.querySelector('.body'); if (body) body.scrollTop = prevScroll;
  }

  function currentValues(ctx) {
    const out = {}; if (!ctx) return out;
    Object.keys(DIARY_MAP).forEach((k) => { const it = ctx.j.journalItems.find((x) => x.section && x.section.handle === DIARY_MAP[k]); if (it && htmlToText(it.content)) out['diary:' + k] = 1; });
    if (ctx.d) EGISZ_FIELDS.forEach(([k]) => { if (ctx.d[k] && String(ctx.d[k]).trim()) out['egisz:' + k] = 1; });
    return out;
  }

  function findBlock(id) { const [u, key] = id.slice(1).split('.'); return { b: S.blocks.find((x) => x.uid === +u), key }; }

  function bind(P) {
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    const q = (id) => P.querySelector('#' + id);
    if (q('close')) q('close').onclick = closePanel;
    if (q('mkdiary')) q('mkdiary').onclick = createDiary;
    if (q('mkdiary2')) q('mkdiary2').onclick = createDiary;
    on('[data-jpick]', 'click', (e) => { JPICK = +e.currentTarget.dataset.jpick; undoSnap = null; buildInitialState(); render(); });
    if (q('rescan')) q('rescan').onclick = () => { buildInitialState(); render(); };
    if (q('refresh')) q('refresh').onclick = () => { buildInitialState(); render(); toast('Данные страницы перечитаны'); };
    bindViews(P);
    if (q('manualok')) q('manualok').onclick = () => { S.manualOk = true; CONT_MEM = { visit: visitKey(), ids: [...S.contPick], manual: true }; render(); };
    on('[data-cont]', 'click', (e) => { toggleCont(e.currentTarget.dataset.cont); render(); });
    if (q('insert')) q('insert').onclick = doInsert;
    if (q('undo')) q('undo').onclick = doUndo;
    if (q('dur')) q('dur').onchange = (e) => { S.duration = Math.max(5, +e.target.value || DEFAULT_DURATION); render(); };
    on('[data-p]', 'change', (e) => { const { b, key } = findBlock(e.target.dataset.p); const pr = tplById(b.tpl).params.find((x) => x.key === key);
      b.params[key] = pr.type === 'number' ? (+e.target.value || pr.default) : e.target.value; delete b.auto[key]; b.touched[key] = 1; const tp = tplById(b.tpl); if (tp.onParam) tp.onParam(b, key); render(); });
    on('[data-seg]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.seg); b.params[key] = e.currentTarget.dataset.v; delete b.auto[key]; b.touched[key] = 1; const tp = tplById(b.tpl); if (tp.onParam) tp.onParam(b, key); render(); });
    on('[data-chip]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.chip); const v = e.currentTarget.dataset.v; const a = b.params[key] || []; b.touched[key] = 1;
      b.params[key] = a.includes(v) ? a.filter((x) => x !== v) : a.concat(v); delete b.auto[key]; const tp = tplById(b.tpl); if (tp.onParam) tp.onParam(b, key); render(); });
    on('[data-tg]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.tg); b.params[key] = !b.params[key]; delete b.auto[key]; b.touched[key] = 1; const tp = tplById(b.tpl); if (tp.onParam) tp.onParam(b, key); render(); });
    on('[data-ts]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.ts); const t = e.currentTarget.dataset.t; const a = (b.params[key] || []).map(String);
      b.params[key] = a.includes(t) ? a.filter((x) => x !== t) : a.concat(t).sort(); delete b.auto[key]; b.touched[key] = 1; const tp = tplById(b.tpl); if (tp.onParam) tp.onParam(b, key); render(); });
    on('[data-tso]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.tso); b.tsOpen = b.tsOpen || {}; b.tsOpen[key] = !b.tsOpen[key]; render(); });
    on('[data-pick]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.pick); b.pickerOpen = !b.pickerOpen; render(); });
    on('[data-tooth]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.tooth); const t = e.currentTarget.dataset.t;
      b.teeth = b.teeth.includes(t) ? b.teeth.filter((x) => x !== t) : b.teeth.concat(t).sort(); if (tplById(b.tpl).onTeeth) tplById(b.tpl).onTeeth(b); (tplById(b.tpl).params || []).forEach((pr) => { if (pr.type === 'teethSub') b.params[pr.key] = (b.params[pr.key] || []).filter((x) => b.teeth.includes(x)); }); render(); });
    on('[data-pt]', 'change', (e) => {
      const [u, key, t, fk] = e.target.dataset.pt.split('|'); const b = S.blocks.find((x) => x.uid === +u);
      const pr = tplById(b.tpl).params.find((x) => x.key === key); const row = ptRow(b, pr, t);
      row[fk] = e.target.value;
      let after = false;
      pr.fields.forEach((f) => { if (f.type === 'text') { if (f.key === fk) after = true; return; } if (after && row[f.key] && !(f.options(row) || []).some((o) => String(o.v) === String(row[f.key]))) row[f.key] = ''; if (f.key === fk) after = true; });
      b.touched[key] = 1; render();
    });
    on('[data-adv]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.adv); b.showAdv = !b.showAdv; render(); });
    on('[data-milk]', 'click', () => { S.showMilk = !S.showMilk; render(); });
    on('[data-plainf]', 'click', (e) => { S.plainFormula = e.currentTarget.dataset.plainf === '1'; render(); });
    on('[data-clear]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.clear); b.teeth = []; if (tplById(b.tpl).onTeeth) tplById(b.tpl).onTeeth(b); render(); });
    on('[data-del]', 'click', (e) => { S.blocks = S.blocks.filter((x) => x.uid !== +e.currentTarget.dataset.del); render(); });
    on('[data-add]', 'click', (e) => { const b = newBlock(e.currentTarget.dataset.add, [], 'manual'); S.blocks.push(b); render();
      const cards = P.querySelectorAll('.card'); const last = [...cards].find((c) => c.querySelector('[data-switch="' + b.uid + '"]')); if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    on('[data-switch]', 'change', (e) => { const i = S.blocks.findIndex((x) => x.uid === +e.target.dataset.switch); const old = S.blocks[i];
      const nb = newBlock(e.target.value, old.teeth, 'manual'); S.blocks.splice(i, 1, nb); render(); });
    on('[data-pos]', 'click', (e) => { S.position = e.currentTarget.dataset.pos; S.posTouched = true; render(); });
    on('[data-mode]', 'click', (e) => { S.mode = e.currentTarget.dataset.mode; render(); });
    on('[data-tab]', 'click', (e) => { S.tab = e.currentTarget.dataset.tab; render(); });
    on('[data-edit]', 'input', (e) => { S.edits[e.target.dataset.edit] = e.target.value; });
    on('[data-edit]', 'change', () => render());
    on('[data-reset]', 'click', (e) => { delete S.edits[e.currentTarget.dataset.reset]; render(); });
  }

  /* =====================================================================
   *  8. ЗАПУСК
   * ===================================================================== */
  document.addEventListener('keydown', (e) => {
    if (!root) return;
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      const k = { KeyM: 'toggle', Digit1: 'svc', Digit2: 'diary', Digit3: 'plan', KeyD: 'doc' }[e.code];
      if (k) { e.preventDefault(); if (k === 'toggle') { isOpen ? closePanel() : openPanel(); } else dockAction(k); }
    }
    if (e.key === 'Escape') { if (popOpen) togglePop(false); else if (isOpen) closePanel(); }
  }, true);
  console.log('%c[Медзапись] скрипт загружен', 'color:#6366f1;font-weight:bold');
  let booted = false;
  document.addEventListener('click', () => { if (popOpen) togglePop(false); });   // клик мимо окна врачей закрывает его
  const start = () => {
    try {
      if (!document.body) return;
      if (host && !document.body.contains(host)) { host = null; }   // страницу перерисовали — монтируем заново
      if (!host) { mount(); console.log('[Медзапись] кнопка добавлена'); }
      if (!booted && DOCS()) { booted = true; DOCS().boot({ toast: (m, l) => toast(m, l), refresh: () => { renderDock(); renderPopIfOpen(); }, lock: lockTab }); }
      renderDock();
      if (!S) { try { readPage(); } catch (e) { /* */ } }
    } catch (e) { console.error('[Медзапись] ошибка запуска', e); }
  };
  start();
  setInterval(start, 2000);
})();
