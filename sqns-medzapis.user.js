// ==UserScript==
// @name         SQNS · Помощник медзаписи
// @namespace    sqns-medzapis
// @version      1.6.6
// @description  Шаблоны дневника приёма и протокола ЕГИСЗ (СЭМД 227) для SQNS с предзаполнением по услугам и зубам визита
// @match        https://app2.sqns.ru/*
// @match        https://*.sqns.ru/*
// @noframes
// @run-at       document-idle
// @grant        none
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/templates.js?v=1.6.6
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/services.js?v=1.6.6
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/svc-engine.js?v=1.6.6
// @require      https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/engine.js?v=1.6.6
// @updateURL    https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/sqns-medzapis.user.js
// @downloadURL  https://raw.githubusercontent.com/SolnOmega/sqns-medzapis/main/sqns-medzapis.user.js
// @homepageURL  https://github.com/SolnOmega/sqns-medzapis
// ==/UserScript==

// Весь код — в templates.js (шаблоны дневника), services.js (сценарии услуг), svc-engine.js (вкладка «Услуги») и engine.js (панель).
// При каждом обновлении поднимайте @version и ?v= во всех строках @require.
