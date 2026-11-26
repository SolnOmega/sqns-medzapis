/* SQNS · Помощник медзаписи — ВКЛАДКА «УСЛУГИ»: сценарии → корзина → строки услуг визита SQNS.
 * Сценарии — в services.js. Панель и общие функции — в engine.js (он вызывает render/bind отсюда).
 * Запись идёт теми же функциями SQNS, что и ручной ввод: addItem → serviceChanged(карточка) → setTeeth → количество.
 * Визит не сохраняется: кнопку «Сохранить» нажимает врач.
 */
(function () {
  'use strict';
  const D = globalThis.SQNSMZ_SERVICES;
  if (!D) { console.error('[Медзапись] services.js не загружен'); return; }
  const { SVC, SCENARIOS } = D;

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

  /* ---------------- состояние вкладки ---------------- */
  let SS = null;
  // значения полей карточки зуба по умолчанию
  function cardDefaults(pr) {
    const c = {};
    pr.fields.forEach((f) => {
      if (f.type === 'fillings') c[f.key] = [{ mat: (f.materials[0] || {}).v, cls: '' }];
      else c[f.key] = f.default !== undefined ? clone(f.default) : f.type === 'toggle' ? false : null;
    });
    return c;
  }
  function fresh(id) {
    const sc = scnById(id);
    const st = { scn: id, teeth: [], params: {}, touched: {}, more: {}, busy: false, done: null, error: '' };
    (sc ? sc.params : []).forEach((pr) => {
      if (pr.type === 'perTooth' || pr.type === 'teethCards') st.params[pr.key] = {};
      else if (pr.default !== undefined) st.params[pr.key] = clone(pr.default);
      else if (pr.type === 'counter') st.params[pr.key] = pr.min || 0;
      else if (pr.type === 'toggle') st.params[pr.key] = false;
      else if (pr.type === 'opt') st.params[pr.key] = null;
      else if (pr.options) st.params[pr.key] = pr.options[0].v;
    });
    autoParams(st);
    return st;
  }
  function autoParams(st) {
    const sc = scnById(st.scn); if (!sc) return;
    sc.params.forEach((pr) => {
      if (pr.type === 'perTooth' || pr.type === 'teethCards') {
        const m = st.params[pr.key] = st.params[pr.key] || {};
        Object.keys(m).forEach((t) => { if (!st.teeth.includes(t)) delete m[t]; });
        st.teeth.forEach((t) => { if (!m[t]) m[t] = pr.type === 'perTooth' ? (pr.default || pr.options[0].v) : cardDefaults(pr); });
        return;
      }
      if (pr.auto && !st.touched[pr.key]) st.params[pr.key] = pr.auto(st.teeth, st.params);
    });
  }
  function lines() {
    const sc = scnById(SS.scn); if (!sc) return [];
    const L = sc.build(SS.params, SS.teeth.slice().sort());
    const vf = visitForm(), items = vf ? visitItems(vf) : [];
    L.forEach((l) => {
      const s = SVC[l.id] || {};
      if (l.skipIfCode && items.some((it) => normCode(it.name).startsWith(l.skipIfCode))) l.skip = 'уже в визите';
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
  .optc{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
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
  `;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (lvl, t) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(t) + '</span>';
  const rub = (n) => (Math.round(n * 100) / 100).toLocaleString('ru-RU') + ' ₽';
  const segH = (attr, opts, cur) => '<div class="seg">' + opts.map((o) => '<button ' + attr + ' data-v="' + esc(o.v) + '" class="' + (o.v === cur ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div>';
  // выключатель + выбор варианта (значение null — выключено)
  const optH = (attrT, attrV, opts, cur) => '<div class="optc"><button class="tg ' + (cur ? 'on' : '') + '" ' + attrT + '></button>' + (cur ? segH(attrV, opts, cur) : '') + '</div>';

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
  function renderCards(pr, API) {
    if (!SS.teeth.length) return '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', 'отметьте зубы') + '</div></div>';
    const store = SS.params[pr.key] || {};
    return SS.teeth.slice().sort().map((t) => {
      const c = store[t] || {};
      const row = (f) => {
        const a = pr.key + '|' + t + '|' + f.key;
        let ctl = '';
        if (f.type === 'toggle') ctl = '<button class="tg ' + (c[f.key] ? 'on' : '') + '" data-ctg="' + a + '"></button>';
        else if (f.type === 'opt') ctl = optH('data-copt="' + a + '"', 'data-coptv="' + a + '"', f.options, c[f.key]);
        else if (f.type === 'fillings') return '<div class="frow"><div class="flbl">' + esc(f.label) + '</div>' + renderFillings(pr.key, f, t, c[f.key] || []) + '</div>';
        return '<div class="row"><label>' + esc(f.label) + '</label><div>' + ctl + '</div></div>';
      };
      const main = pr.fields.filter((f) => !f.adv), adv = pr.fields.filter((f) => f.adv);
      const advOn = adv.filter((f) => c[f.key]).length, open = SS.more[t] || advOn > 0;
      return '<div class="tcard"><div class="tch"><span class="tchip">Зуб ' + API.fmtTooth(t) + '</span></div>' + main.map(row).join('') +
        (adv.length ? (open ? adv.map(row).join('') : '') + (advOn ? '' : '<button class="morebtn" data-cmore="' + t + '">' + (open ? '▴ Скрыть' : '▾ Ещё (' + adv.length + ')') + '</button>') : '') + '</div>';
    }).join('');
  }

  function renderParam(pr, API) {
    const p = SS.params, v = p[pr.key];
    if (pr.show && !pr.show(p)) return '';
    if (pr.type === 'teethCards') return renderCards(pr, API);
    const auto = pr.auto && !SS.touched[pr.key] && SS.teeth.length ? '<br><span class="auto">● по зубам</span>' : '';
    let ctl = '';
    if (pr.type === 'seg') ctl = segH('data-sseg="' + pr.key + '"', pr.options, v);
    else if (pr.type === 'toggle') ctl = '<button class="tg ' + (v ? 'on' : '') + '" data-stg="' + pr.key + '"></button>';
    else if (pr.type === 'opt') ctl = optH('data-sopt="' + pr.key + '"', 'data-soptv="' + pr.key + '"', pr.options, v);
    else if (pr.type === 'counter') ctl = '<div class="cnt"><button data-scnt="' + pr.key + '" data-d="-1">−</button><b>' + (+v || 0) + '</b><button data-scnt="' + pr.key + '" data-d="1">+</button><span>' + esc(pr.unit || '') + '</span></div>';
    else if (pr.type === 'perTooth') {
      if (!SS.teeth.length) return '<div class="row"><label>' + esc(pr.label) + '</label><div>' + badge('warn', 'отметьте зубы') + '</div></div>';
      ctl = SS.teeth.slice().sort().map((t) => '<div class="ptm">' + (SS.teeth.length > 1 ? '<span class="tchip">' + API.fmtTooth(t) + '</span>' : '') + '<div class="seg">' + pr.options.map((o) => '<button data-spt="' + pr.key + '" data-t="' + t + '" data-v="' + esc(o.v) + '" class="' + ((v || {})[t] === o.v ? 'on' : '') + '">' + esc(o.l) + '</button>').join('') + '</div></div>').join('');
    }
    return '<div class="row"><label>' + esc(pr.label) + auto + '</label><div>' + ctl + '</div></div>';
  }

  function renderTeeth(API) {
    const M = API.marks();
    const lbl = (t) => (!M ? { txt: t, cls: '' } : M.missing.includes(t) ? { txt: '0', cls: ' miss' } : M.implant.includes(t) ? { txt: 'И', cls: ' impl' } : { txt: t, cls: '' });
    const btn = (t) => { t = String(t); const L = lbl(t); return '<button class="tb' + L.cls + (SS.teeth.includes(t) ? ' on' : '') + '" data-stooth="' + t + '" title="' + t + '">' + L.txt + '</button>'; };
    const r = (a, z) => Array.from({ length: z }, (_, i) => a + i), half = (arr) => '<div class="half">' + arr.map(btn).join('') + '</div>';
    const row = (L, R) => '<div class="jaw">' + half(L) + '<div class="mid"></div>' + half(R) + '</div>';
    const sel = SS.teeth.slice().sort().map(API.fmtTooth).join(', ');
    return '<div class="formula"><div class="fh"><span class="fl">Зубы</span><span class="fs">' + esc(sel) + '</span>' + (SS.teeth.length ? '<button class="link" data-sclear="1">Сбросить</button>' : badge('bad', 'выберите зубы')) + '</div>' +
      row(r(11, 8).reverse(), r(21, 8)) + '<div class="occl"></div>' + row(r(41, 8).reverse(), r(31, 8)) +
      (M && (M.missing.length || M.implant.length) ? '<div class="ff"><span class="hint">формула пациента: 0 — нет зуба, И — имплантат</span></div>' : '') + '</div>';
  }

  function render(API) {
    if (!SS) { const last = lsGet(); SS = fresh(scnById(last) ? last : SCENARIOS[0].id); }
    const sc = scnById(SS.scn);
    let h = '';
    // выбор сценария
    h += '<div class="sec"><h2>Что делаем</h2><div class="card"><div class="tiles">' + SCENARIOS.map((s) =>
      '<button class="tile' + (s.id === SS.scn ? ' on' : '') + '" data-sscn="' + s.id + '"><span class="ti-ic">' + s.icon + '</span><span class="ti-t">' + esc(s.title) + '</span></button>').join('') +
      '</div><div class="hint" style="margin-top:6px">Остальные сценарии добавим по мере готовности.</div></div></div>';
    if (SS.done) {
      h += '<div class="sec"><div class="card done"><b>Добавлено в визит: ' + SS.done.length + '</b>' +
        '<div class="hint" style="margin:6px 0 0">Проверьте строки услуг и нажмите «Сохранить» в визите. Дневник теперь можно заполнить по этим услугам.</div></div></div>';
    }
    if (sc) {
      h += '<div class="sec"><h2>' + esc(sc.icon + ' ' + sc.title) + '</h2><div class="card">' + (sc.needTeeth ? renderTeeth(API) : '') + sc.params.map((pr) => renderParam(pr, API)).join('') + '</div></div>';
      const L = lines(); let total = 0, missingPrice = false;
      h += '<div class="sec"><h2>Будет добавлено</h2><div class="card cart">' + (L.length ? L.map((l) => {
        const c = CARD[l.id]; if (!c) { loadCard(l.id).then((x) => { if (x) API.rerender(); }); }
        const price = c ? parseFloat(c.price) || 0 : null; if (!l.skip) { if (price == null) missingPrice = true; else total += price * l.qty; }
        return '<div class="cl' + (l.skip ? ' skip' : '') + '"><div><div class="cd">' + esc(l.code) + '</div>' + esc(l.name) +
          ((l.teeth || []).length ? ' ' + l.teeth.slice().sort().map((t) => '<span class="tchip">' + API.fmtTooth(t) + '</span>').join(' ') : '') +
          (l.skip ? ' ' + badge('ok', l.skip) : l.dup ? ' ' + badge('warn', 'такая строка уже есть') : '') + '</div><div class="q">× ' + l.qty + '</div><div class="pr">' + (l.skip ? '—' : price == null ? '…' : rub(price * l.qty)) + '</div></div>';
      }).join('') + '<div class="tot"><span>Итого</span><span>' + (missingPrice ? '…' : rub(total)) + '</span></div>' : '<div class="hint">Пока нечего добавлять</div>') + '</div></div>';
      const iss = (sc.check ? sc.check(SS.params, SS.teeth) : []);
      if (!visitForm()) iss.unshift({ lvl: 'bad', text: 'Визит не открыт: откройте визит пациента на вкладке «История болезни»' });
      if (SS.error) iss.unshift({ lvl: 'bad', text: SS.error });
      if (iss.length) h += '<div class="sec"><h2>Проверка</h2><div class="iss">' + iss.map((i) => '<div class="' + i.lvl + '">' + (i.lvl === 'bad' ? '⛔' : '⚠️') + ' ' + esc(i.text) + '</div>').join('') + '</div></div>';
      SS._bad = iss.some((i) => i.lvl === 'bad' && i.text !== SS.error) || !L.some((l) => !l.skip);
    }
    const foot = (SS.done ? '<button class="btn sec2" id="svcundo">↶ Отменить добавление</button><button class="btn sec2" id="svcdiary">📝 К дневнику</button>' : '') +
      '<button class="btn pri" id="svcadd"' + (SS._bad || SS.busy ? ' disabled' : '') + '>' + (SS.busy ? 'Добавляю…' : 'Добавить в визит') + '</button>';
    return { body: h, foot };
  }

  function bind(P, API) {
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    const touch = (k) => { SS.touched[k] = 1; };
    const re = () => { autoParams(SS); API.rerender(); };
    const prOf = (k) => scnById(SS.scn).params.find((x) => x.key === k);
    // карточка зуба: "ключ|зуб|поле" → { c (значения зуба), f (описание поля) }
    const cell = (s) => { const [k, t, fk] = s.split('|'); const pr = prOf(k); const c = SS.params[k][t]; return { c, f: pr.fields.find((x) => x.key === fk), t, fk }; };
    on('[data-sscn]', 'click', (e) => { SS = fresh(e.currentTarget.dataset.sscn); lsSet(SS.scn); API.rerender(); });
    on('[data-stooth]', 'click', (e) => { const t = e.currentTarget.dataset.stooth; SS.teeth = SS.teeth.includes(t) ? SS.teeth.filter((x) => x !== t) : SS.teeth.concat(t); SS.done = null; re(); });
    on('[data-sclear]', 'click', () => { SS.teeth = []; re(); });
    on('[data-sseg]', 'click', (e) => { const k = e.currentTarget.dataset.sseg; SS.params[k] = e.currentTarget.dataset.v; touch(k); re(); });
    on('[data-stg]', 'click', (e) => { const k = e.currentTarget.dataset.stg; SS.params[k] = !SS.params[k]; touch(k); re(); });
    on('[data-sopt]', 'click', (e) => { const k = e.currentTarget.dataset.sopt, pr = prOf(k); SS.params[k] = SS.params[k] ? null : (pr.onDefault || pr.default || pr.options[0].v); touch(k); re(); });
    on('[data-soptv]', 'click', (e) => { const k = e.currentTarget.dataset.soptv; SS.params[k] = e.currentTarget.dataset.v; touch(k); re(); });
    on('[data-scnt]', 'click', (e) => { const k = e.currentTarget.dataset.scnt, pr = prOf(k);
      SS.params[k] = Math.max(pr.min || 0, Math.min(pr.max || 99, (+SS.params[k] || 0) + +e.currentTarget.dataset.d)); touch(k); re(); });
    on('[data-spt]', 'click', (e) => { const d = e.currentTarget.dataset; SS.params[d.spt] = SS.params[d.spt] || {}; SS.params[d.spt][d.t] = d.v; re(); });
    on('[data-ctg]', 'click', (e) => { const x = cell(e.currentTarget.dataset.ctg); x.c[x.fk] = !x.c[x.fk]; re(); });
    on('[data-copt]', 'click', (e) => { const x = cell(e.currentTarget.dataset.copt); x.c[x.fk] = x.c[x.fk] ? null : (x.f.onDefault || x.f.options[0].v); re(); });
    on('[data-coptv]', 'click', (e) => { const x = cell(e.currentTarget.dataset.coptv); x.c[x.fk] = e.currentTarget.dataset.v; re(); });
    on('[data-cmore]', 'click', (e) => { const t = e.currentTarget.dataset.cmore; SS.more[t] = !SS.more[t]; API.rerender(); });
    const fill = (s) => { const [k, t, i] = s.split('|'); const f = prOf(k).fields.find((x) => x.type === 'fillings'); return { list: SS.params[k][t][f.key], i: +i, f }; };
    on('[data-fmat]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fmat), it = x.list[x.i]; it.mat = e.currentTarget.dataset.v;
      const cls = x.f.classes[it.mat]; if (!cls || !cls.includes(it.cls)) it.cls = ''; re(); });
    on('[data-fcls]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fcls); x.list[x.i].cls = e.currentTarget.dataset.v; re(); });
    on('[data-fdel]', 'click', (e) => { const x = fill(e.currentTarget.dataset.fdel); if (x.list.length > 1) x.list.splice(x.i, 1); re(); });
    on('[data-fadd]', 'click', (e) => { const [k, t] = e.currentTarget.dataset.fadd.split('|'); const f = prOf(k).fields.find((x) => x.type === 'fillings');
      const list = SS.params[k][t][f.key]; if (list.length < (f.max || 3)) list.push({ mat: (f.materials[0] || {}).v, cls: '' }); re(); });
    const add = P.querySelector('#svcadd'); if (add) add.onclick = () => doAdd(API);
    const undo = P.querySelector('#svcundo'); if (undo) undo.onclick = () => doUndo(API);
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
      API.toast('Добавлено услуг: ' + created.length + '. Проверьте и сохраните визит.', 'ok');
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
    SS.done = null; API.rebuild(); API.rerender(); API.toast('Добавленные строки удалены', 'ok');
  }

  globalThis.SQNSMZ_SVCVIEW = { css: CSS, render, bind, _test: { lines: () => lines(), state: () => SS, reset: () => { SS = null; }, CARD } };
})();
