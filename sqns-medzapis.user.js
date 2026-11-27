// ==UserScript==
// @name         SQNS · Помощник медзаписи
// @namespace    sqns-medzapis
// @version      1.9.4
// @description  Шаблоны дневника приёма и протокола ЕГИСЗ (СЭМД 227) для SQNS с предзаполнением по услугам и зубам визита
// @match        https://app2.sqns.ru/*
// @match        https://*.sqns.ru/*
// @noframes
// @run-at       document-idle
// @grant        none
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/templates.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/services.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/ortho.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/svc-engine.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/plan.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/doctors.js?v=1.9.4
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/engine.js?v=1.9.4
// @updateURL    https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/sqns-medzapis.user.js
// @downloadURL  https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/sqns-medzapis.user.js
// @homepageURL  https://github.com/SolnOmega/sqns-medzapis
// ==/UserScript==

// Весь код — в templates.js (шаблоны дневника), services.js (сценарии услуг), ortho.js (ортопедия), svc-engine.js (вкладка «Услуги»), plan.js (вкладка «План»), doctors.js (смена врача) и engine.js (панель и боковые кнопки).
// При каждом обновлении поднимайте @version и ?v= во всех строках @require.
