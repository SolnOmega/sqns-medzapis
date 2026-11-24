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

  function getCtx() {
    if (!ng()) return null;
    let sc = null, j = null;
    const eg = document.querySelector('.egisz-fields-list__semd');
    if (eg) { sc = scopeOf(eg); j = sc && sc.form && sc.form.journals && sc.form.journals[sc.journalIndex]; }
    if (!j) {
      const ji = document.querySelector('[ng-controller="JournalItemController"]');
      if (ji) { sc = scopeOf(ji); j = sc && sc.journal; }
    }
    if (!j || !j.journalItems) return null;
    return { sc, j, d: j.signableDocJournalInfoData || null };
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
      else if (pr.type === 'select' || pr.type === 'seg') p[pr.key] = pr.options[0].v;
      else if (pr.type === 'chips') p[pr.key] = [];
      else if (pr.type === 'toggle') p[pr.key] = false;
      else p[pr.key] = '';
    });
    return p;
  }
  function newBlock(tplId, teeth, src) {
    const t = tplById(tplId);
    return { uid: uid++, tpl: tplId, teeth: (teeth || []).slice(), params: defaultParams(t), src: src || 'manual', pickerOpen: false, auto: {}, sort: 0 };
  }

  function buildInitialState() {
    const services = getServices();
    const blocks = [newBlock('base', [], 'fixed')];
    const unmatched = [], mods = [];
    services.forEach((s) => {
      if (POSITION_BY_CODE.some(([c]) => s.code.startsWith(c))) return;
      const rule = ruleFor(s);
      if (rule && rule.mod) { mods.push({ rule, s }); return; }
      if (rule && rule.block) {
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
      if (same) { if (same.params.qty != null) same.params.qty = (+same.params.qty || 0) + s.qty; return; }
      const b = newBlock(tpl.id, s.teeth, 'service'); if (b.params.qty != null) b.params.qty = s.qty; blocks.push(b);
    });
    // модификаторы: на блоки того же шаблона (с общими зубами, если зубы у услуги указаны)
    mods.forEach(({ rule, s }) => {
      const m = rule.mod;
      blocks.filter((b) => b.tpl === m.tpl && (!s.teeth.length || b.teeth.some((t) => s.teeth.includes(t)))).forEach((b) => {
        if (m.add) { const a = b.params[m.key] || []; if (!a.includes(m.add)) b.params[m.key] = a.concat(m.add); } else b.params[m.key] = m.value;
        b.auto[m.key] = 1;
      });
    });
    const recPos = services.map((s) => (POSITION_BY_CODE.find(([c]) => s.code.startsWith(c)) || [])[1]).find(Boolean) || null;
    S = { services, unmatched, blocks, recPos, position: null, posTouched: false, duration: LS.get('duration', DEFAULT_DURATION), mode: 'replace', edits: {}, tab: 'diary' };
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
      const out = tpl.fields(b.params, T, P) || {};
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
    S.blocks.forEach((b) => { const t = tplById(b.tpl); if (t.needTeeth && !b.teeth.length) list.push({ lvl: 'bad', text: t.title + ': не выбран зуб' }); });
    const pi = positionInfo();
    if (!pi.key) list.push({ lvl: 'bad', text: 'Должность: ' + pi.note });
    else if (!POSITIONS[pi.key].id) list.push({ lvl: 'warn', text: POSITIONS[pi.key].name + ': код не подтверждён — должность выберите в протоколе вручную' });
    if (!ctx.d) list.push({ lvl: 'warn', text: 'Протокол ЕГИСЗ не найден — заполнится только дневник' });
    // зубы блоков vs зубы услуг
    const svcTeeth = new Set(S.services.flatMap((s) => s.teeth));
    S.blocks.forEach((b) => { if (tplById(b.tpl).needTeeth && svcTeeth.size) b.teeth.forEach((t) => { if (!svcTeeth.has(t)) list.push({ lvl: 'warn', text: 'Зуб ' + fmtTooth(t) + ' не указан ни в одной услуге визита' }); }); });
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
    await sleep(400);
    buildInitialState(); render();
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(sel, ms) { const t = Date.now(); while (Date.now() - t < ms) { const el = document.querySelector(sel); if (el) return el; await sleep(150); } return null; }

  /* =====================================================================
   *  7. ИНТЕРФЕЙС
   * ===================================================================== */

  const CSS = `
  :host{all:initial}
  *{box-sizing:border-box;font-family:Inter,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .tab{position:fixed;right:0;top:42%;z-index:2147483000;display:flex;align-items:center;gap:8px;padding:12px 14px 12px 12px;
    background:linear-gradient(135deg,#0ea5a3,#6366f1);color:#fff;border-radius:14px 0 0 14px;cursor:pointer;
    box-shadow:0 8px 28px rgba(79,70,229,.35);font-size:13px;font-weight:600;transform:translateX(calc(100% - 46px));transition:transform .25s ease}
  .tab:hover{transform:translateX(0)} .tab .ic{font-size:20px;line-height:1}
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
  .grid{margin-top:8px;padding:8px;background:#f8fafc;border-radius:12px;border:1px solid #e2e8f0}
  .jaw{display:flex;justify-content:center;gap:10px;margin:3px 0} .q{display:flex;gap:3px}
  .tb{width:28px;height:28px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;font-size:11.5px;font-weight:700;color:#334155;cursor:pointer}
  .tb:hover{border-color:#a5b4fc} .tb.on{background:#6366f1;border-color:#6366f1;color:#fff}
  .tb.svc{box-shadow:inset 0 -3px 0 #22d3ee}
  .badge{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap}
  .ok{background:#dcfce7;color:#166534} .warn{background:#fef3c7;color:#92400e} .bad{background:#fee2e2;color:#991b1b}
  .dot{width:7px;height:7px;border-radius:50%;background:currentColor}
  .add{display:flex;flex-wrap:wrap;gap:6px}
  .addb{border:1px dashed #a5b4fc;background:#fff;color:#4338ca;border-radius:10px;padding:7px 11px;font-size:12.5px;font-weight:600;cursor:pointer}
  .addb:hover{background:#eef2ff}
  .tabs{display:flex;gap:4px;background:#e2e8f0;padding:3px;border-radius:12px;margin-bottom:10px}
  .tabs button{flex:1;border:0;background:transparent;border-radius:9px;padding:7px;font-weight:700;font-size:12.5px;color:#475569;cursor:pointer}
  .tabs button.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.12)}
  .pf{margin-bottom:9px} .pf .lb{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:#334155;margin-bottom:4px}
  .pf .lb .sp{flex:1} .pf .rs{border:0;background:none;color:#64748b;cursor:pointer;font-size:12px}
  .iss{font-size:12.5px;display:flex;flex-direction:column;gap:5px}
  .iss div{display:flex;gap:7px;align-items:flex-start;padding:7px 9px;border-radius:10px}
  .ft{padding:12px 14px;background:#fff;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center}
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
    root.innerHTML = '<style>' + CSS + '</style>' +
      '<div class="tab" id="tab"><span class="ic">🦷</span><span>Медзапись</span></div>' +
      '<div class="wrap" id="wrap"><div class="shade" id="shade"></div><div class="panel" id="panel"></div></div>' +
      '<div class="toast" id="toast"></div>';
    wrap = root.getElementById('wrap');
    root.getElementById('tab').onclick = () => openPanel();
    root.getElementById('shade').onclick = () => closePanel();
  }
  function openPanel() { buildInitialState(); undoSnap = undoSnap || null; render(); wrap.classList.add('open'); isOpen = true; }
  function closePanel() { wrap.classList.remove('open'); isOpen = false; }
  function toast(msg, lvl) {
    const t = root.getElementById('toast'); t.textContent = msg; t.className = 'toast show ' + (lvl || 'ok');
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = 'toast ' + (lvl || 'ok'); }, 3200);
  }

  const badge = (lvl, text) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(text) + '</span>';

  function renderParam(b, pr) {
    const tpl = tplById(b.tpl); const v = b.params[pr.key]; const id = 'b' + b.uid + '.' + pr.key;
    if (pr.show && !pr.show(b.params)) return '';
    let ctl = '';
    if (pr.type === 'select') ctl = '<select data-p="' + id + '">' + pr.options.map((o) => '<option value="' + esc(o.v) + '"' + (o.v === v ? ' selected' : '') + '>' + esc(o.l) + '</option>').join('') + '</select>';
    else if (pr.type === 'seg') ctl = '<div class="seg">' + pr.options.map((o) => '<button data-seg="' + id + '" data-v="' + esc(o.v) + '" class="' + (o.v === v ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
    else if (pr.type === 'chips') ctl = '<div class="chips">' + pr.options.map((o) => '<button data-chip="' + id + '" data-v="' + esc(o.v) + '" class="chip ' + ((v || []).includes(o.v) ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
    else if (pr.type === 'toggle') ctl = '<button class="tg ' + (v ? 'on' : '') + '" data-tg="' + id + '"></button>';
    else if (pr.type === 'number') ctl = '<input type="number" data-p="' + id + '" value="' + esc(v) + '" min="' + (pr.min || 0) + '" max="' + (pr.max || 99) + '" style="width:90px">';
    else ctl = '<input type="text" data-p="' + id + '" value="' + esc(v) + '" placeholder="' + esc(pr.placeholder || '') + '">';
    void tpl;
    return '<div class="row"><label>' + esc(pr.label) + (b.auto && b.auto[pr.key] ? '<br><span class="auto">● из услуги</span>' : '') + '</label><div>' + ctl + '</div></div>';
  }

  function renderTeeth(b) {
    const tpl = tplById(b.tpl);
    if (!tpl.needTeeth && !tpl.teethFromOthers) return '';
    const shown = blockTeeth(b); const auto = tpl.teethFromOthers && !b.teeth.length;
    const svcT = new Set(S.services.flatMap((s) => s.teeth));
    let h = '<div class="row"><label>Зубы</label><div class="teeth">' +
      (shown.length ? shown.map((t) => '<span class="tchip">' + fmtTooth(t) + '</span>').join('') + (auto ? '<span class="hint">как в блоках</span>' : '') : badge('bad', 'не выбраны')) +
      '<button class="link" data-pick="' + b.uid + '">' + (b.pickerOpen ? 'Скрыть' : 'Изменить') + '</button></div></div>';
    if (b.pickerOpen) {
      const q = (arr) => '<div class="q">' + arr.map((t) => '<button class="tb ' + (b.teeth.includes(String(t)) ? 'on ' : '') + (svcT.has(String(t)) ? 'svc' : '') + '" data-tooth="' + b.uid + '" data-t="' + t + '">' + t + '</button>').join('') + '</div>';
      const r = (a, z) => Array.from({ length: z }, (_, i) => a + i);
      h += '<div class="grid">' +
        '<div class="jaw">' + q(r(11, 8).reverse()) + q(r(21, 8)) + '</div>' +
        '<div class="jaw">' + q(r(41, 8).reverse()) + q(r(31, 8)) + '</div>' +
        (S.showMilk ? '<div class="jaw" style="margin-top:8px">' + q(r(51, 5).reverse()) + q(r(61, 5)) + '</div><div class="jaw">' + q(r(81, 5).reverse()) + q(r(71, 5)) + '</div>' : '') +
        '<div style="text-align:center"><button class="link" data-milk="1">' + (S.showMilk ? 'Скрыть молочные' : 'Молочные зубы') + '</button>' +
        '<span class="hint">голубая полоска — зуб есть в услугах</span></div></div>';
    }
    return h;
  }

  function render() {
    const P = root.getElementById('panel'); const ctx = getCtx();
    const prevScroll = P.querySelector('.body') ? P.querySelector('.body').scrollTop : 0;
    if (!S) buildInitialState();
    const pi = positionInfo(); const ti = timeInfo(ctx); const iss = issues(ctx); const hasBad = iss.some((i) => i.lvl === 'bad' && !/код не подтверждён/.test(i.text));
    const R = compose();

    let h = '<div class="hd"><div style="font-size:26px">🦷</div><h1>Медзапись<small>' +
      (ctx ? 'Дневник найден · услуг в визите: ' + S.services.length : 'Дневник не найден') + '</small></h1><button class="x" id="close">×</button></div><div class="body">';

    if (!ctx) {
      h += '<div class="card empty">Откройте визит пациента.<br>Если дневника ещё нет — создам его со стандартным шаблоном.<br><br>' +
        '<button class="btn pri" id="mkdiary" style="flex:none">＋ Создать дневник приёма</button><br><br><button class="link" id="rescan">Обновить</button></div></div>';
      P.innerHTML = h; bind(P); return;
    }

    // Услуги визита
    h += '<div class="sec"><h2>Услуги визита</h2><div class="card">' + (S.services.length ? S.services.map((s) => {
      const isRec = POSITION_BY_CODE.some(([c]) => s.code.startsWith(c));
      const rule = ruleFor(s);
      if (rule) return '<div class="svc"><span class="cd">' + esc(s.code) + '</span><span class="nm">' + esc(s.name.replace(/^\S+\s/, '')) +
        (s.teeth.length ? ' ' + s.teeth.map((t) => '<span class="tchip">' + fmtTooth(t) + '</span>').join(' ') : '') + '</span>' + badge('ok', rule.label) + '</div>';
      const tpl = TEMPLATES.find((t) => (t.triggers || []).some((c) => s.code.startsWith(c)));
      return '<div class="svc"><span class="cd">' + esc(s.code) + '</span><span class="nm">' + esc(s.name.replace(/^\S+\s/, '')) +
        (s.teeth.length ? ' ' + s.teeth.map((t) => '<span class="tchip">' + fmtTooth(t) + '</span>').join(' ') : '') + '</span>' +
        (isRec ? badge('ok', 'приём') : tpl ? badge('ok', tpl.title) : badge('warn', 'нет шаблона')) + '</div>';
    }).join('') : '<div class="hint">Услуги не найдены</div>') + '</div></div>';

    // Блоки
    h += '<div class="sec"><h2>Блоки записи</h2>';
    S.blocks.forEach((b) => {
      const t = tplById(b.tpl);
      h += '<div class="card"><div class="ch"><span class="em">' + t.icon + '</span><span class="ti">' + esc(t.title) + '</span>' +
        (b.src === 'service' ? badge('ok', 'из услуг') : b.src === 'fixed' ? '' : badge('warn', 'добавлен вручную')) +
        (t.fixed ? '' : '<button class="del" data-del="' + b.uid + '" title="Удалить блок">×</button>') + '</div>' +
        renderTeeth(b) + (t.params || []).map((pr) => renderParam(b, pr)).join('') + '</div>';
    });
    h += '<div class="add">' + TEMPLATES.filter((t) => !t.fixed).map((t) => '<button class="addb" data-add="' + t.id + '">＋ ' + t.icon + ' ' + esc(t.title) + '</button>').join('') + '</div></div>';

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

    h += '</div><div class="ft">' + (undoSnap ? '<button class="btn sec2" id="undo">↶ Отменить вставку</button>' : '') +
      '<button class="btn pri" id="insert"' + (hasBad ? ' disabled title="Исправьте пункты с ⛔"' : '') + '>Вставить в визит</button></div>';

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
    if (q('rescan')) q('rescan').onclick = () => { buildInitialState(); render(); };
    if (q('insert')) q('insert').onclick = doInsert;
    if (q('undo')) q('undo').onclick = doUndo;
    if (q('dur')) q('dur').onchange = (e) => { S.duration = Math.max(5, +e.target.value || DEFAULT_DURATION); render(); };
    on('[data-p]', 'change', (e) => { const { b, key } = findBlock(e.target.dataset.p); const pr = tplById(b.tpl).params.find((x) => x.key === key);
      b.params[key] = pr.type === 'number' ? (+e.target.value || pr.default) : e.target.value; delete b.auto[key]; render(); });
    on('[data-seg]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.seg); b.params[key] = e.currentTarget.dataset.v; delete b.auto[key]; render(); });
    on('[data-chip]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.chip); const v = e.currentTarget.dataset.v; const a = b.params[key] || [];
      b.params[key] = a.includes(v) ? a.filter((x) => x !== v) : a.concat(v); delete b.auto[key]; render(); });
    on('[data-tg]', 'click', (e) => { const { b, key } = findBlock(e.currentTarget.dataset.tg); b.params[key] = !b.params[key]; delete b.auto[key]; render(); });
    on('[data-pick]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.pick); b.pickerOpen = !b.pickerOpen; render(); });
    on('[data-tooth]', 'click', (e) => { const b = S.blocks.find((x) => x.uid === +e.currentTarget.dataset.tooth); const t = e.currentTarget.dataset.t;
      b.teeth = b.teeth.includes(t) ? b.teeth.filter((x) => x !== t) : b.teeth.concat(t).sort(); render(); });
    on('[data-milk]', 'click', () => { S.showMilk = !S.showMilk; render(); });
    on('[data-del]', 'click', (e) => { S.blocks = S.blocks.filter((x) => x.uid !== +e.currentTarget.dataset.del); render(); });
    on('[data-add]', 'click', (e) => { const b = newBlock(e.currentTarget.dataset.add, [], 'manual'); b.pickerOpen = !!tplById(b.tpl).needTeeth; S.blocks.push(b); render(); });
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
  document.addEventListener('keydown', (e) => { if (!root) return; if (e.altKey && e.code === 'KeyM') { e.preventDefault(); isOpen ? closePanel() : openPanel(); } if (e.key === 'Escape' && isOpen) closePanel(); }, true);
  console.log('%c[Медзапись] скрипт загружен', 'color:#6366f1;font-weight:bold');
  const start = () => {
    try {
      if (!document.body) return;
      if (host && !document.body.contains(host)) { host = null; }   // страницу перерисовали — монтируем заново
      if (!host) { mount(); console.log('[Медзапись] кнопка добавлена'); }
    } catch (e) { console.error('[Медзапись] ошибка запуска', e); }
  };
  start();
  setInterval(start, 2000);
})();

