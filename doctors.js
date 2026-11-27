/* SQNS · Помощник медзаписи — БЫСТРАЯ СМЕНА ВРАЧА И НАСТРОЙКИ ВРАЧЕЙ.
 * В SQNS вход держится на двух cookie (PHPSESSID и cookie автовхода с именем из 32 hex-символов),
 * плюс SQNS хранит «кто я» в localStorage: currentUserId / currentEmployeeId / currentOrgId.
 * Скрипт запоминает эти значения для каждого врача и подставляет их при переключении (без паролей).
 * Кто вошёл на самом деле — проверяется по SQNS: /admin/employee/getJson/id/<currentEmployeeId>
 * (ФИО, инициалы, userID — должен совпасть с currentUserId). Из ответа берутся только эти поля, остальное не хранится.
 * Сохранённые сессии лежат только в этом браузере (localStorage домена SQNS) и в репозиторий не попадают.
 * Кнопку «Выход» SQNS для переключения не используем: она уничтожает сессию на сервере.
 */
(function () {
  'use strict';
  const K = { list: 'sqnsmz.doctors', active: 'sqnsmz.doctorActive', pending: 'sqnsmz.doctorPending', tick: 'sqnsmz.doctorTick', last: 'sqnsmz.lastAppUrl' };
  const IDS = [['uid', 'currentUserId'], ['eid', 'currentEmployeeId'], ['org', 'currentOrgId']];
  const AUTO_RE = /^[0-9a-f]{32}$/;
  const COLORS = ['#2563eb', '#059669', '#ea580c', '#7c3aed', '#db2777', '#ca8a04', '#0891b2', '#475569'];
  // Разделы, которые можно скрыть врачу. ther/surg/ortho — разделы «Услуг» и шаблоны дневника по специальности.
  const FEATURES = [['ther', 'Терапия'], ['surg', 'Хирургия'], ['ortho', 'Ортопедия'], ['plan', 'План лечения'], ['print', 'Печать']];
  const POS2F = { therapist: 'ther', surgeon: 'surg', orthopedist: 'ortho' };

  const lsJ = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const lsS = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } };
  const raw = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const all = () => lsJ(K.list, []);
  const saveAll = (l) => lsS(K.list, l);
  const activeId = () => lsJ(K.active, null);
  const byId = (id, l) => (l || all()).find((d) => d.id === id) || null;
  const label = (d) => (d && (d.label || d.short || d.fio)) || '—';
  const initials = (n) => String(n || '?').replace(/\./g, ' ').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase() || '?';

  function cookies() {
    const o = {};
    document.cookie.split(';').forEach((c) => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i).trim()] = c.slice(i + 1); });
    return o;
  }
  function capture() {
    const ck = cookies(), an = Object.keys(ck).find((k) => AUTO_RE.test(k));
    const out = { sid: ck.PHPSESSID || null, autoName: an || null, auto: an ? ck[an] : null };
    IDS.forEach(([f, k]) => { out[f] = raw(k); });
    return out;
  }
  function clearAuth() {
    Object.keys(cookies()).filter((k) => k === 'PHPSESSID' || AUTO_RE.test(k)).forEach((k) => { document.cookie = k + '=; path=/; max-age=0'; });
  }
  function clearIds() { IDS.forEach(([, k]) => { try { localStorage.removeItem(k); } catch (e) { /* */ } }); }
  function applySession(d) {
    clearAuth();
    if (d.sid) document.cookie = 'PHPSESSID=' + d.sid + '; path=/';
    if (d.autoName && d.auto) document.cookie = d.autoName + '=' + d.auto + '; path=/; max-age=7776000';
    IDS.forEach(([f, k]) => { try { if (d[f]) localStorage.setItem(k, d[f]); else localStorage.removeItem(k); } catch (e) { /* */ } });
  }
  // Страница входа: есть поле пароля и это не рабочие страницы /admin/… (не проверено на живой SQNS)
  const isLogin = () => !!document.querySelector('input[type="password"]') && (!/^\/admin\b/.test(location.pathname) || /login|auth|signin/i.test(location.pathname));
  const isApp = () => /^\/admin\b/.test(location.pathname) && !isLogin();

  // Кто вошёл — спрашиваем SQNS. Берём только ФИО, инициалы, userID и цвет сотрудника.
  async function whoAmI(eid) {
    try {
      const r = await fetch('/admin/employee/getJson/id/' + encodeURIComponent(eid), { credentials: 'same-origin', headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' } });
      if (!r.ok) return null;
      const j = await r.json(), m = (j && j.model) || j || {}, ei = m.employeeInfo || {};
      const fio = String(m.fullName || ei.fullName || '').trim();
      if (!fio) return null;
      const col = String(m.color || '').replace(/^#/, '');
      return { fio, short: String(m.initialsName || '').trim() || fio, userID: ei.userID != null ? String(ei.userID) : null, color: /^[0-9a-f]{6}$/i.test(col) ? '#' + col.toLowerCase() : null };
    } catch (e) { return null; }
  }

  // Есть ли на странице несохранённые изменения (визит, план): form ≠ formCopy
  function dirty() {
    try {
      const ng = window.angular, app = document.querySelector('[ng-app]'); if (!ng || !app) return false;
      const rootSc = ng.element(app).injector().get('$rootScope'); let n = 0, d = false;
      const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
      (function walk(s) {
        if (!s || d || n++ > 5000) return;
        if (own(s, 'form') && own(s, 'formCopy') && s.form && s.formCopy && !ng.equals(s.form, s.formCopy)) d = true;
        for (let c = s.$$childHead; c; c = c.$$nextSibling) walk(c);
      })(rootSc);
      return d;
    } catch (e) { return false; }
  }

  /* ---------------- кто сейчас вошёл ---------------- */
  // mode: 'wait' | 'login' | 'doc' | 'unknown' | 'nocheck' (SQNS не сказала, кто вошёл)
  const ST = { mode: 'wait', me: null, err: '', note: '' };
  let API = null, TAB_DOC = null, TAB_UID = null;

  // pending: { add: {color} } — ждём вход нового врача; { expect: id } — ждём вход конкретного врача
  async function identify(waited) {
    const pend = lsJ(K.pending, null);
    if (isLogin()) {
      ST.mode = 'login';
      clearIds();   // на странице входа старые «кто я» не должны пережить вход другого врача
      if (!pend) { const l = all(), a = byId(activeId(), l); if (a) { a.dead = true; saveAll(l); lsS(K.pending, { expect: a.id }); } }
      return true;
    }
    if (!isApp()) { ST.mode = 'none'; return true; }
    const cur = capture();
    if (!cur.sid) return true;
    if (!cur.uid || !cur.eid) { if (!waited) return false; ST.mode = 'nocheck'; lsS(K.pending, null); return true; }
    const me = await whoAmI(cur.eid);
    if (!me || (me.userID && me.userID !== cur.uid)) { if (!waited) return false; ST.mode = 'nocheck'; lsS(K.pending, null); return true; }
    ST.me = me;
    const l = all(); let doc = l.find((d) => d.uid === cur.uid) || null;
    lsS(K.pending, null);
    if (pend && pend.expect) {
      const exp = byId(pend.expect, l);
      if (exp && exp !== doc) ST.err = 'Вошёл другой врач: ' + me.short + ' (ожидался ' + label(exp) + '). Сохранённый вход ' + label(exp) + ' не изменён.';
    }
    if (!doc && pend && pend.add) {
      doc = { id: 'd' + Date.now(), color: pend.add.color || me.color || COLORS[l.length % COLORS.length], features: null };
      l.push(doc); ST.note = 'Врач добавлен: ' + me.short;
    } else if (doc && pend && pend.add) ST.note = me.short + ' уже есть в списке — вход обновлён';
    if (doc) {
      // Перезаписываем сохранённый вход, только если это точно вход врача: есть cookie автовхода или сессия та же.
      if (cur.auto || cur.sid === doc.sid || (pend && (pend.add || pend.expect))) Object.assign(doc, cur);
      if (doc.dead && !ST.note && !ST.err) ST.note = 'Вход ' + me.short + ' обновлён';
      Object.assign(doc, { fio: me.fio, short: me.short, dead: false });
      saveAll(l); lsS(K.active, doc.id); ST.mode = 'doc';
    } else { lsS(K.active, null); ST.mode = 'unknown'; }
    try { lsS(K.last, location.pathname + location.search + location.hash); } catch (e) { /* */ }
    TAB_DOC = doc ? doc.id : null; TAB_UID = cur.uid;
    return true;
  }
  function boot(api) {
    API = api;
    const t0 = Date.now();
    (async function loop() {
      let ok = false;
      try { ok = await identify(Date.now() - t0 > 10000); } catch (e) { ok = true; ST.mode = 'nocheck'; }
      if (!ok) { setTimeout(loop, 500); return; }
      if (ST.err) API.toast(ST.err, 'bad'); else if (ST.note) API.toast(ST.note, 'ok');
      ST.note = '';
      API.refresh();
    })();
    // переключение врача или вход в другой вкладке — эту вкладку блокируем
    window.addEventListener('storage', (e) => {
      if (ST.mode === 'wait' || ST.mode === 'login') return;
      if (e.key === K.tick) {
        const id = activeId();
        if (id && id === TAB_DOC) API.lock(null);
        else { const d = byId(id); API.lock(d ? 'В другой вкладке включён врач «' + label(d) + '».' : 'В другой вкладке сменили врача.'); }
      } else if (e.key === 'currentUserId' && e.newValue !== TAB_UID) {
        if (e.newValue == null) return;   // наш же выход на страницу входа — сигнал придёт через tick
        const d = all().find((x) => x.uid === e.newValue);
        API.lock(d ? 'В другой вкладке включён врач «' + label(d) + '».' : 'В другой вкладке вошли под другим пользователем.');
      }
    });
  }

  /* ---------------- действия ---------------- */
  function go() {
    if (isLogin()) location.href = lsJ(K.last, null) || '/';
    else location.reload();
  }
  const confirmDirty = (what) => ST.mode === 'login' || !dirty() || window.confirm('На странице есть несохранённые изменения — они пропадут.\n' + what);
  function saveCurrent(l) {   // актуализировать сохранённый вход текущего врача перед уходом с него
    const a = byId(activeId(), l);
    if (a && ST.mode === 'doc') { const c = capture(); if (c.uid === a.uid) { Object.assign(a, c); saveAll(l); } }
  }
  function switchTo(id) {
    const l = all(), d = byId(id, l); if (!d) return;
    if (id === activeId() && ST.mode === 'doc') return;
    if (!confirmDirty('Переключиться на «' + label(d) + '»?')) return;
    saveCurrent(l);
    applySession(d);
    lsS(K.active, d.id); lsS(K.pending, { expect: d.id }); lsS(K.tick, { id: d.id, t: Date.now() });
    go();
  }
  function toLogin(pending, msg) {
    const l = all(); saveCurrent(l);
    lsS(K.pending, pending); clearIds(); clearAuth(); lsS(K.tick, { id: null, t: Date.now() });
    if (ST.mode === 'login') { API.refresh(); API.toast(msg, 'ok'); return; }
    location.reload();
  }
  function addDoctor(color) {
    if (ST.mode === 'unknown' && ST.me) {   // текущий вход ещё не в списке — сохраняем его без выхода
      const l = all(), d = Object.assign({ id: 'd' + Date.now(), color, features: null, fio: ST.me.fio, short: ST.me.short }, capture(), { dead: false });
      l.push(d); saveAll(l); lsS(K.active, d.id); TAB_DOC = d.id; TAB_UID = d.uid; ST.mode = 'doc';
      API.toast('Врач добавлен: ' + d.short, 'ok'); API.refresh(); return;
    }
    if (!confirmDirty('Открыть вход для нового врача?')) return;
    toLogin({ add: { color } }, 'Войдите в SQNS под новым врачом');
  }
  function relogin(id) {
    const d = byId(id); if (!d) return;
    if (!confirmDirty('Войти заново под «' + label(d) + '»?')) return;
    toLogin({ expect: id }, 'Войдите в SQNS под врачом «' + label(d) + '»');
  }
  function editDoctor(id, patch) { const l = all(), d = byId(id, l); if (!d) return; Object.assign(d, patch); saveAll(l); API.refresh(); }
  function removeDoctor(id) {
    const l = all().filter((d) => d.id !== id); saveAll(l);
    if (activeId() === id) { lsS(K.active, null); if (ST.mode === 'doc') ST.mode = 'unknown'; }
    API.refresh();
  }
  function cancelPending() { lsS(K.pending, null); API.refresh(); }

  /* ---------------- что показывать ---------------- */
  function current() {
    if (ST.mode === 'login') {
      const p = lsJ(K.pending, null);
      return { mode: 'login', text: p && p.add ? 'Вход: новый врач' : p && p.expect ? 'Вход: ' + label(byId(p.expect)) : 'Выберите врача' };
    }
    if (ST.mode === 'doc') { const d = byId(activeId()); if (d) return { mode: 'doc', doc: d, name: label(d), ini: initials(label(d)) }; }
    if (ST.mode === 'unknown') return { mode: 'unknown', text: ST.me ? ST.me.short + ' — не в списке' : 'Врач не из списка' };
    if (ST.mode === 'nocheck') return { mode: 'nocheck', text: 'Врач не определён' };
    return { mode: ST.mode, text: 'Врачи' };
  }
  // Разрешён ли раздел текущему врачу (без врача — всё разрешено)
  function allowed(f) {
    if (ST.mode !== 'doc') return true;
    const d = byId(activeId()); const F = d && d.features;
    return !F || F[f] !== false;
  }
  const allowedPos = (pos) => !pos || !POS2F[pos] || allowed(POS2F[pos]);

  /* ---------------- всплывающее окно ---------------- */
  const POP = { edit: null };   // edit: null | 'new' | 'unknown' | id
  const CSS = `
  .dpop{position:fixed;right:200px;top:calc(34% - 6px);transition:right .15s;z-index:2147483001;width:340px;max-height:calc(66vh - 16px);overflow:auto;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:16px;
    box-shadow:0 18px 48px rgba(15,23,42,.25);padding:10px;display:none}
  .dpop.show{display:block}
  .dp-h{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:#64748b;margin:2px 4px 8px}
  .dp-r{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:11px;cursor:pointer;border:1.5px solid transparent}
  .dp-r:hover{background:#f1f5f9} .dp-r.on{border-color:var(--c);background:#f8fafc;cursor:default}
  .dp-av{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-size:12px;font-weight:800;flex:none}
  .dp-n{flex:1;font-size:13.5px;font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .dp-s{font-size:11px;font-weight:600;color:#64748b} .dp-s.bad{color:#b91c1c}
  .dp-ed{border:0;background:transparent;color:#94a3b8;border-radius:8px;width:28px;height:28px;cursor:pointer;font-size:15px}
  .dp-ed:hover{background:#e2e8f0;color:#334155}
  .dp-add{display:block;width:100%;margin-top:6px;border:1px dashed #a5b4fc;background:#fff;color:#4338ca;border-radius:11px;padding:8px;font-size:13px;font-weight:700;cursor:pointer}
  .dp-add:hover{background:#eef2ff}
  .dp-f{padding:10px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;margin:4px 0}
  .dp-fio{font-size:13.5px;font-weight:800;margin-bottom:2px} .dp-sub{font-size:11.5px;color:#64748b;margin-bottom:8px}
  .dp-l{font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:#64748b;margin:10px 0 5px}
  .dp-f input[type=text]{width:100%;border:1px solid #cbd5e1;border-radius:10px;padding:7px 10px;font-size:13.5px;outline:none;background:#fff;color:#0f172a}
  .dp-f input[type=text]:focus{border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
  .dp-cl{display:flex;gap:6px;flex-wrap:wrap}
  .dp-c{width:26px;height:26px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 1px #cbd5e1;cursor:pointer;padding:0}
  .dp-c.on{box-shadow:0 0 0 2px #0f172a}
  .dp-fe{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}
  .dp-fe label{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:#334155;cursor:pointer;padding:3px 0}
  .dp-fe input{width:16px;height:16px;accent-color:#4f46e5;cursor:pointer}
  .dp-b{display:flex;gap:6px;align-items:center;margin-top:12px;flex-wrap:wrap} .dp-b .sp{flex:1}
  .dp-b button{border:0;border-radius:10px;padding:7px 10px;font-size:12.5px;font-weight:700;cursor:pointer}
  .dp-ok{background:#0f172a;color:#fff} .dp-no{background:#e2e8f0;color:#334155} .dp-del{background:transparent;color:#b91c1c;padding:7px 4px!important}
  .dp-re{background:#eef2ff;color:#4338ca}
  .dp-note{font-size:12px;line-height:1.45;color:#334155;background:#eef2ff;border-radius:10px;padding:8px 10px;margin-bottom:8px}
  .dp-note.warn{background:#fef3c7;color:#92400e} .dp-note.bad{background:#fee2e2;color:#991b1b}
  .dp-hint{font-size:11.5px;color:#64748b;margin:8px 4px 2px}
  .dp-x{border:0;background:none;color:inherit;font-weight:800;cursor:pointer;text-decoration:underline;padding:0}
  `;
  const colorsH = (cur) => '<div class="dp-cl">' + COLORS.concat(cur && !COLORS.includes(cur) ? [cur] : []).map((c) => '<button class="dp-c' + (c === cur ? ' on' : '') + '" style="background:' + c + '" data-dcol="' + c + '" title="Цвет"></button>').join('') + '</div>';
  // Форма врача: id — 'new' (добавить через вход), 'unknown' (сохранить текущий вход) или id врача (настройки)
  function formH(id) {
    const l = all(), d = byId(id, l), nextColor = (ST.me && ST.me.color) || COLORS[l.length % COLORS.length];
    if (id === 'new') return '<div class="dp-f" data-form="new"><div class="dp-fio">Новый врач</div><div class="dp-sub">Откроется вход SQNS. Войдите под новым врачом — ФИО скрипт возьмёт из SQNS сам.</div>' +
      '<div class="dp-l">Цвет</div>' + colorsH(COLORS[l.length % COLORS.length]) +
      '<div class="dp-b"><span class="sp"></span><button class="dp-no" data-dcancel>Отмена</button><button class="dp-ok" data-dsave>Открыть вход</button></div></div>';
    if (id === 'unknown') return '<div class="dp-f" data-form="unknown"><div class="dp-fio">' + esc(ST.me ? ST.me.fio : 'Врач') + '</div><div class="dp-sub">Сейчас вошёл в SQNS, но его нет в списке.</div>' +
      '<div class="dp-l">Цвет</div>' + colorsH(nextColor) + '<div class="dp-b"><span class="sp"></span><button class="dp-ok" data-dsave>Добавить в список</button></div></div>';
    if (!d) return '';
    const F = d.features || {};
    return '<div class="dp-f" data-form="' + esc(id) + '"><div class="dp-fio">' + esc(d.fio || label(d)) + '</div><div class="dp-sub">' + (d.dead ? 'вход закончился' : d.id === activeId() && ST.mode === 'doc' ? 'сейчас работает' : 'вход сохранён') + '</div>' +
      '<div class="dp-l">Подпись на кнопке</div><input type="text" maxlength="30" value="' + esc(d.label || '') + '" placeholder="' + esc(d.short || '') + '" data-dname>' +
      '<div class="dp-l">Цвет</div>' + colorsH(d.color) +
      '<div class="dp-l">Что показывать</div><div class="dp-fe">' + FEATURES.map(([k, t]) => '<label><input type="checkbox" data-dfeat="' + k + '"' + (F[k] === false ? '' : ' checked') + '>' + t + '</label>').join('') + '</div>' +
      '<div class="dp-b"><button class="dp-re" data-dre="' + esc(id) + '">Войти заново</button><span class="sp"></span><button class="dp-del" data-ddel="' + esc(id) + '">Убрать из списка</button></div>' +
      '<div class="dp-b" style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0"><span class="sp"></span><button class="dp-no" data-dcancel>Отмена</button><button class="dp-ok" data-dsave>Сохранить</button></div></div>';
  }
  function renderPop() {
    const l = all(), c = current(), aid = activeId(), pend = lsJ(K.pending, null);
    let h = '<div class="dp-h">Врачи</div>';
    if (ST.err) h += '<div class="dp-note bad">' + esc(ST.err) + ' <button class="dp-x" data-derr>Понятно</button></div>';
    if (c.mode === 'login' && pend && pend.add) h += '<div class="dp-note">Войдите в SQNS под новым врачом — он сохранится в списке сам. <button class="dp-x" data-dpcancel>Отменить</button></div>';
    else if (c.mode === 'login' && pend && pend.expect) h += '<div class="dp-note">Войдите в SQNS под врачом <b>«' + esc(label(byId(pend.expect))) + '»</b>. Если войдёт другой врач, скрипт это заметит. <button class="dp-x" data-dpcancel>Отменить</button></div>';
    else if (c.mode === 'login') h += '<div class="dp-note warn">Выберите врача из списка или войдите в SQNS.</div>';
    if (c.mode === 'nocheck') h += '<div class="dp-note warn">SQNS не сообщила, кто вошёл, поэтому вход никуда не сохранён. Обновите страницу (F5).</div>';
    if (c.mode === 'unknown') h += formH('unknown');
    h += l.map((d) => {
      if (POP.edit === d.id) return formH(d.id);
      const on = d.id === aid && c.mode === 'doc';
      return '<div class="dp-r' + (on ? ' on' : '') + '" style="--c:' + d.color + '" data-dsw="' + esc(d.id) + '"><span class="dp-av" style="background:' + d.color + '">' + esc(initials(label(d))) + '</span>' +
        '<span class="dp-n">' + esc(label(d)) + '<br><span class="dp-s' + (d.dead ? ' bad' : '') + '">' + (on ? 'сейчас работает' : d.dead ? 'вход закончился — нажмите, чтобы войти' : 'переключиться') + '</span></span>' +
        '<button class="dp-ed" data-dedit="' + esc(d.id) + '" title="Настройки врача">⚙</button></div>';
    }).join('');
    if (c.mode !== 'unknown') h += POP.edit === 'new' ? formH('new') : '<button class="dp-add" data-dnew>＋ Добавить врача</button>';
    h += '<div class="dp-hint">Переключение перезагружает страницу. Alt+D — это окно.</div>';
    return h;
  }
  function bindPop(P) {
    const on = (sel, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); fn(e.currentTarget, e); }));
    on('[data-dsw]', (el, e) => { if (e.target.closest('[data-dedit]')) return; const d = byId(el.dataset.dsw); if (d && d.dead) relogin(d.id); else switchTo(el.dataset.dsw); });
    on('[data-dedit]', (el) => { POP.edit = el.dataset.dedit; API.refresh(); });
    on('[data-dnew]', () => { POP.edit = 'new'; API.refresh(); });
    on('[data-dcancel]', () => { POP.edit = null; API.refresh(); });
    on('[data-dpcancel]', () => cancelPending());
    on('[data-derr]', () => { ST.err = ''; API.refresh(); });
    on('[data-dre]', (el) => { POP.edit = null; relogin(el.dataset.dre); });
    on('[data-dcol]', (el) => { const f = el.closest('[data-form]'); f.querySelectorAll('[data-dcol]').forEach((b) => b.classList.toggle('on', b === el)); });
    on('[data-ddel]', (el) => { const d = byId(el.dataset.ddel); if (d && window.confirm('Убрать «' + label(d) + '» из списка? Из SQNS он не выйдет.')) { POP.edit = null; removeDoctor(d.id); } });
    on('[data-dsave]', (el) => {
      const f = el.closest('[data-form]'), id = f.dataset.form, col = f.querySelector('.dp-c.on'), color = col ? col.dataset.dcol : COLORS[0];
      POP.edit = null;
      if (id === 'new' || id === 'unknown') { addDoctor(color); return; }
      const nm = f.querySelector('[data-dname]'), feats = {};
      f.querySelectorAll('[data-dfeat]').forEach((cb) => { feats[cb.dataset.dfeat] = cb.checked; });
      editDoctor(id, { color, label: nm ? nm.value.trim() : '', features: feats });
    });
    const inp = P.querySelector('[data-dname]'); if (inp) inp.addEventListener('keydown', (e) => e.stopPropagation());
    P.addEventListener('click', (e) => e.stopPropagation());
  }

  globalThis.SQNSMZ_DOCTORS = { css: CSS, boot, current, allowed, allowedPos, renderPop, bindPop, POP, _test: { capture, all, identify, ST } };
})();
