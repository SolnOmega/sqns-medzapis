/* SQNS · Помощник медзаписи — ПЕЧАТЬ ДОКУМЕНТОВ (план лечения; акты — позже).
 * Документ собирается из данных SQNS в момент печати: состав, цены, скидки, «оказано» — из плана SQNS, без пересчёта сумм.
 * Названия этапов — из этапов SQNS, «примерно через» — из рецепта плана (комментарий плана, см. plan.js).
 * Реквизиты клиники, логотип, кто подписывает и тексты — в «Настройках печати»: хранятся только в этом браузере
 * (localStorage домена SQNS), в код и в репозиторий не попадают. Перенос на другой ПК — экспорт/импорт файлом.
 * Печать — через скрытый iframe и окно печати браузера (там же «Сохранить как PDF»). Вёрстка — под ч/б лазерный принтер.
 */
(function () {
  'use strict';
  const LSK = 'sqnsmz.print';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (lvl, t) => '<span class="badge ' + lvl + '"><span class="dot"></span>' + esc(t) + '</span>';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const num = (n, kop) => { n = r2(n); return n.toLocaleString('ru-RU', { minimumFractionDigits: kop || n % 1 ? 2 : 0, maximumFractionDigits: 2 }); };
  const rub = (n) => num(n, true) + ' ₽';
  const fmtT = (t) => { const f = (globalThis.SQNSMZ_CONFIG || {}).fmtTooth; return f ? f(String(t)) : String(t); };
  const PLANV = () => globalThis.SQNSMZ_PLANVIEW || null;
  const DOCS = () => globalThis.SQNSMZ_DOCTORS || null;

  /* ---------------- настройки ---------------- */
  const DEF_TEXTS = {
    planConsent: 'С планом лечения и ориентировочной стоимостью ознакомлен(а), согласен(на)',
    planNote: 'План лечения является ориентировочным. Объём и стоимость лечения могут измениться по клиническим показаниям, о чём пациент информируется заранее. Сроки между этапами указаны примерно и зависят от заживления и индивидуальных особенностей.',
  };
  const DOCS_LIST = [['plan', 'План лечения'], ['act', 'Акт']];
  const blankSet = () => ({ v: 1, org: { name: '', inn: '', addr: '', phone: '', lic: '', extra: '' }, logo: '', sign: { plan: 'fixed', act: 'fixed' }, fixed: { pos: 'Директор', fio: '' }, texts: {} });
  function getSet() {
    let s = null; try { s = JSON.parse(localStorage.getItem(LSK) || 'null'); } catch (e) { s = null; }
    const b = blankSet(); if (!s || typeof s !== 'object') return b;
    return { v: 1, org: Object.assign(b.org, s.org || {}), logo: typeof s.logo === 'string' ? s.logo : '', sign: Object.assign(b.sign, s.sign || {}), fixed: Object.assign(b.fixed, s.fixed || {}), texts: Object.assign({}, s.texts || {}) };
  }
  function putSet(s) { try { localStorage.setItem(LSK, JSON.stringify(s)); return true; } catch (e) { return false; } }
  const text = (s, k) => (s.texts[k] != null && String(s.texts[k]).trim() !== '' ? s.texts[k] : DEF_TEXTS[k]);

  // логотип: уменьшаем при загрузке (оригинал на тысячи пикселей тяжело хранить в браузере)
  function shrinkLogo(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('Не удалось прочитать файл'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('Это не картинка (нужен PNG, JPG или SVG)'));
        img.onload = () => {
          const H = 360, k = Math.min(1, H / (img.naturalHeight || H)), w = Math.max(1, Math.round((img.naturalWidth || H) * k)), h = Math.max(1, Math.round((img.naturalHeight || H) * k));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          try { res(c.toDataURL('image/png')); } catch (e) { rej(e); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------- кто подписывает ---------------- */
  function signer(s, doc) {
    const m = s.sign[doc] || 'fixed';
    if (m === 'none') return null;
    if (m === 'doctor') {
      const cur = DOCS() ? DOCS().current() : null, d = cur && cur.mode === 'doc' ? cur.doc : null;
      return { pos: (d && d.pos) || 'Врач-стоматолог', fio: d ? d.short || d.fio || '' : '' };
    }
    return { pos: s.fixed.pos || '', fio: s.fixed.fio || '' };
  }

  /* ---------------- данные плана из SQNS ---------------- */
  const stripCode = (n) => String(n || '').replace(/^\s*[A-ZА-Я]\d{2}(?:\.[0-9A-ZА-Я]+)*\s+/i, '').trim();
  function dmy(v) {
    if (!v) return '';
    const s = String(v), m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return m[3] + '.' + m[2] + '.' + m[1];
    return /^\d{2}\.\d{2}\.\d{4}/.test(s) ? s.slice(0, 10) : '';
  }
  function patientOf() {
    try {
      const t = PLANV().sq.tabScope(), c = t && t.getClientInfo && t.getClientInfo();
      if (!c) return {};
      const by = c.birthDay && c.birthMonth && c.birthYear ? String(c.birthDay).padStart(2, '0') + '.' + String(c.birthMonth).padStart(2, '0') + '.' + c.birthYear : '';
      return { fio: c.fullName || c.name || '', ini: c.initialsName || '', birth: dmy(c.birthDate) || by, card: c.medicalRecord || '' };
    } catch (e) { return {}; }
  }
  function planData(f) {
    const P = PLANV().sq, items = (f.treatmentPlanItems || []).filter((it) => it && (it.name || it.service));
    const st = P.sqStages(f), R = P.splitComment(f.comment).recipe, rs = R && Array.isArray(R.stages) ? R.stages : [];
    const row = (it) => {
      const qty = +it.qty || 0, price = +it.price || 0, full = r2(qty * price);
      const sum = it.sum != null && it.sum !== '' ? r2(it.sum) : full;
      return { name: stripCode((it.service && it.service.printName) || it.name), teeth: (it.teeth || []).map(String).sort(), qty, price, full, sum, disc: r2(it.discount), prov: Math.min(+it.providedQty || 0, qty) };
    };
    let groups;
    if (!st.length) groups = [{ name: '', after: '', rows: items.map(row) }];
    else {
      groups = st.map((x, k) => ({ name: x.name || 'Этап ' + (k + 1), after: k > 0 && rs[k] ? rs[k].after || '' : '', rows: items.filter((it) => it.stageID === x.id).map(row) }));
      const loose = items.filter((it) => it.stageID == null || !st.some((x) => x.id === it.stageID));
      if (loose.length) groups.push({ name: 'Без этапа', after: '', loose: true, rows: loose.map(row) });
      groups = groups.filter((g) => g.rows.length);
    }
    const all = groups.reduce((a, g) => a.concat(g.rows), []);
    const discs = [...new Set(all.map((x) => x.disc))], uniform = discs.length <= 1;
    const full = r2(all.reduce((a, x) => a + x.full, 0)), sum = r2(all.reduce((a, x) => a + x.sum, 0));
    const done = r2(all.reduce((a, x) => a + (x.qty ? x.sum * x.prov / x.qty : 0), 0));
    return { title: f.title || '', date: f.dateFormatted || dmy(f.date) || dmy(f.created_at) || new Date().toLocaleDateString('ru-RU'), staged: st.length > 0, groups, uniform, pct: uniform ? discs[0] || 0 : null, full, sum, done, teeth: all.some((x) => x.teeth.length) };
  }

  /* ---------------- вёрстка ---------------- */
  const PCSS = `
  *{box-sizing:border-box}
  html{-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{margin:0;font:9.5pt/1.35 "Segoe UI",Arial,sans-serif;color:#000}
  .hd{display:flex;align-items:center;gap:12px;padding-bottom:7px;border-bottom:1.5px solid #000}
  .hd img{height:22mm;width:auto;max-width:45mm;object-fit:contain;flex:none}
  .org{font-size:7.8pt;color:#222;line-height:1.4} .org b{display:block;font-size:10.5pt;color:#000;margin-bottom:2px}
  .ttl{display:flex;align-items:baseline;justify-content:space-between;margin:11px 0 2px}
  .ttl h1{margin:0;font-size:15pt;font-weight:700;letter-spacing:.3px} .ttl .dt{font-size:9pt;white-space:nowrap}
  .sub{color:#333;font-size:8.5pt;margin-bottom:7px}
  .pt{display:flex;gap:24px;border:1px solid #000;padding:5px 10px;margin:4px 0 8px;font-size:9.5pt}
  .pt span{color:#444;font-size:7pt;display:block;text-transform:uppercase;letter-spacing:.4px}
  .st{margin-top:10px}
  .sh{display:flex;align-items:baseline;gap:8px;padding:3px 0;border-bottom:1.5px solid #000;break-after:avoid}
  .num,.sn{font-weight:700;font-size:10pt} .num{white-space:nowrap}
  .after{margin-left:auto;font-size:8.5pt;font-style:italic;white-space:nowrap}
  table{width:100%;border-collapse:collapse;font-size:9pt}
  .st table{table-layout:fixed}
  th{font-weight:400;color:#333;font-size:7pt;text-transform:uppercase;letter-spacing:.3px;text-align:left;padding:3px 5px 2px;border-bottom:.75px solid #000}
  td{padding:3px 5px;border-bottom:.5px solid #bbb;vertical-align:top}
  tr{break-inside:avoid}
  .r{text-align:right;white-space:nowrap} .c{text-align:center;white-space:nowrap} .tt{white-space:nowrap}
  .done td{color:#555;font-style:italic}
  .done .nm::before{content:"✓ ";font-style:normal;font-weight:700;color:#000}
  .tag{font-size:7pt;font-style:normal;border:.75px solid #555;border-radius:2px;padding:0 3px;margin-left:4px;white-space:nowrap}
  .stt td{border:0;padding-top:3px;font-weight:700} .stt td.l{font-weight:400;font-size:8.5pt;text-align:right}
  .tot{margin-top:10px;display:flex;justify-content:flex-end;break-inside:avoid}
  .tot table{width:auto;min-width:75mm} .tot td{border:0;padding:2px 6px}
  .tot .big td{font-size:12pt;font-weight:700;border-top:1.5px solid #000;padding-top:4px}
  .tot .mut td{font-size:8.5pt;color:#222}
  .note{margin-top:10px;font-size:7.8pt;color:#222;line-height:1.45;break-inside:avoid;white-space:pre-line}
  .sig{display:flex;gap:28px;margin-top:16px;break-inside:avoid} .sig>div{flex:1} .sig>div.e{visibility:hidden}
  .sig .cap{font-size:8.5pt;min-height:24px;white-space:pre-line}
  .line{display:flex;align-items:flex-end;gap:8px;margin-top:18px;font-size:8.5pt}
  .line i{flex:1;border-bottom:.75px solid #000;height:1px} .line .who{white-space:nowrap}
  .hint{font-size:7pt;color:#444;display:flex;justify-content:space-between;margin-top:2px}
  `;
  const cssStr = (s) => '"' + String(s || '').replace(/[\\"]/g, '\\$&').replace(/[\r\n]+/g, ' ') + '"';
  function headerHtml(s) {
    const o = s.org, lines = [o.inn, o.addr, [o.phone, o.lic ? 'Лицензия ' + o.lic.replace(/^\s*лицензия\s*/i, '') : ''].filter(Boolean).join(' · '), o.extra].filter((x) => String(x || '').trim());
    if (!s.logo && !o.name && !lines.length) return '';
    return '<div class="hd">' + (s.logo ? '<img src="' + s.logo + '" alt="">' : '') + '<div class="org">' + (o.name ? '<b>' + esc(o.name) + '</b>' : '') + lines.map(esc).join('<br>') + '</div></div>';
  }
  function sigHtml(capLeft, whoLeft, sg) {
    const left = '<div><div class="cap">' + esc(capLeft) + '</div><div class="line"><i></i><span class="who">' + esc(whoLeft) + '</span></div><div class="hint"><span>подпись</span><span>«___» __________ 20__ г.</span></div></div>';
    const right = sg ? '<div><div class="cap">' + esc(sg.pos) + '</div><div class="line"><i></i><span class="who">' + esc(sg.fio) + '</span></div><div class="hint"><span>подпись</span><span>' + (sg.pos && /директор|руковод|главн/i.test(sg.pos) ? 'М. П.' : '') + '</span></div></div>' : '<div class="e"></div>';
    return '<div class="sig">' + left + right + '</div>';
  }
  function planHtml(D, pt, s) {
    const nonU = !D.uniform, showT = D.teeth;
    const cols = '<colgroup><col>' + (showT ? '<col style="width:21mm">' : '') + '<col style="width:13mm"><col style="width:17mm">' + (nonU ? '<col style="width:15mm">' : '') + '<col style="width:25mm"></colgroup>';
    const head = '<tr><th>Услуга</th>' + (showT ? '<th>Зубы</th>' : '') + '<th class="c">Кол-во</th><th class="r">Цена</th>' + (nonU ? '<th class="r">Скидка</th>' : '') + '<th class="r">Сумма</th></tr>';
    const span = 3 + (showT ? 1 : 0) + (nonU ? 1 : 0);
    const many = D.groups.length > 1 || D.staged;
    let k = 0, body = '';
    D.groups.forEach((g) => {
      if (!g.loose) k++;
      const rows = g.rows.map((x) => {
        const dn = x.prov > 0, tag = dn ? '<span class="tag">' + (x.prov >= x.qty ? 'выполнено' : 'выполнено ' + num(x.prov) + ' из ' + num(x.qty)) + '</span>' : '';
        return '<tr' + (dn ? ' class="done"' : '') + '><td class="nm">' + esc(x.name) + ' ' + tag + '</td>' + (showT ? '<td class="tt">' + esc(x.teeth.map(fmtT).join(', ')) + '</td>' : '') +
          '<td class="c">' + num(x.qty) + '</td><td class="r">' + num(x.price) + '</td>' + (nonU ? '<td class="r">' + (x.disc ? num(x.disc) + ' %' : '—') + '</td>' : '') +
          '<td class="r">' + num(nonU ? x.sum : x.full) + '</td></tr>';
      }).join('');
      const sub = r2(g.rows.reduce((a, x) => a + (nonU ? x.sum : x.full), 0));
      body += '<div class="st">' + (many ? '<div class="sh"><div class="num">' + (g.loose ? '' : 'Этап ' + k + '.') + '</div><div class="sn">' + esc(g.name) + '</div>' + (g.after ? '<div class="after">примерно через ' + esc(g.after) + '</div>' : '') + '</div>' : '') +
        '<table>' + cols + head + rows + (many ? '<tr class="stt"><td colspan="' + span + '" class="l">Итого по этапу</td><td class="r">' + num(sub) + '</td></tr>' : '') + '</table></div>';
    });
    const disc = r2(D.full - D.sum);
    let tot = '';
    if (disc > 0.004) tot += '<tr class="mut"><td>Сумма по плану</td><td class="r">' + rub(D.full) + '</td></tr><tr class="mut"><td>Скидка' + (D.pct ? ' ' + num(D.pct) + ' %' : '') + '</td><td class="r">− ' + rub(disc) + '</td></tr>';
    tot += '<tr class="big"><td>' + (disc > 0.004 ? 'Итого к оплате' : 'Итого по плану') + '</td><td class="r">' + rub(D.sum) + '</td></tr>';
    if (D.done > 0) tot += '<tr class="mut"><td>из них выполнено</td><td class="r">' + rub(D.done) + '</td></tr>';
    const who = pt.ini || pt.fio || '';
    const foot = 'План лечения' + (who ? ' · ' + who : '') + ' · ' + D.date;
    const ptH = pt.fio || pt.birth || pt.card ? '<div class="pt">' + (pt.fio ? '<div><span>Пациент</span>' + esc(pt.fio) + '</div>' : '') + (pt.birth ? '<div><span>Дата рождения</span>' + esc(pt.birth) + '</div>' : '') + (pt.card ? '<div><span>Медкарта</span>№ ' + esc(pt.card) + '</div>' : '') + '</div>' : '';
    return '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>' + esc('План лечения' + (who ? ' — ' + who : '') + ' — ' + D.date) + '</title><style>' +
      '@page{size:A4;margin:12mm 12mm 14mm 12mm;@bottom-left{content:' + cssStr(foot) + ';font:7.5pt Arial,sans-serif;color:#444}@bottom-right{content:"стр. " counter(page) " из " counter(pages);font:7.5pt Arial,sans-serif;color:#444}}' +
      PCSS + '</style></head><body>' + headerHtml(s) +
      '<div class="ttl"><h1>План лечения</h1><div class="dt">от ' + esc(D.date) + '</div></div>' + (D.title ? '<div class="sub">' + esc(D.title) + '</div>' : '') + ptH +
      body + '<div class="tot"><table>' + tot + '</table></div>' + (text(s, 'planNote') ? '<div class="note">' + esc(text(s, 'planNote')) + '</div>' : '') +
      sigHtml(text(s, 'planConsent'), who, signer(s, 'plan')) + '</body></html>';
  }

  /* ---------------- печать ---------------- */
  async function printHtml(html) {
    const fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true');
    fr.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(fr);
    const d = fr.contentDocument; d.open(); d.write(html); d.close();
    for (let i = 0; i < 40 && [...d.images].some((im) => !im.complete); i++) await sleep(50);
    await sleep(120);
    try { fr.contentWindow.focus(); fr.contentWindow.print(); } finally { setTimeout(() => fr.remove(), 1500); }
  }
  // печать плана: план открывается в SQNS (если ещё не открыт), данные — из формы плана
  async function printPlan(p, API) {
    const P = PLANV(); if (!P || !P.sq) { API.toast('Модуль плана не загружен', 'bad'); return; }
    try {
      const f = await P.sq.loadSqnsPlan(p);
      const D = planData(f);
      if (!D.groups.some((g) => g.rows.length)) { API.toast('В плане нет услуг', 'warn'); return; }
      await printHtml(planHtml(D, patientOf(), getSet()));
    } catch (e) { API.toast('Печать: ' + ((e && e.message) || e), 'bad'); }
  }
  /* ---------------- вкладка «Печать» в панели ---------------- */
  const CSS = `
  .pr-doc{display:flex;align-items:center;gap:10px;border:1.5px solid #e2e8f0;background:#fff;border-radius:12px;padding:9px 12px;margin:6px 0}
  .pr-doc .pr-t{flex:1;min-width:0} .pr-doc b{display:block;font-size:13.5px;color:#0f172a} .pr-doc small{color:#64748b;font-size:11.5px}
  .pr-btn{border:1px solid #c7d2fe;background:#eef2ff;color:#3730a3;border-radius:10px;padding:7px 12px;font-size:12.5px;font-weight:700;cursor:pointer;white-space:nowrap}
  .pr-btn:hover:not(:disabled){background:#e0e7ff} .pr-btn:disabled{opacity:.5;cursor:default}
  .pr-logo{display:flex;align-items:center;gap:12px;margin-bottom:10px}
  .pr-lb{width:96px;height:72px;border:1px dashed #cbd5e1;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:11.5px;background:#fff;overflow:hidden}
  .pr-lb img{max-width:100%;max-height:100%}
  .pr-sg{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;margin:7px 0} .pr-sg>label{font-size:12px;color:#475569;font-weight:600}
  .pr-ta{min-height:70px}
  .pr-tl{display:flex;justify-content:space-between;align-items:center;font-size:12px;color:#475569;font-weight:600;margin:10px 0 4px}
  `;
  let VW = 'list', BUSY = false, DRAFT = null;
  function render(API) {
    if (VW === 'settings') return renderSettings();
    const P = PLANV(), tab = P && P.sq ? P.sq.tabScope() : null;
    let h = '<div class="sec"><h2>План лечения</h2>';
    if (!P || !P.sq) h += '<div class="card"><div class="hint">Модуль плана не загружен.</div></div>';
    else if (!tab) h += '<div class="card empty">Откройте карточку пациента — здесь появятся его планы лечения.</div>';
    else {
      const plans = P.sq.visiblePlans(tab).filter((p) => p.id).sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      h += plans.length ? plans.map((p) => '<div class="pr-doc"><span class="pr-t"><b>' + esc(p.title || 'Без названия') + '</b><small>' + esc(p.dateFormatted || '') + ' · ' + rub(+p.totalPrice || 0) + '</small></span>' +
        (+p.applied ? badge('ok', 'активный') : '') + '<button class="pr-btn" data-prp="' + esc(p.__id__) + '"' + (BUSY ? ' disabled' : '') + '>🖨 Печать</button></div>').join('') : '<div class="hint">У пациента пока нет планов</div>';
    }
    h += '</div><div class="sec"><h2>Акт выполненных работ</h2><div class="card"><div class="hint">Скоро.</div></div></div>';
    const s = getSet();
    if (!s.org.name && !s.logo) h += '<div class="sec"><div class="iss"><div class="warn">⚠️ Шапка документов не заполнена — откройте «Настройки печати»</div></div></div>';
    return { body: h, foot: '<button class="btn sec2" data-pr="settings">⚙ Настройки печати</button><span style="flex:1"></span><button class="btn sec2" data-pr="demo">Пробная печать</button>' };
  }
  function renderSettings() {
    const s = DRAFT || (DRAFT = getSet()), o = s.org;
    const inp = (k, ph) => '<input type="text" data-pro="' + k + '" value="' + esc(o[k]) + '" placeholder="' + esc(ph || '') + '">';
    const row = (l, c) => '<div class="pr-sg"><label>' + esc(l) + '</label><div>' + c + '</div></div>';
    const seg = (doc) => '<div class="seg">' + [['none', 'Без подписи'], ['fixed', 'Постоянное лицо'], ['doctor', 'Текущий врач']].map(([v, l]) => '<button data-prs="' + doc + '" data-v="' + v + '" class="' + (s.sign[doc] === v ? 'on' : '') + '">' + l + '</button>').join('') + '</div>';
    const ta = (k, l) => '<div class="pr-tl"><span>' + esc(l) + '</span>' + (s.texts[k] != null ? '<button class="link" data-prdef="' + k + '">вернуть по умолчанию</button>' : '') + '</div><textarea class="pr-ta" data-prt="' + k + '">' + esc(text(s, k)) + '</textarea>';
    let h = '<div class="sec"><button class="link" data-pr="back">← К документам</button></div>';
    h += '<div class="sec"><h2>Шапка документов</h2><div class="card"><div class="pr-logo"><div class="pr-lb">' + (s.logo ? '<img src="' + s.logo + '" alt="">' : 'логотип') + '</div><div>' +
      '<button class="pr-btn" data-pr="logo">Загрузить…</button> ' + (s.logo ? '<button class="link" data-pr="nologo">убрать</button>' : '') + '<div class="hint" style="margin:6px 0 0">PNG, JPG или SVG, любой формы</div></div></div>' +
      row('Название', inp('name', 'ООО «…»')) + row('ИНН / ОГРН', inp('inn', 'ИНН … · ОГРН …')) + row('Адрес', inp('addr')) + row('Телефон', inp('phone')) + row('Лицензия', inp('lic', '№ … от …')) + row('Своя строка', inp('extra', 'например, сайт или e-mail')) +
      '<div class="hint">Пустые поля не печатаются.</div></div></div>';
    h += '<div class="sec"><h2>Кто подписывает</h2><div class="card">' + DOCS_LIST.map(([k, l]) => row(l, seg(k))).join('') +
      row('Должность', '<input type="text" data-prf="pos" value="' + esc(s.fixed.pos) + '" placeholder="Директор">') + row('ФИО', '<input type="text" data-prf="fio" value="' + esc(s.fixed.fio) + '" placeholder="Фамилия И. О.">') +
      '<div class="hint">Должность и ФИО — для варианта «Постоянное лицо». «Текущий врач» — врач, выбранный в скрипте: ФИО из SQNS, должность — в настройках врача (⚙ у врача).</div></div></div>';
    h += '<div class="sec"><h2>Тексты плана лечения</h2><div class="card">' + ta('planConsent', 'Согласие пациента (над подписью)') + ta('planNote', 'Приписка внизу плана') + '</div></div>';
    return { body: h, foot: '<button class="btn sec2" data-pr="export">⬇ Экспорт</button><button class="btn sec2" data-pr="import">⬆ Импорт</button><span style="flex:1"></span><button class="btn sec2" data-pr="demo">Пробная печать</button><button class="btn pri" data-pr="save" style="flex:none">Сохранить</button>' };
  }
  function pickFile(accept) {
    return new Promise((res) => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
      i.onchange = () => { res(i.files && i.files[0] ? i.files[0] : null); i.remove(); };
      document.body.appendChild(i); i.click();
    });
  }
  function bind(P, API) {
    const on = (sel, ev, fn) => P.querySelectorAll(sel).forEach((el) => el.addEventListener(ev, fn));
    const rr = () => API.rerender();
    on('input,textarea', 'keydown', (e) => e.stopPropagation());   // горячие клавиши SQNS не должны ловить ввод
    on('[data-prp]', 'click', async (e) => {
      const P2 = PLANV(), id = e.currentTarget.dataset.prp, p = P2.sq.visiblePlans(P2.sq.tabScope()).find((x) => String(x.__id__) === id);
      if (!p || BUSY) return; BUSY = true; rr();
      try { await printPlan(p, API); } finally { BUSY = false; rr(); }
    });
    on('[data-pro]', 'input', (e) => { DRAFT.org[e.target.dataset.pro] = e.target.value; });
    on('[data-prf]', 'input', (e) => { DRAFT.fixed[e.target.dataset.prf] = e.target.value; });
    on('[data-prt]', 'input', (e) => { DRAFT.texts[e.target.dataset.prt] = e.target.value; });
    on('[data-prdef]', 'click', (e) => { delete DRAFT.texts[e.currentTarget.dataset.prdef]; rr(); });
    on('[data-prs]', 'click', (e) => { DRAFT.sign[e.currentTarget.dataset.prs] = e.currentTarget.dataset.v; rr(); });
    const fit = (t) => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    P.querySelectorAll('textarea[data-prt]').forEach((t) => { fit(t); t.addEventListener('input', () => fit(t)); });
    on('[data-pr]', 'click', async (e) => {
      const a = e.currentTarget.dataset.pr;
      if (a === 'settings') { VW = 'settings'; DRAFT = getSet(); rr(); return; }
      if (a === 'back') { if (DRAFT && JSON.stringify(DRAFT) !== JSON.stringify(getSet()) && !window.confirm('Изменения настроек не сохранены. Выйти без сохранения?')) return; VW = 'list'; DRAFT = null; rr(); return; }
      if (a === 'demo') { await printHtml(demoHtml(DRAFT)); return; }
      if (a === 'save') { const sv = Object.assign({}, DRAFT); Object.keys(sv.texts).forEach((k) => { if (String(sv.texts[k]).trim() === '' || sv.texts[k] === DEF_TEXTS[k]) delete sv.texts[k]; });
        if (putSet(sv)) { API.toast('Настройки печати сохранены', 'ok'); VW = 'list'; DRAFT = null; } else API.toast('Не удалось сохранить: место в браузере закончилось (уменьшите логотип)', 'bad'); rr(); return; }
      if (a === 'logo') { const f = await pickFile('image/png,image/jpeg,image/svg+xml,image/*'); if (!f) return;
        try { DRAFT.logo = await shrinkLogo(f); rr(); } catch (er) { API.toast(String(er.message || er), 'bad'); } return; }
      if (a === 'nologo') { DRAFT.logo = ''; rr(); return; }
      if (a === 'export') {
        const blob = new Blob([JSON.stringify(DRAFT || getSet(), null, 1)], { type: 'application/json' });
        const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = 'sqns-nastroyki-pechati.json'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 2000);
        API.toast('Файл настроек сохранён в «Загрузки»', 'ok'); return;
      }
      if (a === 'import') {
        const f = await pickFile('application/json,.json'); if (!f) return;
        try { const j = JSON.parse(await f.text()); if (!j || typeof j !== 'object' || !j.org) throw new Error('это не файл настроек печати');
          DRAFT = Object.assign(blankSet(), { org: Object.assign(blankSet().org, j.org), logo: typeof j.logo === 'string' ? j.logo : '', sign: Object.assign(blankSet().sign, j.sign || {}), fixed: Object.assign(blankSet().fixed, j.fixed || {}), texts: Object.assign({}, j.texts || {}) });
          API.toast('Настройки загружены — проверьте и нажмите «Сохранить»', 'ok'); rr();
        } catch (er) { API.toast('Импорт: ' + (er.message || er), 'bad'); }
      }
    });
  }
  // пробная печать: выдуманный пациент и план, шапка и подписи — из настроек (в окне настроек — с несохранёнными правками)
  function demoHtml(s) { const D0 = demoParts(); return planHtml(D0.D, D0.pt, s || getSet()); }
  function demoParts() {
    const h = { D: null, pt: { fio: 'Иванов Иван Иванович (пример)', ini: 'Иванов И. И.', birth: '01.01.1980', card: '0000' } };
    h.D = { title: 'Пример: удаление 3.6 → лечение 2.6 → коронка 2.6', date: new Date().toLocaleDateString('ru-RU'), staged: true, uniform: true, pct: 5, teeth: true, full: 64000, sum: 60800, done: 1425, groups: [
      { name: 'Хирургическая подготовка — удаление 3.6', after: '', rows: [
        { name: 'Консультация врача-стоматолога-хирурга', teeth: [], qty: 1, price: 1500, full: 1500, sum: 1425, disc: 5, prov: 1 },
        { name: 'Удаление зуба сложное', teeth: ['36'], qty: 1, price: 6500, full: 6500, sum: 6175, disc: 5, prov: 0 }] },
      { name: 'Терапевтическая подготовка — лечение 2.6', after: '2 нед.', rows: [
        { name: 'Эндодонтическое лечение трёхканального зуба', teeth: ['26'], qty: 1, price: 24000, full: 24000, sum: 22800, disc: 5, prov: 0 }] },
      { name: 'Ортопедический этап — коронка 2.6', after: '1 мес.', rows: [
        { name: 'Коронка из диоксида циркония', teeth: ['26'], qty: 1, price: 32000, full: 32000, sum: 30400, disc: 5, prov: 0 }] }] };
    return h;
  }
  function leave() { VW = 'list'; DRAFT = null; }

  globalThis.SQNSMZ_PRINT = { css: CSS, render, bind, leave, printPlan, _test: { planData, planHtml, demoHtml, getSet, putSet, signer, stripCode, LSK } };
})();
