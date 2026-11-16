'use strict';

/* =========================================================
   Câmara AFO — app de bolso da Câmara Municipal de
   Alta Floresta D'Oeste. Lê os dados públicos do SAPL.
   ========================================================= */

const SAPL = 'https://sapl.altaflorestadoeste.ro.leg.br';
const API = SAPL + '/api/';
const KICKER = "Câmara de Alta Floresta D'Oeste";

const $ = (id) => document.getElementById(id);
const $view = $('view');
const $nav = $('nav');
const $navTitle = $('navTitle');
const $back = $('back');

/* =========================================================
   Utilitários de texto e data
   ========================================================= */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const https = (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : '');
const cut = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function toDate(d) { const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, dd); }
function fmtDate(d) { if (!d) return ''; const [y, m, dd] = String(d).slice(0, 10).split('-'); return `${dd}/${m}/${y}`; }
function fmtLongDate(d, withYear = true) {
  if (!d) return '';
  const s = toDate(d).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', ...(withYear ? { year: 'numeric' } : {}) });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function monthLabel(d) {
  const s = toDate(d).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function weekdayShort(d) { return toDate(d).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''); }
function relDate(d) {
  if (!d) return '';
  const days = Math.round((toDate(todayISO()) - toDate(d)) / 864e5);
  if (days === 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days === -1) return 'Amanhã';
  if (days < 0) return -days < 7 ? `Em ${-days} dias` : fmtDate(d);
  if (days < 7) return `Há ${days} dias`;
  if (days < 31) { const w = Math.floor(days / 7); return `Há ${w} semana${w > 1 ? 's' : ''}`; }
  return fmtDate(d);
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'ao', 'em', 'por', 'para', 'com', 'nº', 'à', 'na', 'no']);
function isShouting(s) {
  const letters = String(s || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (!letters) return false;
  return letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length / letters.length > 0.7;
}
function titleCase(s) {
  return String(s || '').toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    if (/^[ivx]+$/.test(w) && w.length <= 4) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}
const nice = (s) => (isShouting(s) ? titleCase(s) : String(s || ''));

// Nomes próprios e siglas que voltam ao normal depois de tirar o "caixa alta".
const PROPER = [
  [/alta floresta d\s*['’`]?\s*oeste/gi, "Alta Floresta D'Oeste"],
  [/filad[eé]lfia d\s*['’`]?\s*oeste/gi, "Filadélfia D'Oeste"],
  [/santo ant[oô]nio d\s*['’`]?\s*oeste/gi, "Santo Antônio D'Oeste"],
  [/rolim de moura do guapor[eé]/gi, 'Rolim de Moura do Guaporé'],
  [/nova gease/gi, 'Nova Gease'],
  [/izidol[aâ]ndia/gi, 'Izidolândia'],
  [/rond[oô]nia/gi, 'Rondônia'],
  [/\b(ro|br)\s*-\s*(\d+)/gi, (m, a, b) => a.toUpperCase() + '-' + b],
  [/\/(ro)\b/gi, '/RO'],
  [/\b(semed|semusa|semosp|semas|semagri|cmafo|pmaf|tce|tcero|ldo|loa|ppa|sus|fundeb)\b/gi, (m) => m.toUpperCase()],
  [/\b(incisos?|cap[ií]tulos?|t[ií]tulos?|se[cç](?:ão|ões))\s+([ivxlc]+(?:\s*(?:,|e)\s*[ivxlc]+)*)\b/gi,
    (m, w, nums) => w + ' ' + nums.replace(/[ivxlc]+/gi, (r) => r.toUpperCase())],
];
function sentence(s) {
  s = String(s || '').trim();
  if (!s || !isShouting(s)) return s;
  s = s.toLowerCase();
  for (const [re, rep] of PROPER) s = s.replace(re, rep);
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettyMateria(str) {
  const m = String(str || '').match(/^(.*?)\s+nº\s+(\d+)\s+de\s+(\d{4})$/i);
  return m ? `${titleCase(m[1])} nº ${m[2]}/${m[3]}` : nice(str);
}
function shortUnidade(s) {
  const parts = String(s || '').split(' - ');
  return nice(parts.reduce((a, b) => (b.length > a.length ? b : a), ''));
}

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* =========================================================
   Ícones (desenhados no estilo SF Symbols)
   ========================================================= */

const svg = (p, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
const I = {
  chev: '<svg class="chev" width="8" height="14" viewBox="0 0 8 14" aria-hidden="true"><path d="M1.5 1.5 6.5 7l-5 5.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  doc: svg('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
  list: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.1" fill="currentColor"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor"/><circle cx="4.5" cy="18" r="1.1" fill="currentColor"/>'),
  play: svg('<circle cx="12" cy="12" r="9"/><path d="m10 8.3 5.3 3.7-5.3 3.7Z" fill="currentColor"/>'),
  share: svg('<path d="M12 3.5v11M8 7.3l4-3.8 4 3.8"/><path d="M8 10.5H6.5a1.5 1.5 0 0 0-1.5 1.5v7a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>'),
  star: svg('<path d="m12 3.2 2.6 5.5 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3.1 1.2-6-4.5-4.1 6-.7Z"/>'),
  starFill: svg('<path d="m12 3.2 2.6 5.5 6 .7-4.5 4.1 1.2 6L12 16.4l-5.3 3.1 1.2-6-4.5-4.1 6-.7Z" fill="currentColor"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1Z"/>'),
  check: svg('<path d="m5.5 12.5 4 4L18.5 7.5"/>', 'stroke-width="3.2"'),
  x: svg('<path d="M7 7l10 10M17 7 7 17"/>', 'stroke-width="3.2"'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 4.5 4.5"/>', 'stroke-width="2.2"'),
  sliders: svg('<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/>'),
  megaphone: svg('<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4.5V4.5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16.5 9a4 4 0 0 1 0 6"/>', 'stroke-width="2"'),
  bubble: svg('<path d="M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4.5 3.5V16.5h-1a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z"/>', 'stroke-width="2"'),
  scroll: svg('<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/>', 'stroke-width="2"'),
  seal: svg('<circle cx="12" cy="9.5" r="5.5"/><path d="m9 14.3-1.3 6.2 4.3-2.3 4.3 2.3-1.3-6.2"/>', 'stroke-width="2"'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', 'stroke-width="2"'),
  building: svg('<path d="M12 3 21 8v1.5H3V8Z"/><path d="M5.5 12v6M10 12v6M14 12v6M18.5 12v6M3 21h18"/>'),
};

/* =========================================================
   Tipos de matéria: sigla e cor
   ========================================================= */

const SIGLA = { 1: 'PL', 7: 'PLL', 5: 'IND', 2: 'REQ', 3: 'VETO', 8: 'PLC', 9: 'PR', 26: 'PDL', 24: 'EMENDA', 13: 'PELOM', 30: 'LEI', 14: 'ATO', 6: 'ATO', 4: 'OFÍCIO' };
const COR = { 1: '--tint', 7: '--tint', 8: '--indigo', 13: '--indigo', 5: '--green', 2: '--blue', 3: '--red', 9: '--orange', 26: '--orange', 24: '--pink', 30: '--teal' };
let TIPOS = {}; // preenchido pelo lookup

function tagInfo(mt) {
  const t = TIPOS[mt.tipo] || {};
  const sigla = SIGLA[mt.tipo] || t.sigla || 'MAT';
  return { label: `${sigla} ${mt.numero}/${mt.ano}`, color: COR[mt.tipo] || '--gray', nome: t.nome ? titleCase(t.nome) : '' };
}
const tagHTML = (info) => `<span class="tag" style="--c:var(${info.color})">${esc(info.label)}</span>`;

/* =========================================================
   Acesso à API do SAPL
   ========================================================= */

async function api(path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(params)) if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v);
  const r = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('O SAPL respondeu com erro ' + r.status);
  return r.json();
}
async function allPages(path, params = {}, maxPages = 5) {
  let page = 1;
  let out = [];
  for (;;) {
    const j = await api(path, { ...params, page, page_size: 100 });
    out = out.concat(j.results || []);
    const next = j.pagination && j.pagination.next_page;
    if (!next || page >= maxPages) break;
    page = next;
  }
  return out;
}
const total = (j) => (j && j.pagination ? j.pagination.total_entries : (j && j.results ? j.results.length : 0));

// Tabelas que mudam pouco ficam guardadas no aparelho.
async function cached(key, hours, loader) {
  const c = LS.get('cache:' + key);
  if (c && Date.now() - c.t < hours * 3600e3) return c.v;
  try {
    const v = await loader();
    LS.set('cache:' + key, { t: Date.now(), v });
    return v;
  } catch (e) {
    if (c) return c.v;
    throw e;
  }
}

const lookups = {
  tipos: () => cached('tipos', 24, async () =>
    Object.fromEntries((await allPages('materia/tipomaterialegislativa/')).map((t) => [t.id, { sigla: t.sigla, nome: t.descricao }])))
    .then((t) => (TIPOS = t)),
  status: () => cached('status', 24, async () =>
    Object.fromEntries((await allPages('materia/statustramitacao/')).map((s) => [s.id, s.descricao]))),
  unidades: () => cached('unidades', 24, async () =>
    Object.fromEntries((await allPages('materia/unidadetramitacao/')).map((u) => [u.id, u.__str__]))),
  autores: () => cached('autores', 12, async () =>
    (await allPages('base/autor/')).map((a) => ({ id: a.id, nome: a.nome, tipo: a.tipo, obj: a.object_id }))),
  vereadores: () => cached('vereadores', 12, loadVereadores),
};

async function loadVereadores() {
  const [legs, parls, autores] = await Promise.all([
    allPages('parlamentares/legislatura/'),
    allPages('parlamentares/parlamentar/'),
    lookups.autores(),
  ]);
  const hoje = todayISO();
  let atual = legs.find((l) => l.data_inicio <= hoje && hoje <= l.data_fim);
  if (!atual) atual = legs.reduce((a, b) => (Number(b.numero) > Number(a.numero) ? b : a), legs[0]);
  const mandatos = await allPages('parlamentares/mandato/', { legislatura: atual.id });
  const byId = Object.fromEntries(parls.map((p) => [p.id, p]));
  const seen = new Set();
  const lista = [];
  for (const m of mandatos) {
    if (seen.has(m.parlamentar)) continue;
    seen.add(m.parlamentar);
    const p = byId[m.parlamentar] || {};
    const autor = autores.find((a) => a.tipo === 2 && a.obj === m.parlamentar);
    lista.push({
      pid: m.parlamentar,
      nome: p.nome_parlamentar || p.nome_completo || String(m.__str__ || '').split(' 1')[0],
      completo: p.nome_completo || '',
      foto: https(p.fotografia),
      titular: m.titular !== false,
      autorId: autor ? autor.id : null,
    });
  }
  lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return { legislatura: atual.numero, inicio: atual.data_inicio, fim: atual.data_fim, lista };
}

/* =========================================================
   Favoritos ("Salvos")
   ========================================================= */

const Favs = {
  all() { return LS.get('favs') || {}; },
  has(id) { return Boolean(this.all()[id]); },
  save(obj) { LS.set('favs', obj); updateDot(); },
  toggle(id, info) {
    const f = this.all();
    if (f[id]) delete f[id]; else f[id] = { ...info, added: Date.now() };
    this.save(f);
    return Boolean(f[id]);
  },
  update(id, patch) {
    const f = this.all();
    if (!f[id]) return;
    f[id] = { ...f[id], ...patch };
    this.save(f);
  },
  hasNews(id) {
    const x = this.all()[id];
    return Boolean(x && x.last && x.seen !== x.last);
  },
  anyNews() { return Object.keys(this.all()).some((id) => this.hasNews(id)); },
};
function updateDot() { $('dot').hidden = !Favs.anyNews(); }

function sortTram(list) {
  return [...list].sort((a, b) => (b.data_tramitacao || '').localeCompare(a.data_tramitacao || '') || (b.id - a.id));
}
async function refreshFavs() {
  const f = Favs.all();
  const ids = Object.keys(f);
  if (!ids.length) return;
  const status = await lookups.status().catch(() => ({}));
  await Promise.allSettled(ids.map(async (id) => {
    const j = await api('materia/tramitacao/', { materia: id, page_size: 50 });
    const t = sortTram(j.results || [])[0];
    if (!t) return;
    const patch = { last: t.id, lastStatus: status[t.status] || '', lastDate: t.data_tramitacao };
    if (f[id].seen === undefined || f[id].seen === null) patch.seen = t.id;
    Favs.update(id, patch);
  }));
}

/* =========================================================
   Estrutura da interface: cabeçalho, navegação, gestos
   ========================================================= */

let navToken = 0;
let currentTab = 'hoje';
const stack = [];
let titleBottom = 0;
const TAB_ROOT = { hoje: '#/hoje', sessoes: '#/sessoes', materias: '#/materias', vereadores: '#/vereadores', salvos: '#/salvos' };

function setHeader(title, { back = false } = {}) {
  $navTitle.textContent = title;
  $back.hidden = !back;
  document.title = title === 'Hoje' ? 'Câmara AFO' : `${title} · Câmara AFO`;
}
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
function measureTitle() {
  const el = $view.querySelector('.large-title');
  const navH = $nav.offsetHeight;
  titleBottom = el ? el.getBoundingClientRect().bottom + window.scrollY - navH - 4 : -1;
  onScroll();
}
function onScroll() { $nav.classList.toggle('scrolled', window.scrollY > titleBottom); }
window.addEventListener('scroll', onScroll, { passive: true });

function render(html, token, animate = true) {
  if (token !== undefined && token !== navToken) return false;
  $view.innerHTML = html;
  if (animate) { $view.classList.remove('enter'); void $view.offsetWidth; $view.classList.add('enter'); }
  requestAnimationFrame(measureTitle);
  return true;
}
const largeHTML = (title, eyebrow = '', sub = '') => `<div class="large">
  ${eyebrow ? `<div class="eyebrow">${esc(eyebrow)}</div>` : ''}
  <h1 class="large-title">${esc(title)}</h1>${sub ? `<div class="large-sub">${sub}</div>` : ''}</div>`;

function skeletonHTML(title, eyebrow, rows = 6) {
  const row = `<div class="sk-row"><div class="sk" style="width:46px;height:46px;border-radius:10px;flex:none"></div>
    <div style="flex:1"><div class="sk" style="height:13px;width:38%;margin-bottom:9px"></div>
    <div class="sk" style="height:12px;width:92%;margin-bottom:7px"></div><div class="sk" style="height:12px;width:66%"></div></div></div>`;
  return (title ? largeHTML(title, eyebrow) : '<div class="large"><div class="sk" style="width:110px;height:12px;margin-bottom:10px"></div><div class="sk" style="width:200px;height:32px"></div></div>') +
    `<div class="group">${row.repeat(rows)}</div>`;
}
function errorHTML(e) {
  const off = !navigator.onLine;
  return `<div class="error"><b>${off ? 'Sem internet' : 'Não foi possível carregar'}</b>
    ${off ? 'Esses dados ainda não foram salvos no aparelho.' : 'O sistema da Câmara não respondeu agora.'}
    <div style="font-size:13px;margin-top:6px">${esc(e && e.message ? e.message : '')}</div>
    <button class="btn" onclick="router()">Tentar de novo</button></div>`;
}
const footerHTML = `<div class="footer">App não oficial · dados públicos do
  <a href="${SAPL}" target="_blank" rel="noopener">SAPL da Câmara Municipal de Alta Floresta D'Oeste</a></div>`;

function goBack() {
  if (stack.length > 1) history.back();
  else location.hash = TAB_ROOT[currentTab];
}
$back.addEventListener('click', goBack);

function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function installHTML() {
  if (isStandalone() || LS.get('hideInstall')) return '';
  return `<div class="install"><img src="./icons/icon-192.png" alt="">
    <div class="grow">Instale o app: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</div>
    <button aria-label="Fechar" onclick="LS.set('hideInstall',1);this.parentNode.remove();measureTitle()">×</button></div>`;
}

/* ---- aviso rápido ---- */
let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ---- compartilhar ---- */
async function shareLink({ title, text, hash }) {
  const url = location.href.split('#')[0] + hash;
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); } catch (e) { /* cancelado */ }
    return;
  }
  try { await navigator.clipboard.writeText(`${title}\n${text ? text + '\n' : ''}${url}`); toast('Link copiado'); }
  catch { toast('Não foi possível compartilhar'); }
}

/* ---- painel inferior ---- */
function openSheet(html) {
  const bg = $('sheetBg');
  const sh = $('sheet');
  sh.innerHTML = '<div class="grabber"></div>' + html;
  bg.hidden = false; sh.hidden = false;
  requestAnimationFrame(() => { bg.classList.add('show'); sh.classList.add('show'); });
  bg.onclick = closeSheet;
  return sh;
}
function closeSheet() {
  const bg = $('sheetBg');
  const sh = $('sheet');
  bg.classList.remove('show'); sh.classList.remove('show');
  setTimeout(() => { bg.hidden = true; sh.hidden = true; }, 320);
}

/* ---- gestos: deslizar da borda para voltar e puxar para atualizar ---- */
(function gestures() {
  let sx = 0; let sy = 0; let mode = null; let dx = 0; let dy = 0;
  const ptr = $('ptr');
  const spin = ptr.querySelector('.ptr-spin');
  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || !$('sheet').hidden) { mode = null; return; }
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dx = 0; dy = 0;
    // No Safari comum o próprio navegador já tem esses gestos; aqui só no app instalado.
    if (!isStandalone()) { mode = null; return; }
    if (sx < 26 && !$back.hidden) mode = 'back';
    else if (window.scrollY <= 0) mode = 'maybe-ptr';
    else mode = null;
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!mode) return;
    dx = e.touches[0].clientX - sx; dy = e.touches[0].clientY - sy;
    if (mode === 'back') {
      if (dx > 0) { $view.style.transition = 'none'; $view.style.transform = `translateX(${dx}px)`; $view.style.opacity = String(1 - Math.min(dx / 600, 0.4)); }
    } else if (mode === 'maybe-ptr') {
      if (Math.abs(dx) > Math.abs(dy) || dy < 0) { mode = null; return; }
      mode = 'ptr';
    }
    if (mode === 'ptr') {
      const p = Math.min(dy * 0.45, 78);
      ptr.classList.add('pull');
      ptr.style.transform = `translate(-50%, ${p}px)`;
      spin.style.transform = `rotate(${dy * 2}deg)`;
      $view.style.transition = 'none';
      $view.style.transform = `translateY(${p * 0.6}px)`;
    }
  }, { passive: true });
  document.addEventListener('touchend', async () => {
    const m = mode; mode = null;
    if (m === 'back') {
      $view.style.transition = 'transform .25s ease, opacity .25s ease';
      if (dx > 90) { $view.style.transform = 'translateX(100%)'; setTimeout(() => { $view.style.transition = 'none'; $view.style.transform = ''; $view.style.opacity = ''; goBack(); }, 180); }
      else { $view.style.transform = ''; $view.style.opacity = ''; }
    } else if (m === 'ptr') {
      $view.style.transition = 'transform .25s ease';
      $view.style.transform = '';
      if (dy * 0.45 > 58) {
        ptr.classList.add('busy');
        ptr.style.transform = 'translate(-50%, 48px)';
        await router(true).catch(() => {});
        ptr.classList.remove('busy');
      }
      ptr.classList.remove('pull');
      ptr.style.transform = '';
    }
  });
}());

/* =========================================================
   Componentes de lista
   ========================================================= */

function matRow(mt, opts = {}) {
  const info = tagInfo(mt);
  const novo = Favs.hasNews(mt.id);
  return `<a class="row mat" href="#/materia/${mt.id}">
    ${opts.unread !== undefined ? `<span class="unread ${opts.unread ? '' : 'off'}"></span>` : ''}
    <div class="grow">
      <div class="mat-top">${tagHTML(info)}${Favs.has(mt.id) ? `<span style="color:var(--orange);width:15px">${I.starFill}</span>` : ''}
        <span class="when">${esc(opts.when || relDate(mt.data_apresentacao))}</span></div>
      <div class="mat-text clamp3">${esc(sentence(mt.ementa) || prettyMateria(mt.__str__))}</div>
      ${opts.extra || ''}${novo && opts.unread === undefined ? '<div class="mat-res"><span class="pill" style="--c:var(--blue)">Novidade</span></div>' : ''}
    </div>${I.chev}</a>`;
}
function resultadoPill(r) {
  if (!r) return '';
  const c = /aprovad/i.test(r) ? '--green' : /rejeit/i.test(r) ? '--red' : /retirad|adiad|vista/i.test(r) ? '--orange' : '--gray';
  return `<div class="mat-res"><span class="pill" style="--c:var(${c})">${esc(cut(nice(r), 48))}</span></div>`;
}

function sessaoNome(s) {
  const m = String(s.__str__ || '').match(/^(\d+ª)\s+(\S+)/);
  return m ? `${m[1]} Sessão ${m[2]}` : nice(s.__str__);
}
function sessaoStatus(s) {
  const hoje = todayISO();
  if (s.finalizada) return { t: 'Realizada', c: '--green' };
  if (s.data_inicio > hoje) return { t: 'Agendada', c: '--blue' };
  if (s.data_inicio === hoje) return { t: 'Hoje', c: '--orange' };
  return { t: 'Iniciada', c: '--gray' };
}
function sessaoRow(s) {
  const st = sessaoStatus(s);
  const hora = s.hora_inicio ? ` · ${esc(s.hora_inicio)}` : '';
  return `<a class="row" href="#/sessao/${s.id}">
    <div class="datebox"><b>${esc(String(s.data_inicio).slice(8, 10))}</b><span>${esc(weekdayShort(s.data_inicio))}</span></div>
    <div class="grow"><div class="title">${esc(sessaoNome(s))}</div>
      <div class="sub"><span class="pill" style="--c:var(${st.c})">${st.t}</span>${hora}</div></div>${I.chev}</a>`;
}

/* =========================================================
   HOJE
   ========================================================= */

async function viewHoje(m, token) {
  const hoje = todayISO();
  const ano = new Date().getFullYear();
  setHeader('Hoje');
  render(skeletonHTML('Hoje', fmtLongDate(hoje, false)), token, false);

  const count = (params) => api('materia/materialegislativa/', { page_size: 1, ano, ...params }).then(total).catch(() => null);
  const [sess, rec, , cInd, cReq, cPl, cLei] = await Promise.all([
    api('sessao/sessaoplenaria/', { o: '-data_inicio', page_size: 6 }),
    api('materia/materialegislativa/', { o: '-data_apresentacao', page_size: 6 }).catch(() => ({ results: [] })),
    lookups.tipos().catch(() => ({})),
    count({ tipo: 5 }), count({ tipo: 2 }), count({ tipo: 1 }), count({ tipo: 30 }),
  ]);
  if (token !== navToken) return;

  const S = sess.results || [];
  const futuras = S.filter((s) => s.data_inicio >= hoje).sort((a, b) => a.data_inicio.localeCompare(b.data_inicio));
  const hero = futuras[0] || S[0];
  let heroHTML = '';
  if (hero) {
    const rot = futuras[0] ? (hero.data_inicio === hoje ? 'Sessão de hoje' : 'Próxima sessão') : 'Última sessão';
    const acts = [];
    if (hero.upload_pauta) acts.push(`<a href="${esc(https(hero.upload_pauta))}" target="_blank" rel="noopener">${I.list}Pauta</a>`);
    if (hero.url_video) acts.push(`<a href="${esc(hero.url_video)}" target="_blank" rel="noopener">${I.play}Vídeo</a>`);
    if (hero.upload_ata) acts.push(`<a href="${esc(https(hero.upload_ata))}" target="_blank" rel="noopener">${I.doc}Ata</a>`);
    acts.push(`<a href="#/sessao/${hero.id}">Detalhes</a>`);
    heroHTML = `<div class="hero"><div class="eyebrow">${rot}</div>
      <h3>${esc(sessaoNome(hero))}</h3>
      <div class="when">${esc(fmtLongDate(hero.data_inicio))}${hero.hora_inicio ? ' · ' + esc(hero.hora_inicio) : ''}</div>
      <div class="acts">${acts.join('')}</div></div>`;
  }

  const tile = (n, label, color, icon, hash) => `<a class="tile" style="--c:var(${color})" href="${hash}">
    <div class="ic">${icon}</div><b>${n === null ? '—' : n.toLocaleString('pt-BR')}</b><span>${label}</span></a>`;

  const favIds = Object.keys(Favs.all());
  render(`${largeHTML('Hoje', fmtLongDate(hoje, false))}
    ${installHTML()}
    ${heroHTML}
    <div class="section"><h2>Em ${ano}</h2></div>
    <div class="tiles">
      ${tile(cInd, 'Indicações', '--green', I.megaphone, `#/materias?tipo=5&ano=${ano}`)}
      ${tile(cReq, 'Requerimentos', '--blue', I.bubble, `#/materias?tipo=2&ano=${ano}`)}
      ${tile(cPl, 'Projetos de lei', '--tint', I.scroll, `#/materias?tipo=1&ano=${ano}`)}
      ${tile(cLei, 'Leis sancionadas', '--teal', I.seal, `#/materias?tipo=30&ano=${ano}`)}
    </div>
    <div id="favBlock">${favIds.length ? favBlockHTML() : ''}</div>
    <div class="section"><h2>Novas matérias</h2><a href="#/materias">Ver tudo</a></div>
    <div class="group">${(rec.results || []).map((x) => matRow(x)).join('') || '<div class="empty">Nada por aqui.</div>'}</div>
    ${footerHTML}`, token);

  if (favIds.length) {
    await refreshFavs().catch(() => {});
    if (token !== navToken) return;
    const fb = $('favBlock');
    if (fb) fb.innerHTML = favBlockHTML();
  }
}
function favBlockHTML() {
  const f = Favs.all();
  const ids = Object.keys(f).sort((a, b) => (Favs.hasNews(b) - Favs.hasNews(a)) || (f[b].lastDate || '').localeCompare(f[a].lastDate || ''));
  if (!ids.length) return '';
  const news = ids.filter((id) => Favs.hasNews(id)).length;
  return `<div class="section"><h2>Suas matérias</h2><a href="#/salvos">${news ? `${news} novidade${news > 1 ? 's' : ''}` : 'Ver tudo'}</a></div>
    <div class="group">${ids.slice(0, 3).map((id) => favRow(id, f[id])).join('')}</div>`;
}

/* =========================================================
   SESSÕES
   ========================================================= */

async function viewSessoes(m, token) {
  setHeader('Sessões');
  render(skeletonHTML('Sessões', KICKER), token, false);
  const all = [];
  let next = 1;

  async function loadMore() {
    const j = await api('sessao/sessaoplenaria/', { o: '-data_inicio', page_size: 20, page: next });
    all.push(...(j.results || []));
    next = j.pagination && j.pagination.next_page;
  }
  function listHTML() {
    let html = '';
    let mes = null;
    for (const s of all) {
      const ml = monthLabel(s.data_inicio);
      if (ml !== mes) { if (mes !== null) html += '</div>'; html += `<div class="sh">${esc(ml)}</div><div class="group inset-64">`; mes = ml; }
      html += sessaoRow(s);
    }
    if (mes !== null) html += '</div>';
    return html;
  }
  await loadMore();
  if (!render(`${largeHTML('Sessões', KICKER)}<div id="list">${listHTML()}</div><div id="more"></div>${footerHTML}`, token)) return;

  const setMore = () => {
    $('more').innerHTML = next ? '<div class="group"><button class="more-btn" id="moreBtn">Carregar sessões anteriores</button></div>' : '';
    if (!next) return;
    $('moreBtn').onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Carregando…';
      try { await loadMore(); if (token !== navToken) return; $('list').innerHTML = listHTML(); setMore(); }
      catch { ev.target.disabled = false; ev.target.textContent = 'Erro. Toque para tentar de novo'; }
    };
  };
  setMore();
}

async function viewSessao(m, token) {
  const id = m[1];
  setHeader('Sessão', { back: true });
  render(skeletonHTML(null, null, 4), token, false);
  const [s, exp, ord] = await Promise.all([
    api(`sessao/sessaoplenaria/${id}/`),
    api('sessao/expedientemateria/', { sessao_plenaria: id, page_size: 100 }).catch(() => ({ results: [] })),
    api('sessao/ordemdia/', { sessao_plenaria: id, page_size: 100 }).catch(() => ({ results: [] })),
    lookups.tipos().catch(() => ({})),
  ]);
  if (token !== navToken) return;
  const nome = sessaoNome(s);
  setHeader(nome, { back: true });

  const items = [...(exp.results || []), ...(ord.results || [])];
  const mats = {};
  await Promise.allSettled([...new Set(items.map((i) => i.materia))].map(async (mid) => { mats[mid] = await api(`materia/materialegislativa/${mid}/`); }));
  if (token !== navToken) return;

  const st = sessaoStatus(s);
  const hora = s.hora_inicio ? `${s.hora_inicio}${s.hora_fim ? ' às ' + s.hora_fim : ''}` : '';
  const acts = [];
  if (s.upload_pauta) acts.push(`<a class="action" href="${esc(https(s.upload_pauta))}" target="_blank" rel="noopener">${I.list}Pauta</a>`);
  if (s.upload_ata) acts.push(`<a class="action" href="${esc(https(s.upload_ata))}" target="_blank" rel="noopener">${I.doc}Ata</a>`);
  if (s.url_video) acts.push(`<a class="action" href="${esc(s.url_video)}" target="_blank" rel="noopener">${I.play}Vídeo</a>`);
  acts.push(`<button class="action" id="shareS">${I.share}Enviar</button>`);

  const byOrder = (a, b) => (a.numero_ordem || 0) - (b.numero_ordem || 0);
  const block = (label, list) => (list.length ? `<div class="sh">${label} · ${list.length}</div><div class="group">${
    [...list].sort(byOrder).map((it) => {
      const mt = mats[it.materia];
      if (!mt) return `<a class="row" href="#/materia/${it.materia}"><div class="grow">${esc(prettyMateria(String(it.__str__ || '').replace(/^.*?:\s*\d+\s*-\s*/, '').replace(/\s+em\s+\d+ª.*$/, '')))}${resultadoPill(it.resultado)}</div>${I.chev}</a>`;
      return matRow(mt, { when: it.numero_ordem ? `${it.numero_ordem}º item` : '', extra: resultadoPill(it.resultado) });
    }).join('')}</div>` : '');

  render(`${largeHTML(nome, fmtLongDate(s.data_inicio), `<span class="pill" style="--c:var(${st.c})">${st.t}</span>${hora ? ' · ' + esc(hora) : ''}`)}
    <div class="actions">${acts.join('')}</div>
    ${block('Expediente', exp.results || [])}
    ${block('Ordem do Dia', ord.results || [])}
    ${items.length ? '' : `<div class="empty"><b>Sem matérias lançadas</b>As matérias desta sessão ainda não foram registradas no sistema.${s.upload_pauta ? ' Veja a pauta em PDF acima.' : ''}</div>`}
    <div class="sh">Sobre</div><div class="group"><div class="row"><div class="grow"><div class="sub" style="margin:0">${esc(nice(s.__str__))}</div></div></div></div>
    ${footerHTML}`, token);

  $('shareS').onclick = () => shareLink({ title: `${nome} · Câmara de Alta Floresta D'Oeste`, text: fmtLongDate(s.data_inicio), hash: `#/sessao/${s.id}` });
}

/* =========================================================
   MATÉRIAS
   ========================================================= */

const CHIPS = [
  ['', 'Todas'], ['1', 'Projetos de lei'], ['5', 'Indicações'], ['2', 'Requerimentos'],
  ['30', 'Leis'], ['3', 'Vetos'], ['7', 'Proj. legislativos'], ['8', 'Complementares'], ['9', 'Resoluções'],
];

async function viewMaterias(m, token) {
  setHeader('Matérias');
  const q = new URLSearchParams(m[1] || '');
  const state = { q: q.get('q') || '', tipo: q.get('tipo') || '', ano: q.get('ano') || '', autor: q.get('autor') || '' };
  render(skeletonHTML('Matérias', KICKER), token, false);
  const [tipos, autores] = await Promise.all([lookups.tipos(), lookups.autores()]);
  if (token !== navToken) return;

  if (!render(`${largeHTML('Matérias', KICKER)}
    <form class="searchbar" onsubmit="return false">${I.search}
      <input id="q" type="search" placeholder="Assunto ou número (ex.: 113/2026)" value="${esc(state.q)}" enterkeyhint="search" autocomplete="off"></form>
    <div class="chips" id="chips"></div>
    <div class="count" id="count"></div>
    <div id="results"></div>
    <div id="more"></div>${footerHTML}`, token)) return;

  const $q = $('q');
  let page = 1;
  let reqId = 0;

  function extraFilters() {
    let n = 0;
    if (state.ano) n++;
    if (state.autor) n++;
    if (state.tipo && !CHIPS.some(([v]) => v === state.tipo)) n++;
    return n;
  }
  function drawChips() {
    const n = extraFilters();
    $('chips').innerHTML = `<button class="chip ${n ? 'on' : ''}" id="fbtn">${I.sliders}Filtros${n ? `<span class="n">${n}</span>` : ''}</button>` +
      CHIPS.map(([v, l]) => `<button class="chip ${state.tipo === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('');
    $('chips').querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { state.tipo = b.dataset.v; drawChips(); sync(); load(true); }; });
    $('fbtn').onclick = openFilters;
  }
  function sync() {
    const p = new URLSearchParams();
    for (const k of ['q', 'tipo', 'ano', 'autor']) if (state[k]) p.set(k, state[k]);
    history.replaceState(null, '', '#/materias' + (p.toString() ? '?' + p : ''));
  }
  function params() {
    const p = { o: '-data_apresentacao', page_size: 20, page, tipo: state.tipo, ano: state.ano, autores: state.autor };
    const txt = state.q.trim();
    const num = txt.match(/^(\d+)(?:\s*[/-]\s*(\d{4}))?$/);
    if (num) { p.numero = num[1]; if (num[2]) p.ano = num[2]; } else if (txt) p.ementa__icontains = txt;
    return p;
  }
  async function load(reset) {
    const my = ++reqId;
    if (reset) {
      page = 1;
      $('results').innerHTML = `<div class="group">${'<div class="sk-row"><div style="flex:1"><div class="sk" style="height:13px;width:30%;margin-bottom:9px"></div><div class="sk" style="height:12px;width:92%;margin-bottom:7px"></div><div class="sk" style="height:12px;width:60%"></div></div></div>'.repeat(5)}</div>`;
      $('count').textContent = ''; $('more').innerHTML = '';
    }
    try {
      const j = await api('materia/materialegislativa/', params());
      if (my !== reqId) return;
      const t = total(j);
      $('count').textContent = t === 1 ? '1 matéria' : `${t.toLocaleString('pt-BR')} matérias`;
      const rows = (j.results || []).map((x) => matRow(x)).join('');
      if (reset) $('results').innerHTML = rows ? `<div class="group" id="list">${rows}</div>` : `<div class="empty"><div class="big">${I.search}</div><b>Nada encontrado</b>Tente outra palavra ou tire alguns filtros.</div>`;
      else $('list').insertAdjacentHTML('beforeend', rows);
      const next = j.pagination && j.pagination.next_page;
      $('more').innerHTML = next ? '<div class="group"><button class="more-btn" id="moreBtn">Carregar mais</button></div>' : '';
      if (next) $('moreBtn').onclick = (ev) => { ev.target.disabled = true; ev.target.textContent = 'Carregando…'; page = next; load(false); };
    } catch (e) {
      if (my === reqId) $('results').innerHTML = errorHTML(e);
    }
  }

  function openFilters() {
    const anoAtual = new Date().getFullYear();
    const anos = []; for (let a = anoAtual; a >= 2005; a--) anos.push(a);
    const tipoIds = Object.keys(tipos).map(Number).sort((a, b) => titleCase(tipos[a].nome).localeCompare(titleCase(tipos[b].nome), 'pt-BR'));
    const ver = autores.filter((a) => a.tipo === 2).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const org = autores.filter((a) => a.tipo !== 2).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    const opt = (v, l, cur) => `<option value="${v}" ${String(v) === cur ? 'selected' : ''}>${esc(l)}</option>`;
    const sh = openSheet(`<div class="sheet-head"><button id="fClear">Limpar</button><b>Filtros</b><button class="strong" id="fOk">OK</button></div>
      <div class="group">
        <label class="row"><span class="grow">Tipo</span><select id="fTipo">${opt('', 'Todos', state.tipo)}${tipoIds.map((id) => opt(id, titleCase(tipos[id].nome), state.tipo)).join('')}</select></label>
        <label class="row"><span class="grow">Ano</span><select id="fAno">${opt('', 'Todos', state.ano)}${anos.map((a) => opt(a, a, state.ano)).join('')}</select></label>
        <label class="row"><span class="grow">Autor</span><select id="fAutor">${opt('', 'Todos', state.autor)}
          <optgroup label="Vereadores">${ver.map((a) => opt(a.id, nice(a.nome), state.autor)).join('')}</optgroup>
          <optgroup label="Órgãos e comissões">${org.map((a) => opt(a.id, cut(nice(a.nome), 40), state.autor)).join('')}</optgroup></select></label>
      </div><div class="foot-note" style="margin-top:-12px">Os filtros se somam à busca e às etiquetas.</div>`);
    sh.querySelector('#fClear').onclick = () => { sh.querySelector('#fTipo').value = ''; sh.querySelector('#fAno').value = ''; sh.querySelector('#fAutor').value = ''; };
    sh.querySelector('#fOk').onclick = () => {
      state.tipo = sh.querySelector('#fTipo').value; state.ano = sh.querySelector('#fAno').value; state.autor = sh.querySelector('#fAutor').value;
      closeSheet(); drawChips(); sync(); load(true);
    };
  }

  let t;
  $q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = $q.value; sync(); load(true); }, 450); });
  $q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); state.q = $q.value; sync(); load(true); $q.blur(); } });
  drawChips();
  load(true);
}

/* ---- etapas da matéria ---- */
const STEP_TYPES = new Set([1, 7, 8, 9, 26, 13, 24, 3, 5, 2]);
function etapas(mt, statusTxt, unidadeTxt) {
  const tipo = mt.tipo;
  let steps;
  if ([1, 7, 8].includes(tipo)) steps = ['Apresentada', 'Comissões', 'Plenário', 'Sanção', 'Lei'];
  else if ([9, 26, 13, 24].includes(tipo)) steps = ['Apresentada', 'Comissões', 'Plenário', 'Concluída'];
  else if (tipo === 3) steps = ['Recebido', 'Comissões', 'Plenário', 'Concluído'];
  else steps = ['Apresentada', 'Plenário', 'Concluída'];
  const last = steps.length - 1;
  const at = (name) => { const i = steps.indexOf(name); return i >= 0 ? i : null; };
  const s = String(statusTxt || '').toLowerCase();
  const u = String(unidadeTxt || '').toLowerCase();
  let idx = 0;
  let outcome = null;
  let neg = null;

  if (!s && !u) return { steps, idx: 0, outcome };
  if (/arquivad|rejeitad|prejudicad|retirada pelo autor/.test(s)) {
    idx = last; outcome = 'bad';
    neg = /rejeitad/.test(s) ? 'Rejeitada' : /prejudicad/.test(s) ? 'Prejudicada' : /retirada/.test(s) ? 'Retirada' : 'Arquivada';
  } else if (/transformada em lei|promulgad|veto .*mantido|lei com veto/.test(s)) {
    idx = last; outcome = 'good';
  } else if (/sanç|autógrafo|autografo|executivo|mensagem sobre o veto|silêncio/.test(s)) {
    idx = at('Sanção') ?? last; if (idx === last) outcome = 'good';
  } else if (/aprovad/.test(s)) {
    if (/1º turno|1° turno/.test(s)) idx = at('Plenário') ?? 1;
    else if (at('Sanção') !== null) idx = at('Sanção');
    else { idx = last; outcome = 'good'; }
  } else if (/comiss|parecer|distribu|reunião conjunta/.test(s)) {
    idx = at('Comissões') ?? at('Plenário') ?? 1;
  } else if (/plenário|plenario|ordem do dia|votaç|leitura|lida|pauta|adiad|apresentada em/.test(s)) {
    idx = at('Plenário') ?? 1;
  } else if (/comiss/.test(u)) idx = at('Comissões') ?? 1;
  else if (/plenário|plenario/.test(u)) idx = at('Plenário') ?? 1;
  else if (/prefeitura/.test(u)) idx = at('Sanção') ?? last;
  else idx = 0;

  if (neg) steps = [...steps.slice(0, last), neg];
  return { steps, idx, outcome };
}
function stepperHTML(e, statusTxt, dateTxt) {
  const balls = e.steps.map((label, i) => {
    let cls = '';
    let icon = '';
    if (i < e.idx) { cls = 'done'; icon = I.check; }
    else if (i === e.idx) {
      if (e.outcome === 'bad') { cls = 'bad'; icon = I.x; }
      else if (e.outcome === 'good') { cls = 'good'; icon = I.check; }
      else cls = 'cur';
    }
    return `<div class="step ${cls}"><div class="ball">${icon}</div><small>${esc(label)}</small></div>`;
  }).join('');
  const atual = e.steps[e.idx];
  return `<div class="stepper"><div class="head"><b>${esc(atual)}</b><span>${esc(statusTxt ? cut(nice(statusTxt), 60) : 'Sem tramitação registrada')}${dateTxt ? '<br>' + esc(dateTxt) : ''}</span></div>
    <div class="steps">${balls}</div></div>`;
}

async function viewMateria(m, token) {
  const id = m[1];
  setHeader('Matéria', { back: true });
  render(skeletonHTML(null, null, 4), token, false);
  const [mt, aut, tram, status, unidades, autores] = await Promise.all([
    api(`materia/materialegislativa/${id}/`),
    api('materia/autoria/', { materia: id, page_size: 50 }).catch(() => ({ results: [] })),
    api('materia/tramitacao/', { materia: id, page_size: 100 }).catch(() => ({ results: [] })),
    lookups.status().catch(() => ({})),
    lookups.unidades().catch(() => ({})),
    lookups.autores().catch(() => []),
    lookups.tipos().catch(() => ({})),
  ]);
  if (token !== navToken) return;
  const docs = await api('materia/documentoacessorio/', { materia: id, page_size: 50 }).catch(() => ({ results: [] }));
  if (token !== navToken) return;

  const info = tagInfo(mt);
  setHeader(info.label, { back: true });
  const trams = sortTram(tram.results || []);
  const ult = trams[0];
  const statusTxt = ult ? status[ult.status] || '' : '';
  const ondeTxt = ult ? unidades[ult.unidade_tramitacao_destino] || '' : '';
  const ementa = sentence(mt.ementa);

  const favInfo = () => ({ tag: info, ementa: cut(ementa, 200), seen: ult ? ult.id : null, last: ult ? ult.id : null, lastStatus: statusTxt, lastDate: ult ? ult.data_tramitacao : '' });
  if (Favs.has(mt.id)) Favs.update(mt.id, favInfo());
  const fav = Favs.has(mt.id);

  const autoresList = (aut.results || []).map((a) => autores.find((x) => x.id === a.autor)).filter(Boolean);
  const autorRows = autoresList.length ? autoresList.map((au, i) => au.tipo === 2
    ? `<a class="row" href="#/vereador/${au.obj}"><div class="grow"><div class="sub" style="margin:0 0 2px">${i ? 'Coautoria' : 'Autoria'}</div><div class="title">${esc(nice(au.nome))}</div></div>${I.chev}</a>`
    : `<div class="row"><div class="grow"><div class="sub" style="margin:0 0 2px">${i ? 'Coautoria' : 'Autoria'}</div><div class="title">${esc(nice(au.nome))}</div></div></div>`).join('')
    : '<div class="row"><div class="grow"><div class="sub" style="margin:0 0 2px">Autoria</div><div class="title">Não informada</div></div></div>';

  const infoRow = (label, value) => `<div class="row"><div class="grow"><div class="sub" style="margin:0 0 2px">${label}</div><div class="title">${value}</div></div></div>`;

  const acts = [];
  if (mt.texto_original) acts.push(`<a class="action" href="${esc(https(mt.texto_original))}" target="_blank" rel="noopener">${I.doc}Texto</a>`);
  acts.push(`<button class="action ${fav ? 'on' : ''}" id="favBtn">${fav ? I.starFill : I.star}<span>${fav ? 'Seguindo' : 'Seguir'}</span></button>`);
  acts.push(`<button class="action" id="shareM">${I.share}Enviar</button>`);
  acts.push(`<a class="action" href="${SAPL}/materia/${mt.id}" target="_blank" rel="noopener">${I.compass}SAPL</a>`);

  const docsHTML = (docs.results || []).filter((d) => d.arquivo).map((d) =>
    `<a class="row" href="${esc(https(d.arquivo))}" target="_blank" rel="noopener"><span style="color:var(--tint);width:22px">${I.doc}</span>
      <div class="grow"><div class="title">${esc(cut(nice(d.nome || 'Documento'), 60))}</div>${d.data ? `<div class="sub">${esc(fmtDate(d.data))}</div>` : ''}</div>${I.chev}</a>`).join('');

  const SHOW = 6;
  const tramItem = (t) => `<li><div class="what">${esc(nice(status[t.status] || 'Tramitação'))}</div>
    <div class="meta">${esc(relDate(t.data_tramitacao))}${relDate(t.data_tramitacao) !== fmtDate(t.data_tramitacao) ? ' · ' + esc(fmtDate(t.data_tramitacao)) : ''}${unidades[t.unidade_tramitacao_destino] ? ' · ' + esc(shortUnidade(unidades[t.unidade_tramitacao_destino])) : ''}${t.urgente ? ' · <span style="color:var(--red)">urgente</span>' : ''}</div>
    ${t.texto ? `<div class="txt">${esc(cut(t.texto, 300))}</div>` : ''}</li>`;

  render(`${largeHTML(info.label, info.nome)}
    ${ementa ? `<p class="lede">${esc(ementa)}</p>` : ''}
    ${STEP_TYPES.has(mt.tipo) ? stepperHTML(etapas(mt, statusTxt, ondeTxt), statusTxt, ult ? relDate(ult.data_tramitacao) : '') : ''}
    <div class="actions">${acts.join('')}</div>
    <div class="group">
      ${autorRows}
      ${infoRow('Apresentada em', esc(fmtDate(mt.data_apresentacao)) || '—')}
      ${ondeTxt ? infoRow('Onde está agora', esc(shortUnidade(ondeTxt))) : ''}
      ${mt.observacao ? infoRow('Observação', esc(mt.observacao)) : ''}
    </div>
    ${docsHTML ? `<div class="sh">Documentos</div><div class="group">${docsHTML}</div>` : ''}
    <div class="sh">Tramitação${trams.length ? ' · ' + trams.length : ''}</div>
    <div class="group">${trams.length ? `<ul class="timeline" id="tl">${trams.slice(0, SHOW).map(tramItem).join('')}</ul>
      ${trams.length > SHOW ? `<button class="more-btn" id="tlMore">Mostrar as ${trams.length} etapas</button>` : ''}`
      : '<div class="empty" style="padding:22px">Nenhuma tramitação registrada.</div>'}</div>
    ${footerHTML}`, token);

  const tlMore = $('tlMore');
  if (tlMore) tlMore.onclick = () => { $('tl').innerHTML = trams.map(tramItem).join(''); tlMore.remove(); };

  $('favBtn').onclick = (ev) => {
    const on = Favs.toggle(mt.id, favInfo());
    const b = ev.currentTarget;
    b.classList.toggle('on', on);
    b.innerHTML = `${on ? I.starFill : I.star}<span>${on ? 'Seguindo' : 'Seguir'}</span>`;
    toast(on ? 'Você está seguindo esta matéria' : 'Deixou de seguir');
  };
  $('shareM').onclick = () => shareLink({ title: `${info.label} · Câmara de Alta Floresta D'Oeste`, text: cut(ementa, 180), hash: `#/materia/${mt.id}` });
}

/* =========================================================
   VEREADORES
   ========================================================= */

function avatarHTML(v, cls = '') {
  return v.foto
    ? `<img class="avatar ${cls}" src="${esc(v.foto)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`
    : `<div class="avatar ${cls}"></div>`;
}

async function viewVereadores(m, token) {
  setHeader('Vereadores');
  render(skeletonHTML('Vereadores', KICKER, 8), token, false);
  const v = await lookups.vereadores();
  render(`${largeHTML('Vereadores', `${v.legislatura}ª Legislatura · ${String(v.inicio).slice(0, 4)}–${String(v.fim).slice(0, 4)}`)}
    <div class="group inset-64">${v.lista.map((p) => `<a class="row" href="#/vereador/${p.pid}">${avatarHTML(p)}
      <div class="grow"><div class="title">${esc(p.nome)}</div><div class="sub">${p.titular ? 'Vereador(a)' : 'Suplente'}</div></div>${I.chev}</a>`).join('')}</div>
    ${footerHTML}`, token);
}

async function viewVereador(m, token) {
  const pid = Number(m[1]);
  setHeader('Vereador', { back: true });
  render(skeletonHTML(null, null, 4), token, false);
  const [v, autores] = await Promise.all([lookups.vereadores().catch(() => ({ lista: [] })), lookups.autores(), lookups.tipos().catch(() => ({}))]);
  let p = v.lista.find((x) => x.pid === pid);
  if (!p) {
    const d = await api(`parlamentares/parlamentar/${pid}/`);
    const a = autores.find((x) => x.tipo === 2 && x.obj === pid);
    p = { pid, nome: d.nome_parlamentar || d.nome_completo, completo: d.nome_completo, foto: https(d.fotografia), autorId: a ? a.id : null, titular: true };
  }
  if (token !== navToken) return;
  setHeader(p.nome, { back: true });
  const head = `<div class="profile">${avatarHTML(p, 'xl')}<h1 class="large-title">${esc(p.nome)}</h1>
    ${p.completo && p.completo !== p.nome ? `<p>${esc(p.completo)}</p>` : ''}</div>`;

  if (!p.autorId) {
    render(`${head}<div class="empty">Esse parlamentar ainda não está cadastrado como autor de matérias no sistema.</div>${footerHTML}`, token);
    return;
  }
  const ano = new Date().getFullYear();
  const count = (extra) => api('materia/materialegislativa/', { autores: p.autorId, page_size: 1, ...extra }).then(total).catch(() => null);
  const [tot, doAno, ind, req, rec] = await Promise.all([
    count({}), count({ ano }), count({ tipo: 5 }), count({ tipo: 2 }),
    api('materia/materialegislativa/', { autores: p.autorId, o: '-data_apresentacao', page_size: 8 }).catch(() => ({ results: [] })),
  ]);
  if (token !== navToken) return;
  const tile = (n, label, color, icon, hash) => `<a class="tile" style="--c:var(${color})" href="${hash}">
    <div class="ic">${icon}</div><b>${n === null ? '—' : n.toLocaleString('pt-BR')}</b><span>${label}</span></a>`;

  render(`${head}
    <div class="tiles">
      ${tile(tot, 'Matérias no total', '--tint', I.doc, `#/materias?autor=${p.autorId}`)}
      ${tile(doAno, `Em ${ano}`, '--orange', I.calendar, `#/materias?autor=${p.autorId}&ano=${ano}`)}
      ${tile(ind, 'Indicações', '--green', I.megaphone, `#/materias?autor=${p.autorId}&tipo=5`)}
      ${tile(req, 'Requerimentos', '--blue', I.bubble, `#/materias?autor=${p.autorId}&tipo=2`)}
    </div>
    <div class="section"><h2>Mais recentes</h2>${tot > 8 ? `<a href="#/materias?autor=${p.autorId}">Ver tudo</a>` : ''}</div>
    <div class="group">${(rec.results || []).map((x) => matRow(x)).join('') || '<div class="empty">Nenhuma matéria encontrada.</div>'}</div>
    ${footerHTML}`, token);
}

/* =========================================================
   SALVOS
   ========================================================= */

function favRow(id, x) {
  const novo = Favs.hasNews(id);
  const tag = x.tag ? tagHTML(x.tag) : `<span class="tag">${esc(cut(x.titulo || 'Matéria', 30))}</span>`;
  return `<a class="row mat" href="#/materia/${id}">
    <span class="unread ${novo ? '' : 'off'}"></span>
    <div class="grow">
      <div class="mat-top">${tag}<span class="when">${esc(relDate(x.lastDate))}</span></div>
      ${x.lastStatus ? `<div class="title" style="font-size:15.5px;font-weight:600;margin-bottom:2px">${esc(cut(nice(x.lastStatus), 70))}</div>` : ''}
      ${x.ementa ? `<div class="mat-text clamp2" style="color:var(--label-2)">${esc(x.ementa)}</div>` : ''}
    </div>${I.chev}</a>`;
}
function salvosListHTML() {
  const f = Favs.all();
  const ids = Object.keys(f).sort((a, b) => (Favs.hasNews(b) - Favs.hasNews(a)) || (f[b].lastDate || '').localeCompare(f[a].lastDate || ''));
  if (!ids.length) {
    return `<div class="empty"><div class="big">${I.star}</div><b>Nenhuma matéria seguida</b>
      Abra uma matéria e toque em <b style="display:inline;font-size:16px;color:var(--tint)">Seguir</b>.
      Quando ela andar, aparece aqui com um ponto azul.</div>`;
  }
  const news = ids.filter((id) => Favs.hasNews(id)).length;
  return `<div class="count">${news ? `${news} com novidade` : `${ids.length} seguida${ids.length > 1 ? 's' : ''}`}</div>
    <div class="group">${ids.map((id) => favRow(id, f[id])).join('')}</div>
    <div class="foot-note" style="margin-top:-12px">Abra a matéria para ver o que mudou. O ponto azul some depois disso.</div>`;
}
async function viewSalvos(m, token) {
  setHeader('Salvos');
  render(`${largeHTML('Salvos', 'Matérias que você segue')}<div id="favs">${salvosListHTML()}</div>${footerHTML}`, token);
  await refreshFavs().catch(() => {});
  if (token !== navToken) return;
  const el = $('favs');
  if (el) el.innerHTML = salvosListHTML();
}

/* =========================================================
   Roteador
   ========================================================= */

const routes = [
  [/^#\/hoje$/, viewHoje, 'hoje'],
  [/^#\/sessoes$/, viewSessoes, 'sessoes'],
  [/^#\/sessao\/(\d+)$/, viewSessao, 'sessoes'],
  [/^#\/materias(?:\?(.*))?$/, viewMaterias, 'materias'],
  [/^#\/materia\/(\d+)$/, viewMateria, 'materias'],
  [/^#\/vereadores$/, viewVereadores, 'vereadores'],
  [/^#\/vereador\/(\d+)$/, viewVereador, 'vereadores'],
  [/^#\/salvos$/, viewSalvos, 'salvos'],
];

async function router(keepScroll) {
  const h = location.hash || '#/hoje';
  const token = ++navToken;
  for (const [re, fn, tab] of routes) {
    const m = h.match(re);
    if (!m) continue;
    // Sessão/matéria/vereador abertos a partir de outra aba ficam nela.
    const isDetail = /^#\/(sessao|materia|vereador)\//.test(h);
    setTab(isDetail && stack.length > 1 ? currentTab : tab);
    if (!keepScroll) window.scrollTo(0, 0);
    try { await fn(m, token); } catch (e) { render(errorHTML(e), token); }
    return;
  }
  location.replace('#/hoje');
}

window.addEventListener('hashchange', () => {
  const h = location.hash;
  if (stack.length > 1 && stack[stack.length - 2] === h) stack.pop();
  else if (Object.values(TAB_ROOT).includes(h.split('?')[0])) { stack.length = 0; stack.push(h); }
  else stack.push(h);
  router();
});

/* =========================================================
   Internet, offline e início
   ========================================================= */

function netStatus() { $('offline').hidden = navigator.onLine; }
window.addEventListener('online', netStatus);
window.addEventListener('offline', netStatus);
window.addEventListener('resize', () => requestAnimationFrame(measureTitle));

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

netStatus();
updateDot();
stack.push(location.hash || '#/hoje');
lookups.tipos().catch(() => {});
router();
refreshFavs().then(updateDot).catch(() => {});
