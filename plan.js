/* SQNS · Помощник медзаписи — ВКЛАДКА «ПЛАН»: план лечения из тех же сценариев, что во вкладке «Услуги».
 * План → этапы → блоки (сценарии). Этап сохраняется в план SQNS сразу (строки + этап + сохранение плана).
 * Один этап — строки плана без этапа; появился второй — первый переносится в «Этап 1».
 * Формула плана — цепочка: блок видит формулу пациента + изменения всех блоков до него (в SQNS не пишется).
 * Рецепт плана (сценарии, параметры, названия, «примерно через», отпечаток строк) — в комментарии плана SQNS
 * (поля нет в интерфейсе, в печать не попадает). Отпечаток не совпал — этап «изменён вручную», только просмотр.
 * Движок блоков — svc-engine.js (SQNSMZ_SVCVIEW.plan). Панель — engine.js (вызывает render/bind отсюда).
 */
(function () {
  'use strict';
  const V = globalThis.SQNSMZ_SVCVIEW;
  if (!V || !V.plan) { console.error('[Медзапись] svc-engine.js не загружен — вкладка «План» недоступна'); return; }
  const E = V.plan;
  const C = () => globalThis.SQNSMZ_CONFIG || {};

  const MARK = '[sqnsmz-plan:v1]';
  const own = (o, k) => o && Object.prototype.hasOwnProperty.call(o, k);
  const up = (sc, fn) => { let p = sc; while (p) { if (own(p, fn) && typeof p[fn] === 'function') return p; p = p.$parent; } return null; };
  const scopeOf = (el) => { try { return window.angular.element(el).scope(); } catch (e) { return null; } };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const applyRoot = (s) => { const r = s && (s.$root || s); if (r && !r.$$phase) r.$apply(); };
  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (lvl, t) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(t) + '</span>';
  const rub = (n) => (Math.round(n * 100) / 100).toLocaleString('ru-RU') + ' ₽';
  let FMT = (t) => String(t);

  /* ---------------- план SQNS на странице ---------------- */
  function findScope(ctrl, fn) {
    const el = document.querySelector('[ng-controller="' + ctrl + '"]');
    let s = el && up(scopeOf(el), fn);
    if (s) return s;
    for (const e of document.querySelectorAll('[ng-controller]')) { s = up(scopeOf(e), fn); if (s) return s; }
    return null;
  }
  const tabScope = () => findScope('TreatmentPlanTab', 'addNewTreatmentPlan');
  const formScope = () => findScope('TreatmentPlanForm', 'addTreatmentPlanStage');
  const getF = (fs) => (fs.getForm ? fs.getForm() : fs.form) || null;
  const sqStages = (f) => (f.treatmentPlanStages || []).slice().sort((a, b) => a.sortOrder - b.sortOrder);
  const visiblePlans = (tab) => ((tab && tab.treatmentPlans) || []).filter((p) => p.visible !== false && p.visible !== 0);
  const clientOf = (tab) => { try { const c = tab.getClientInfo && tab.getClientInfo(); return c && c.id ? c.id : null; } catch (e) { return null; } };
  async function showPlanTab() {
    const a = document.querySelector('a[href="#treatmentPlan"]');
    if (a && a.parentElement && !a.parentElement.classList.contains('ui-state-active')) { a.click(); await sleep(600); }
  }
  async function waitForm(pred, ms) {
    for (let i = 0; i < (ms || 8000) / 200; i++) {
      const fs = formScope(), f = fs && getF(fs);
      if (f && pred(f)) return fs;
      await sleep(200);
    }
    return null;
  }
  // состав плана SQNS догружает после выбора: ждём, пока число строк перестанет меняться
  async function settle(fs) {
    let n = -1;
    for (let i = 0; i < 15; i++) {
      await sleep(250);
      const f = getF(formScope() || fs), k = ((f && f.treatmentPlanItems) || []).length + ':' + ((f && f.treatmentPlanStages) || []).length;
      if (k === n && i >= 2) break;
      n = k;
    }
    return formScope() || fs;
  }
  // сохранение плана: колбэк SQNS или (запасной путь) у плана, этапов и строк появились номера из базы
  function savePlan(fs) {
    return new Promise((res, rej) => {
      let done = false; const t0 = Date.now();
      const ok = () => { if (done) return; done = true; clearInterval(iv); clearTimeout(to); setTimeout(res, 400); };
      const to = setTimeout(() => { if (!done) { done = true; clearInterval(iv); rej(new Error('SQNS не подтвердил сохранение плана — проверьте план и нажмите «Сохранить» в SQNS')); } }, 25000);
      const num = (x) => typeof x === 'number' || /^\d+$/.test(String(x));
      const iv = setInterval(() => {
        if (Date.now() - t0 < 1200) return;
        const s = formScope(), f = s && getF(s);
        if (f && num(f.id) && (f.treatmentPlanStages || []).every((x) => num(x.id)) && (f.treatmentPlanItems || []).every((x) => num(x.id))) ok();
      }, 300);
      try { fs.save(undefined, ok); applyRoot(fs); } catch (e) { done = true; clearInterval(iv); clearTimeout(to); rej(e); }
    });
  }
  async function addPlanItem(fs, stageID, line, rec) {
    const f0 = getF(fs), before = new Set(f0.treatmentPlanItems || []);
    let NEW = null;
    fs.addTreatmentPlanItem('service', (it) => { NEW = it; }, stageID);
    applyRoot(fs);
    for (let i = 0; i < 25 && !NEW; i++) { NEW = (getF(fs).treatmentPlanItems || []).find((x) => !before.has(x)) || null; if (!NEW) await sleep(200); }
    if (!NEW) throw new Error('SQNS не создал строку плана');
    let row = null;
    for (let i = 0; i < 20 && !row; i++) {
      row = [...document.querySelectorAll('[ng-controller="ServiceTreatmentPlanItemController"]')].find((e) => { const s = scopeOf(e); return s && s.item === NEW; });
      if (!row) await sleep(150);
    }
    if (!row) throw new Error('Строка плана не появилась на странице');
    const rs = scopeOf(row);
    rs.serviceChanged(rec); applyRoot(rs);
    if (line.teeth && line.teeth.length) { const ts = up(rs, 'setTeeth'); if (ts) ts.setTeeth(line.teeth.map(String).sort()); }
    if (line.qty !== 1) {
      NEW.qty = line.qty;
      if (typeof rs.onQtyChange === 'function') rs.onQtyChange();
      const qc = up(rs, 'itemQtyChanged'); if (qc) qc.itemQtyChanged();
      if (typeof NEW.sync === 'function') NEW.sync();
    }
    if ((NEW.stageID || null) !== (stageID || null)) NEW.stageID = stageID;
    applyRoot(rs);
    return NEW;
  }

  /* ---------------- рецепт плана в комментарии ---------------- */
  function splitComment(c) {
    c = String(c || ''); const i = c.indexOf(MARK);
    if (i < 0) return { user: c, recipe: null };
    let r = null; try { r = JSON.parse(c.slice(i + MARK.length)); } catch (e) { r = null; }
    return { user: c.slice(0, i).replace(/\s+$/, ''), recipe: r };
  }
  const joinComment = (user, recipe) => (user ? user + '\n\n' : '') + MARK + JSON.stringify(recipe);
  const fpOne = (sid, teeth, qty) => (+sid) + ':' + (teeth || []).map(String).sort().join('.') + ':' + (+qty || 0);
  const fpLines = (L) => L.map((l) => fpOne(l.id, l.teeth, l.qty)).sort().join('|');
  const isSvc = (it) => (it.type ? it.type === 'service' : !!it.serviceID);
  const fpItems = (items) => items.filter(isSvc).map((i) => fpOne(i.serviceID, i.teeth, i.qty)).sort().join('|');

  /* ---------------- состояние вкладки ---------------- */
  // PS.stages[]: { name, nameTouched, after, blocks: [состояние svc-engine], saved, open, sq (id этапа SQNS), flat (строки без этапа),
  //               ro (только просмотр: items), loose (строки вне этапов), changed (изменён вручную), fp, snap }
  let PS = null, ACT = null;   // ACT — редактируемый блок { si, bi }
  let SET = null;              // какое состояние мы отдали движку в последний раз: { st, si, bi }
  function give(si, bi, st) { E.setState(st); SET = { st, si, bi }; }
  const blank = () => ({ view: 'list', client: null, planId: null, newKey: null, title: '', titleTouched: false, userComment: '', applied: false, stages: [], base: null, busy: false, error: '', confirm: null });
  const VERB = { caries: 'лечение кариеса', hygiene: 'профессиональная гигиена', pulpitis: 'лечение пульпита', periodontitis: 'лечение периодонтита', recalc: 'смена кальция',
    obturation: 'пломбирование каналов', extraction: 'удаление', implant: 'установка имплантатов', fdm: 'установка формирователей десны', sinus: 'синус-лифтинг', nkr: 'костная пластика', ortho: 'протезирование' };
  const CATN = { ther: 'Терапевтическая подготовка', surg: 'Хирургическая подготовка', ortho: 'Ортопедический этап' };
  const AFTER = ['2 нед.', '1 мес.', '2–3 мес.', '3–4 мес.', '4–6 мес.', '6–9 мес.'];
  const chain = () => PS.stages.filter((s) => !s.loose);   // этапы, которые соответствуют этапам SQNS по порядку

  // формула перед блоком (si, bi): формула пациента + изменения всех блоков раньше
  function formulaAt(si, bi) {
    if (!PS.base) return null;
    const j = clone(PS.base);
    PS.stages.forEach((s, i) => { if (i > si || s.ro) return; s.blocks.forEach((st, k) => { if (i === si && k >= bi) return; if (st.scn) E.applyToJson(j, E.withState(st, () => E.formulaOps())); }); });
    return j;
  }
  // расчёт этапа: корзины блоков (строки, сумма, проблемы); onPrice — перерисовать, когда придут цены
  function calcStage(si, onPrice) {
    const s = PS.stages[si], items = [], carts = [];
    s.blocks.forEach((st, bi) => {
      if (!st.scn) { carts.push(null); return; }
      E.setCtx({ formula: formulaAt(si, bi), stageItems: items.slice() });
      const c = E.withState(st, () => E.cartOf(onPrice));
      c.lines.forEach((l) => items.push({ name: (E.SVC[l.id] || {}).code || '', serviceID: l.id, teeth: l.teeth || [] }));
      carts.push(c);
    });
    const lines = carts.filter(Boolean).reduce((a, c) => a.concat(c.lines), []);
    return { carts, lines, total: carts.filter(Boolean).reduce((a, c) => a + c.total, 0), missing: carts.some((c) => c && c.missing), bad: !lines.length || carts.some((c) => c && c.bad) };
  }
  const blockTeeth = (st, c) => (st.teeth && st.teeth.length ? st.teeth.slice() : [...new Set(((c && c.lines) || []).reduce((a, l) => a.concat((l.teeth || []).map(String)), []))]).sort();
  function blockPhrase(st, c) {
    const sc = E.scnById(st.scn); if (!sc) return '';
    const t = blockTeeth(st, c);
    return (VERB[st.scn] || sc.title.toLowerCase()) + (t.length ? ' ' + t.map(FMT).join(', ') : '');
  }
  function autoStageName(s, calc) {
    if (s.ro) return s.name || '';
    const cats = [...new Set(s.blocks.map((st) => (E.scnById(st.scn) || {}).cat).filter(Boolean))];
    const ph = s.blocks.map((st, i) => blockPhrase(st, calc && calc.carts[i])).filter(Boolean);
    if (!ph.length) return '';
    const pre = cats.length === 1 ? CATN[cats[0]] || 'Этап' : cats.includes('ortho') ? 'Комплексный этап' : 'Хирургическая и терапевтическая подготовка';
    return (pre + ' — ' + ph.join('; ')).slice(0, 250);
  }
  const stageName = (s, calc) => (s.nameTouched && s.name ? s.name : autoStageName(s, calc) || 'Этап');
  function autoTitle(calcs) {
    const parts = chain().map((s) => { const i = PS.stages.indexOf(s); if (s.ro) return s.name; return s.blocks.map((st, k) => blockPhrase(st, calcs[i] && calcs[i].carts[k])).filter(Boolean).join(', '); }).filter(Boolean);
    const t = parts.join(' → ');
    return t ? (t[0].toUpperCase() + t.slice(1)).slice(0, 120) : 'План лечения';
  }
  const planTitle = (calcs) => (PS.titleTouched && PS.title ? PS.title : autoTitle(calcs));
  function recipe(calcs) {
    return { v: 1, stages: chain().map((s) => {
      const i = PS.stages.indexOf(s);
      if (s.ro) return { ro: true, name: s.name, after: s.after || '' };
      return { name: s.nameTouched ? s.name : '', nameTouched: !!s.nameTouched, after: s.after || '', fp: s.fp || fpLines(calcs[i].lines), blocks: s.blocks.filter((st) => st.scn).map(E.stateJSON) };
    }) };
  }

  /* ---------------- запись в SQNS ---------------- */
  async function ensurePlan() {
    await showPlanTab();
    const tab = tabScope(); if (!tab) throw new Error('Вкладка «Планы лечения» не найдена — откройте карточку пациента');
    let fs = formScope();
    if (PS.planId) {
      if (fs && getF(fs) && getF(fs).id === PS.planId) return fs;
      const p = visiblePlans(tab).find((x) => x.id === PS.planId); if (!p) throw new Error('План не найден в списке планов пациента');
      tab.selectTreatmentPlan(p.__id__); applyRoot(tab);
      fs = await waitForm((f) => f.id === PS.planId); if (!fs) throw new Error('План не открылся');
      return settle(fs);
    }
    const prev = PS.newKey && visiblePlans(tab).find((x) => x.__id__ === PS.newKey && !x.id);   // новый план от прошлой неудачной попытки
    if (prev) { tab.selectTreatmentPlan(prev.__id__); applyRoot(tab); fs = await waitForm((f) => !f.id); if (fs) return fs; }
    tab.addNewTreatmentPlan(); applyRoot(tab);
    PS.newKey = (tab.selectedTreatmentPlan || {}).__id__ || null;
    fs = await waitForm((f) => !f.id); if (!fs) throw new Error('SQNS не создал новый план');
    return fs;
  }
  const findSq = (f, id) => (f.treatmentPlanStages || []).find((x) => x.id === id) || null;
  // записать названия этапов, рецепт, заголовок и сохранить; потом сопоставить этапы SQNS по порядку
  async function commit(fs, calcs) {
    let f = getF(fs);
    chain().forEach((s, k) => { const i = PS.stages.indexOf(s); const st = s.sq ? findSq(f, s.sq) : null; if (st && !s.ro) st.name = stageName(s, calcs[i]); });
    f.title = planTitle(calcs);
    f.comment = joinComment(PS.userComment, recipe(calcs));
    if (PS.finishing) f.applied = !!PS.applied;
    fs.$emit('formSetChanged', true); applyRoot(fs);
    await savePlan(fs);
    fs = formScope() || fs; f = getF(fs);
    PS.planId = f.id || ((tabScope() || {}).selectedTreatmentPlan || {}).id || PS.planId;
    const sq = sqStages(f), ch = chain();
    if (sq.length) ch.forEach((s, k) => { if (sq[k]) { s.sq = sq[k].id; s.flat = false; } });
    return fs;
  }
  const stageItemsOf = (f, s) => (f.treatmentPlanItems || []).filter((it) => (s.flat ? it.stageID == null : s.sq != null && it.stageID === s.sq));
  function dropItems(fs, s) {
    const f = getF(fs), old = stageItemsOf(f, s);
    if (old.some((it) => +it.providedQty > 0)) throw new Error('По этому этапу уже оказаны услуги — изменить его можно только в SQNS');
    old.forEach((it) => fs.removeTreatmentPlanItemRow(it)); applyRoot(fs);
  }
  async function run(API, fn, okMsg) {
    if (PS.busy) return;
    PS.busy = true; PS.error = ''; API.rerender();
    try { await fn(); if (okMsg) API.toast(okMsg, 'ok'); }
    catch (e) { PS.error = String((e && e.message) || e); API.toast('Ошибка: ' + PS.error, 'bad'); }
    PS.busy = false; PS.finishing = false; API.rerender();
  }
  function saveStage(API, si) {
    const s = PS.stages[si];
    s.blocks = s.blocks.filter((st) => st.scn);
    return run(API, async () => {
      const calc0 = calcStage(si);
      if (calc0.bad) throw new Error('В этапе есть незаполненные поля');
      for (const l of calc0.lines) { if (!(await E.loadCard(l.id))) throw new Error('Не нашёл в SQNS услугу ' + ((E.SVC[l.id] || {}).code || l.id)); }
      let fs = await ensurePlan();
      const added = [], made = [], wasSaved = s.saved, sq0 = s.sq, flat0 = s.flat;
      let touched = false;
      try {
        if (s.saved) { dropItems(fs, s); touched = true; }
        const list = chain().filter((x) => x.saved || x === s);
        let stageID = null;
        if (list.length >= 2) {
          const f = getF(fs);
          if (!sqStages(f).length) {   // план был из одного этапа без этапов SQNS — первый уходит в «Этап 1»
            const first = list.find((x) => x.flat) || list[0];
            const s1 = fs.addTreatmentPlanStage(null); s1.name = 'Этап 1'; touched = true;
            (f.treatmentPlanItems || []).filter((it) => it.stageID == null).forEach((it, k) => fs.moveItemToStage(it, s1, k));
            first.sq = s1.id; first.flat = false; applyRoot(fs);
          }
          if (!s.sq) { const r = fs.addTreatmentPlanStage(null); r.name = 'Этап'; s.sq = r.id; made.push(r); applyRoot(fs); }
          stageID = s.sq;
        } else { s.flat = true; s.sq = null; }
        for (const l of calc0.lines) added.push(await addPlanItem(fs, stageID, l, await E.loadCard(l.id)));
        s.fp = fpLines(calc0.lines); s.saved = true;
        const calcs = PS.stages.map((x, i) => (x.ro ? null : calcStage(i)));
        await commit(fs, calcs);
      } catch (e) {
        // откат того, что успели добавить в форму плана (в базу не ушло)
        try { added.forEach((it) => fs.removeTreatmentPlanItemRow(it)); made.forEach((r) => fs.removeTreatmentPlanStage(r)); applyRoot(fs); } catch (e2) { /* */ }
        s.saved = wasSaved; s.sq = made.length ? sq0 : s.sq; s.flat = flat0;
        throw new Error(String((e && e.message) || e) + (touched ? '. Несохранённые изменения плана в SQNS сбросятся, если обновить страницу (F5)' : ''));
      }
      s.open = false; s.snap = null; ACT = null;
    }, 'Этап сохранён в плане SQNS');
  }
  function deleteStage(API, si) {
    const s = PS.stages[si];
    if (!s.saved) { PS.stages.splice(si, 1); if (ACT && ACT.si === si) ACT = null; API.rerender(); return; }
    return run(API, async () => {
      const fs = await ensurePlan();
      dropItems(fs, s);
      if (s.sq) { const st = findSq(getF(fs), s.sq); if (st) fs.removeTreatmentPlanStage(st); }
      applyRoot(fs);
      PS.stages.splice(si, 1); ACT = null;
      await commit(fs, PS.stages.map((x, i) => (x.ro ? null : calcStage(i))));
    }, 'Этап удалён');
  }
  function moveStage(API, si, d) {
    const ch = chain(), k = ch.indexOf(PS.stages[si]), a = ch[k], b = ch[k + d];
    if (!a || !b || !a.sq || !b.sq) return;
    return run(API, async () => {
      const fs = await ensurePlan(), f = getF(fs), A = findSq(f, a.sq), B = findSq(f, b.sq);
      if (!A || !B) throw new Error('Этапы плана в SQNS не совпадают с этапами здесь — откройте план заново');
      const t = A.sortOrder; A.sortOrder = B.sortOrder; B.sortOrder = t;
      const ia = PS.stages.indexOf(a), ib = PS.stages.indexOf(b); PS.stages[ia] = b; PS.stages[ib] = a;
      if (typeof fs.updateTreatmentPlan === 'function') fs.updateTreatmentPlan();
      await commit(fs, PS.stages.map((x, i) => (x.ro ? null : calcStage(i))));
    }, 'Порядок этапов изменён');
  }
  function finish(API) {
    if (!PS.planId) { PS = null; API.rerender(); return; }
    PS.finishing = true;
    return run(API, async () => {
      const fs = await ensurePlan();
      await commit(fs, PS.stages.map((x, i) => (x.ro ? null : calcStage(i))));
      const keep = PS.client; PS = blank(); PS.client = keep;
    }, 'План сохранён');
  }

  /* ---------------- открыть существующий план ---------------- */
  function openPlan(API, p) {
    return run(API, async () => {
      await showPlanTab();
      const tab = tabScope(); if (!tab) throw new Error('Вкладка «Планы лечения» не найдена');
      tab.selectTreatmentPlan(p.__id__); applyRoot(tab);
      let fs = await waitForm((f) => f.id === p.id); if (!fs) throw new Error('План не открылся');
      fs = await settle(fs);
      const f = getF(fs), { user, recipe: R } = splitComment(f.comment), items = f.treatmentPlanItems || [], sq = sqStages(f);
      const rs = (R && Array.isArray(R.stages)) ? R.stages : [];
      let groups = sq.map((x) => ({ sq: x.id, name: x.name, items: items.filter((it) => it.stageID === x.id) }));
      const loose = items.filter((it) => it.stageID == null || !sq.some((x) => x.id === it.stageID));
      if (!sq.length) groups = items.length || rs.length ? [{ flat: true, name: f.title, items }] : [];
      else if (loose.length) groups.push({ loose: true, name: 'Без этапа', items: loose });
      const stages = groups.map((g, k) => {
        const r = g.loose ? null : rs[k];
        const base = { saved: true, sq: g.sq || null, flat: !!g.flat, loose: !!g.loose, after: (r && r.after) || '' };
        if (r && !r.ro && Array.isArray(r.blocks) && r.fp === fpItems(g.items)) {
          return Object.assign(base, { name: r.nameTouched ? g.flat ? r.name : g.name : '', nameTouched: !!r.nameTouched, fp: r.fp, blocks: r.blocks.map((o) => E.stateFrom(o)) });
        }
        return Object.assign(base, { ro: true, changed: !!(r && !r.ro), name: g.flat ? (r && r.name) || 'Этап' : g.name, nameTouched: true, blocks: [],
          items: g.items.filter(isSvc).map((it) => ({ name: it.name, teeth: it.teeth || [], qty: +it.qty || 0, sum: +it.sum || 0, provided: +it.providedQty > 0 })) });
      });
      const keep = PS.client;
      PS = Object.assign(blank(), { view: 'build', client: keep, planId: f.id, title: f.title || '', titleTouched: true, userComment: user, applied: !!f.applied, stages, base: baseFormula(API), hadRecipe: !!R });
      ACT = null;
    });
  }
  function baseFormula(API) {
    let j = E.liveFormula(API);
    if (typeof j === 'string') { try { j = JSON.parse(j); } catch (e) { j = null; } }
    return j && j.permanentTeeth ? clone(j) : null;
  }

  /* ---------------- рендер ---------------- */
  const CSS = `
  .pl-plan{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:10px 12px;margin:6px 0;cursor:pointer}
  .pl-plan:hover{border-color:#a5b4fc;background:#fafbff} .pl-plan .pl-pt{flex:1;min-width:0} .pl-plan b{display:block;font-size:13.5px;color:#0f172a}
  .pl-plan small{color:#64748b;font-size:11.5px} .pl-plan .pl-ps{font-weight:700;color:#334155;white-space:nowrap}
  .pl-stage{border:1.5px solid #e2e8f0;border-radius:14px;background:#fff;margin:10px 0;overflow:hidden}
  .pl-stage.open{border-color:#818cf8;box-shadow:0 4px 16px rgba(79,70,229,.12)}
  .pl-sh{display:flex;align-items:flex-start;gap:8px;padding:10px 12px}
  .pl-sh .pl-pn{font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#6366f1;font-weight:800}
  .pl-sh .pl-pt{flex:1;min-width:0} .pl-sh .pl-pt b{display:block;font-size:13px;color:#0f172a;line-height:1.35}
  .pl-sh .pl-pm{font-size:11.5px;color:#64748b;margin-top:2px} .pl-sh .pl-ps{font-weight:800;color:#334155;white-space:nowrap;font-size:13px}
  .pl-act{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
  .pl-ib{border:1px solid #e2e8f0;background:#fff;border-radius:8px;min-width:28px;height:28px;cursor:pointer;color:#475569;font-size:13px;padding:0 7px}
  .pl-ib:hover:not(:disabled){border-color:#818cf8;color:#3730a3} .pl-ib:disabled{opacity:.35;cursor:default} .pl-ib.del:hover{border-color:#fca5a5;color:#b91c1c}
  .pl-ib.warn{border-color:#fca5a5;color:#b91c1c;background:#fef2f2}
  .pl-sb{padding:2px 12px 12px;border-top:1px dashed #e2e8f0}
  .pl-in{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin:8px 0} .pl-in label{font-size:12px;color:#475569;font-weight:600}
  .pl-chips{display:flex;flex-wrap:wrap;gap:4px;margin-top:4px} .pl-chips button{border:1px solid #e2e8f0;background:#f8fafc;border-radius:8px;padding:3px 8px;font-size:11.5px;cursor:pointer;color:#334155}
  .pl-chips button.on{border-color:#818cf8;background:#eef2ff;color:#3730a3;font-weight:700}
  .pl-blk{display:flex;align-items:center;gap:8px;border:1px solid #e2e8f0;border-radius:10px;padding:7px 9px;margin:6px 0;background:#f8fafc}
  .pl-blk .pl-bt{flex:1;min-width:0;font-size:12.5px;color:#334155} .pl-blk .pl-bt b{color:#0f172a} .pl-blk .pl-ps{font-weight:700;font-size:12.5px;white-space:nowrap}
  .pl-edit{border:1.5px dashed #c7d2fe;border-radius:12px;padding:6px 8px;margin:8px 0;background:#fcfcff}
  .pl-edit .sec h2{font-size:12px} .pl-eh{display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:#6366f1;font-weight:800;margin:2px 2px 4px}
  .pl-add{width:100%;border:1.5px dashed #a5b4fc;background:#f5f7ff;color:#4338ca;border-radius:12px;padding:10px;font-weight:700;cursor:pointer;font-size:13px;margin:6px 0}
  .pl-add:hover:not(:disabled){background:#eef2ff} .pl-add:disabled{opacity:.5;cursor:default}
  .pl-ro{font-size:12px;color:#334155} .pl-ro div{display:flex;gap:8px;justify-content:space-between;padding:3px 0;border-bottom:1px dashed #eef2f7} .pl-ro div:last-child{border:0}
  .pl-tot{display:flex;justify-content:space-between;font-weight:800;font-size:14px;padding:8px 4px}
  .pl-act2{display:flex;align-items:center;gap:8px;flex:1} .pl-act2 label{font-size:12.5px;color:#334155;font-weight:600;cursor:pointer}
  `;

  // формула-подсказка для сеток зубов внутри блока
  const marksOf = (j) => { try { return j && C().formulaMarks ? C().formulaMarks(j) : null; } catch (e) { return null; } };

  function render(API) {
    FMT = API.fmtTooth || FMT;
    const tab = tabScope(), cl = clientOf(tab);
    if (!PS || (cl && PS.client && cl !== PS.client)) { PS = blank(); ACT = null; }
    if (cl) PS.client = cl;
    if (PS.view === 'list') return renderList(API, tab);
    return renderBuild(API);
  }
  function renderList(API, tab) {
    if (!tab) return { body: '<div class="card empty">Откройте карточку пациента — план лечения собирается для него.</div>', foot: '' };
    const plans = visiblePlans(tab).filter((p) => p.id).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    let h = '<div class="sec"><button class="pl-add" data-pl="new"' + (PS.busy ? ' disabled' : '') + '>＋ Новый план лечения</button></div>';
    h += '<div class="sec"><h2>Планы пациента</h2>' + (plans.length ? plans.map((p) =>
      '<button class="pl-plan" data-plo="' + esc(p.__id__) + '"' + (PS.busy ? ' disabled' : '') + '><span class="pl-pt"><b>' + esc(p.title || 'Без названия') + '</b><small>' + esc(p.dateFormatted || '') +
      (String(p.comment || '').includes(MARK) ? ' · собран здесь' : '') + '</small></span>' + (+p.applied ? badge('ok', 'активный') : '') +
      '<span class="pl-ps">' + rub(+p.totalPrice || 0) + '</span></button>').join('') : '<div class="hint">У пациента пока нет планов</div>') + '</div>';
    if (PS.error) h += '<div class="sec"><div class="iss"><div class="bad">⛔ ' + esc(PS.error) + '</div></div></div>';
    return { body: h, foot: '' };
  }
  function renderBuild(API) {
    // движок мог заменить состояние редактируемого блока (выбор другого шаблона) — забираем его
    if (ACT && SET && SET.si === ACT.si && SET.bi === ACT.bi && E.inPlan()) {
      const s = PS.stages[ACT.si], cur = E.getState();
      if (s && cur && cur !== SET.st && s.blocks[ACT.bi] === SET.st) s.blocks[ACT.bi] = cur;
    }
    SET = null;
    const rr = () => API.rerender();
    const calcs = PS.stages.map((s, i) => (s.ro ? null : calcStage(i, rr)));
    const openSi = PS.stages.findIndex((s) => s.open), B = PS.busy, ch = chain();
    let h = '<div class="sec"><button class="link" data-pl="back"' + (B || openSi >= 0 ? ' disabled' : '') + '>← Все планы</button></div>';
    h += '<div class="sec"><div class="card"><div class="pl-in" style="margin:0"><label>Название плана</label><input type="text" data-plt="1" value="' + esc(PS.titleTouched ? PS.title : '') + '" placeholder="' + esc(autoTitle(calcs)) + '"></div>' +
      (PS.planId ? '' : '<div class="hint" style="margin-top:6px">План появится в SQNS при сохранении первого этапа.</div>') +
      (PS.planId && !PS.hadRecipe && PS.stages.some((s) => s.ro) ? '<div style="margin-top:6px">' + badge('warn', 'план собран не здесь — его этапы только для просмотра, новые этапы добавлять можно') + '</div>' : '') + '</div></div>';
    let total = 0, missing = false;
    PS.stages.forEach((s, si) => {
      const c = calcs[si];
      const sum = s.ro ? s.items.reduce((a, x) => a + x.sum, 0) : c.total; total += sum; if (c && c.missing) missing = true;
      const nShown = ch.length > 1 || s.loose ? (s.loose ? 'Без этапа' : 'Этап ' + (ch.indexOf(s) + 1)) : 'План';
      if (s.open) { h += renderOpenStage(API, s, si, c, nShown); return; }
      const k = ch.indexOf(s), canMove = !B && openSi < 0 && !s.loose && s.sq;
      const conf = PS.confirm === si;
      h += '<div class="pl-stage"><div class="pl-sh"><div class="pl-pt"><div class="pl-pn">' + esc(nShown) + (s.after && k > 0 ? ' · ≈ через ' + esc(s.after) : '') + '</div><b>' + esc(stageName(s, c)) + '</b>' +
        (s.ro ? '<div class="pl-pm">' + (s.changed ? badge('warn', 'изменён в SQNS вручную — только просмотр') : s.loose ? '' : badge('warn', 'только просмотр')) + '</div>' : c.bad ? '<div class="pl-pm">' + badge('bad', 'есть незаполненные поля') + '</div>' : '') +
        '</div><div><div class="pl-ps">' + (c && c.missing ? '…' : rub(sum)) + '</div><div class="pl-act" style="margin-top:6px">' +
        (s.ro || s.loose ? '' : '<button class="pl-ib" data-pls="' + si + '" title="Изменить"' + (B || openSi >= 0 ? ' disabled' : '') + '>✎</button>') +
        (!s.loose ? '<button class="pl-ib" data-plu="' + si + '" title="Выше"' + (canMove && k > 0 && ch[k - 1].sq ? '' : ' disabled') + '>↑</button><button class="pl-ib" data-pld="' + si + '" title="Ниже"' + (canMove && k < ch.length - 1 && ch[k + 1].sq ? '' : ' disabled') + '>↓</button>' : '') +
        (s.loose ? '' : '<button class="pl-ib del' + (conf ? ' warn' : '') + '" data-plx="' + si + '" title="Удалить этап"' + (B || openSi >= 0 ? ' disabled' : '') + '>' + (conf ? 'Удалить?' : '🗑') + '</button>') +
        '</div></div></div>' + (s.ro ? '<div class="pl-sb pl-ro">' + s.items.map((x) => '<div><span>' + esc(x.name) + (x.teeth.length ? ' ' + x.teeth.map(FMT).join(', ') : '') + (x.qty !== 1 ? ' × ' + x.qty : '') + (x.provided ? ' ' + badge('ok', 'оказано') : '') + '</span><span>' + rub(x.sum) + '</span></div>').join('') + '</div>' : '') + '</div>';
    });
    if (openSi < 0) h += '<button class="pl-add" data-pl="stage"' + (B ? ' disabled' : '') + '>＋ Добавить этап</button>';
    if (PS.stages.length) h += '<div class="pl-tot"><span>Итого по плану</span><span>' + (missing ? '…' : rub(total)) + '</span></div>';
    if (PS.error) h += '<div class="sec"><div class="iss"><div class="bad">⛔ ' + esc(PS.error) + '</div></div></div>';

    let foot;
    if (openSi >= 0) {
      const c = calcs[openSi];
      foot = '<button class="btn sec2" data-pl="cancel"' + (B ? ' disabled' : '') + '>Отмена</button><button class="btn pri" data-pl="save"' + (B || !c || c.bad ? ' disabled' : '') + '>' + (B ? 'Сохраняю…' : '💾 Сохранить этап') + '</button>';
    } else {
      foot = '<div class="pl-act2"><button class="tg ' + (PS.applied ? 'on' : '') + '" data-pl="applied" id="plap"' + (B ? ' disabled' : '') + '></button><label for="plap">Сделать план активным</label></div>' +
        '<button class="btn pri" data-pl="finish" style="flex:none"' + (B ? ' disabled' : '') + '>' + (B ? 'Сохраняю…' : '✓ Завершить') + '</button>';
    }
    // в конце: движок должен смотреть на редактируемый блок (события полей меняют именно его)
    if (ACT && PS.stages[ACT.si] && PS.stages[ACT.si].blocks[ACT.bi]) {
      const s = PS.stages[ACT.si], st = s.blocks[ACT.bi], items = [];
      s.blocks.slice(0, ACT.bi).forEach((b2, i) => { const cc = calcs[ACT.si] && calcs[ACT.si].carts[i]; if (cc) cc.lines.forEach((l) => items.push({ name: (E.SVC[l.id] || {}).code || '', serviceID: l.id, teeth: l.teeth || [] })); });
      E.setCtx({ formula: formulaAt(ACT.si, ACT.bi), stageItems: items }); give(ACT.si, ACT.bi, st);
    }
    return { body: h, foot };
  }
  function renderOpenStage(API, s, si, c, nShown) {
    const k = chain().indexOf(s), B = PS.busy;
    let h = '<div class="pl-stage open"><div class="pl-sh"><div class="pl-pt"><div class="pl-pn">' + esc(nShown) + (s.saved ? ' · правка' : ' · новый') + '</div></div><div class="pl-ps">' + (c.missing ? '…' : rub(c.total)) + '</div></div><div class="pl-sb">';
    h += '<div class="pl-in"><label>Название этапа</label><input type="text" data-pln="' + si + '" value="' + esc(s.nameTouched ? s.name : '') + '" placeholder="' + esc(autoStageName(s, c) || 'появится по шаблонам') + '"></div>';
    if (k > 0) h += '<div class="pl-in"><label>Примерно через</label><div><input type="text" data-pla="' + si + '" value="' + esc(s.after || '') + '" placeholder="после предыдущего этапа"><div class="pl-chips">' +
      AFTER.map((a) => '<button data-plac="' + si + '" data-v="' + esc(a) + '" class="' + (s.after === a ? 'on' : '') + '">' + esc(a) + '</button>').join('') + '</div></div></div>';
    s.blocks.forEach((st, bi) => {
      const active = ACT && ACT.si === si && ACT.bi === bi, sc = E.scnById(st.scn), cc = c.carts[bi];
      if (active) {
        E.setCtx({ formula: formulaAt(si, bi), stageItems: c.carts.slice(0, bi).filter(Boolean).reduce((a, x) => a.concat(x.lines.map((l) => ({ name: (E.SVC[l.id] || {}).code || '', serviceID: l.id, teeth: l.teeth || [] }))), []) });
        give(si, bi, st);
        const f = formulaAt(si, bi);
        const r = V.render(Object.assign({}, API, { marks: () => marksOf(f) }));
        h += '<div class="pl-edit"><div class="pl-eh"><span>' + (sc ? 'Блок ' + (bi + 1) : 'Выберите шаблон') + '</span>' +
          (s.blocks.length > 1 || sc ? '<span><button class="link" data-plbc="1"' + (sc ? '' : ' disabled') + '>Свернуть</button> · <button class="link" data-plbx="' + bi + '">Убрать блок</button></span>' : '') + '</div>' + r.body + '</div>';
        return;
      }
      if (!sc) return;
      h += '<div class="pl-blk"><span style="font-size:18px">' + esc(sc.icon) + '</span><span class="pl-bt"><b>' + esc(sc.title) + '</b>' + (blockTeeth(st, cc).length ? ' · ' + blockTeeth(st, cc).map(FMT).join(', ') : '') +
        (cc && cc.bad ? ' ' + badge('bad', 'не заполнено') : '') + '</span><span class="pl-ps">' + (cc && cc.missing ? '…' : rub(cc ? cc.total : 0)) + '</span>' +
        '<button class="pl-ib" data-plbe="' + bi + '"' + (B ? ' disabled' : '') + ' title="Изменить">✎</button><button class="pl-ib del" data-plbx="' + bi + '"' + (B ? ' disabled' : '') + ' title="Убрать">✕</button></div>';
    });
    h += '<button class="pl-add" data-pl="block"' + (B ? ' disabled' : '') + '>＋ Добавить в этот этап</button>';
    return h + '</div></div>';
  }

  function bind(P, API) {
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    const rr = () => API.rerender();
    const openStage = () => PS.stages.findIndex((s) => s.open);
    const activate = (si, bi) => { ACT = { si, bi }; const st = PS.stages[si].blocks[bi]; const sc = E.scnById(st.scn); E.setOpenCat(sc ? sc.cat : null); };
    on('[data-plo]', 'click', (e) => { const id = e.currentTarget.dataset.plo; const p = visiblePlans(tabScope()).find((x) => String(x.__id__) === id); if (p) openPlan(API, p); });
    on('[data-plt]', 'input', (e) => { PS.title = e.target.value.trim() ? e.target.value : ''; PS.titleTouched = !!PS.title; });
    on('[data-pln]', 'input', (e) => { const s = PS.stages[+e.target.dataset.pln]; s.name = e.target.value.trim() ? e.target.value : ''; s.nameTouched = !!s.name; });
    on('[data-pla]', 'input', (e) => { PS.stages[+e.target.dataset.pla].after = e.target.value.trim(); });
    on('[data-plac]', 'click', (e) => { const s = PS.stages[+e.currentTarget.dataset.plac], v = e.currentTarget.dataset.v; s.after = s.after === v ? '' : v; rr(); });
    on('[data-pls]', 'click', (e) => {   // раскрыть сохранённый этап
      const si = +e.currentTarget.dataset.pls, s = PS.stages[si];
      s.snap = JSON.stringify({ name: s.name, nameTouched: s.nameTouched, after: s.after, blocks: s.blocks.map(E.stateJSON) });
      s.open = true; PS.confirm = null; activate(si, 0); rr();
    });
    on('[data-plu]', 'click', (e) => moveStage(API, +e.currentTarget.dataset.plu, -1));
    on('[data-pld]', 'click', (e) => moveStage(API, +e.currentTarget.dataset.pld, 1));
    on('[data-plx]', 'click', (e) => { const si = +e.currentTarget.dataset.plx; if (PS.confirm !== si) { PS.confirm = si; rr(); return; } PS.confirm = null; deleteStage(API, si); });
    on('[data-plbe]', 'click', (e) => { const si = openStage(); activate(si, +e.currentTarget.dataset.plbe); rr(); });
    on('[data-plbc]', 'click', () => { ACT = null; rr(); });
    on('[data-plbx]', 'click', (e) => { const si = openStage(), bi = +e.currentTarget.dataset.plbx, s = PS.stages[si]; s.blocks.splice(bi, 1);
      if (ACT && ACT.si === si) { if (ACT.bi === bi) ACT = null; else if (ACT.bi > bi) ACT.bi--; }
      if (!s.blocks.length) { s.blocks.push(E.fresh(null)); activate(si, 0); }
      rr(); });
    on('[data-pl]', 'click', (e) => {
      const a = e.currentTarget.dataset.pl;
      if (a === 'new') { const keep = PS.client; PS = Object.assign(blank(), { view: 'build', client: keep, base: baseFormula(API) }); ACT = null; rr(); return; }
      if (a === 'back') { const keep = PS.client; PS = blank(); PS.client = keep; ACT = null; rr(); return; }
      if (a === 'stage') { PS.stages.push({ name: '', nameTouched: false, after: '', blocks: [E.fresh(null)], saved: false, open: true }); PS.confirm = null; activate(PS.stages.length - 1, 0); rr(); return; }
      if (a === 'block') { const si = openStage(), s = PS.stages[si]; s.blocks = s.blocks.filter((st) => st.scn); s.blocks.push(E.fresh(null)); activate(si, s.blocks.length - 1); rr(); return; }
      if (a === 'cancel') {
        const si = openStage(), s = PS.stages[si]; ACT = null;
        if (!s.saved) PS.stages.splice(si, 1);
        else { const o = JSON.parse(s.snap); Object.assign(s, { name: o.name, nameTouched: o.nameTouched, after: o.after, blocks: o.blocks.map((x) => E.stateFrom(x)), open: false, snap: null }); }
        rr(); return;
      }
      if (a === 'save') { saveStage(API, openStage()); return; }
      if (a === 'applied') { PS.applied = !PS.applied; rr(); return; }
      if (a === 'finish') { finish(API); return; }
    });
    // поля редактируемого блока — обработчики движка «Услуг»
    if (ACT && PS && PS.view === 'build') V.bind(P, Object.assign({}, API, { marks: () => marksOf(E.inPlan() ? formulaAt(ACT.si, ACT.bi) : null) }));
  }
  // выход из вкладки: состояние «Услуг» возвращается
  function leave() { E.leave(); }

  globalThis.SQNSMZ_PLANVIEW = { css: CSS, render, bind, leave, _test: { state: () => PS, act: () => ACT, splitComment, joinComment, fpItems, fpLines, MARK, reset: () => { PS = null; ACT = null; } } };
})();
