'use strict';

/* =========================================================
   Câmara AFO — app de bolso da Câmara Municipal de
   Alta Floresta D'Oeste. Lê os dados públicos do SAPL.
   ========================================================= */

const SAPL = 'https://sapl.altaflorestadoeste.ro.leg.br';
const API = SAPL + '/api/';

const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $kicker = document.getElementById('kicker');
const $back = document.getElementById('back');
const KICKER = "Câmara de Alta Floresta D'Oeste";

/* ---------- utilitários ---------- */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const https = (u) => (u ? String(u).replace(/^http:\/\//, 'https://') : '');

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}
function fmtDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-');
  return `${dd}/${m}/${y}`;
}
function fmtLongDate(d) {
  if (!d) return '';
  const [y, m, dd] = String(d).slice(0, 10).split('-').map(Number);
  const s = new Date(y, m - 1, dd).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'ao', 'em', 'por', 'para', 'com', 'nº', 'à', 'na', 'no']);
function isShouting(s) {
  const letters = String(s || '').replace(/[^A-Za-zÀ-ÖØ-öø-ÿ]/g, '');
  if (!letters) return false;
  const upper = letters.replace(/[^A-ZÀ-ÖØ-Þ]/g, '').length;
  return upper / letters.length > 0.7;
}
function titleCase(s) {
  return String(s || '').toLowerCase().split(/\s+/).map((w, i) => {
    if (i > 0 && SMALL.has(w)) return w;
    if (/^[ivx]+$/.test(w) && w.length <= 4) return w.toUpperCase();
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}
function nice(s) { return isShouting(s) ? titleCase(s) : String(s || ''); }
function sentence(s) {
  s = String(s || '').trim();
  if (!s || !isShouting(s)) return s;
  s = s.toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function prettyMateria(str) {
  const m = String(str || '').match(/^(.*?)\s+nº\s+(\d+)\s+de\s+(\d{4})$/i);
  if (m) return `${titleCase(m[1])} nº ${m[2]}/${m[3]}`;
  return nice(str);
}
function shortUnidade(s) {
  // "CPOF - COMISSÃO PERMANENTE DE ..." -> parte mais descritiva
  const parts = String(s || '').split(' - ');
  const best = parts.reduce((a, b) => (b.length > a.length ? b : a), '');
  return nice(best);
}
function cut(s, n) { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; }

const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- acesso à API do SAPL ---------- */

async function api(path, params = {}) {
  const url = new URL(path.startsWith('http') ? path : API + path);
  for (const [k, v] of Object.entries(params)) {
    if (v !== '' && v !== null && v !== undefined) url.searchParams.set(k, v);
  }
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

// Guarda tabelas que mudam pouco (tipos, status, autores...) no aparelho.
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
    Object.fromEntries((await allPages('materia/tipomaterialegislativa/')).map((t) => [t.id, { sigla: t.sigla, nome: t.descricao }]))),
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

/* ---------- favoritos ("Salvos") ---------- */

const Favs = {
  all() { return LS.get('favs') || {}; },
  has(id) { return Boolean(this.all()[id]); },
  save(obj) { LS.set('favs', obj); updateDot(); },
  toggle(id, info) {
    const f = this.all();
    if (f[id]) delete f[id];
    else f[id] = { ...info, added: Date.now() };
    this.save(f);
    return Boolean(f[id]);
  },
  update(id, patch) {
    const f = this.all();
    if (!f[id]) return;
    f[id] = { ...f[id], ...patch };
    this.save(f);
  },
  hasNews() { return Object.values(this.all()).some((x) => x.last && x.seen !== x.last); },
};
function updateDot() { document.getElementById('dot').hidden = !Favs.hasNews(); }

function sortTram(list) {
  return [...list].sort((a, b) =>
    (b.data_tramitacao || '').localeCompare(a.data_tramitacao || '') || (b.id - a.id));
}
async function latestTram(materiaId) {
  const j = await api('materia/tramitacao/', { materia: materiaId, page_size: 50 });
  return sortTram(j.results || [])[0] || null;
}

async function refreshFavs() {
  const f = Favs.all();
  const ids = Object.keys(f);
  if (!ids.length) return;
  const status = await lookups.status().catch(() => ({}));
  await Promise.allSettled(ids.map(async (id) => {
    const t = await latestTram(id);
    if (!t) return;
    const patch = { last: t.id, lastStatus: status[t.status] || '', lastDate: t.data_tramitacao };
    if (f[id].seen === undefined) patch.seen = t.id; // primeira checagem não conta como novidade
    Favs.update(id, patch);
  }));
}

/* ---------- interface ---------- */

let navToken = 0;
let inAppNav = 0;
let currentTab = 'sessoes';

function setHeader(title, kicker = KICKER, showBack = false) {
  $title.textContent = title;
  $kicker.textContent = kicker;
  $back.hidden = !showBack;
  document.title = title === 'Sessões' ? 'Câmara AFO' : `${title} · Câmara AFO`;
}
function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tab));
}
function render(html, token) {
  if (token !== undefined && token !== navToken) return false;
  $view.innerHTML = html;
  return true;
}
const loadingHTML = (msg = 'Carregando…') => `<div class="loading"><div class="spinner"></div>${esc(msg)}</div>`;
function errorHTML(e) {
  const off = !navigator.onLine;
  return `<div class="error">${off ? 'Você está sem internet e esses dados ainda não foram salvos no aparelho.' : 'Não consegui falar com o SAPL da Câmara agora.'}
    <div style="color:var(--muted);font-size:13px;margin-top:6px">${esc(e && e.message ? e.message : '')}</div>
    <div style="margin-top:16px"><button class="btn" onclick="router()">Tentar de novo</button></div></div>`;
}
const footHTML = `<div class="foot">App não oficial · dados públicos do
  <a href="${SAPL}" target="_blank" rel="noopener">SAPL da Câmara Municipal de Alta Floresta D'Oeste</a></div>`;

$back.addEventListener('click', () => {
  if (inAppNav > 1) history.back();
  else location.hash = '#/' + currentTab;
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}
function installHTML() {
  if (isStandalone() || LS.get('hideInstall')) return '';
  return `<div class="install" id="install">Instale no iPhone: toque em <b>Compartilhar</b> e depois em
    <b>Adicionar à Tela de Início</b>.<br><button onclick="LS.set('hideInstall',1);this.parentNode.remove()">Ocultar</button></div>`;
}

/* ---------- Sessões ---------- */

function sessaoNome(s) {
  const m = String(s.__str__ || '').match(/^(\d+ª)\s+(\S+)/);
  return m ? `${m[1]} Sessão ${m[2]}` : nice(s.__str__);
}
function sessaoStatus(s) {
  const hoje = todayISO();
  if (s.finalizada) return '<span class="badge ok">Realizada</span>';
  if (s.data_inicio > hoje) return '<span class="badge">Agendada</span>';
  if (s.data_inicio === hoje) return '<span class="badge warn">Hoje</span>';
  return '<span class="badge muted">Iniciada</span>';
}
function sessaoLinks(s) {
  const L = [];
  if (s.upload_pauta) L.push(`<a class="chip" href="${esc(https(s.upload_pauta))}" target="_blank" rel="noopener">📋 Pauta</a>`);
  if (s.upload_ata) L.push(`<a class="chip" href="${esc(https(s.upload_ata))}" target="_blank" rel="noopener">📝 Ata</a>`);
  if (s.url_video) L.push(`<a class="chip" href="${esc(s.url_video)}" target="_blank" rel="noopener">▶️ Vídeo</a>`);
  if (s.upload_anexo) L.push(`<a class="chip" href="${esc(https(s.upload_anexo))}" target="_blank" rel="noopener">🖼️ Arte</a>`);
  return L.length ? `<div class="links">${L.join('')}</div>` : '';
}
function sessaoCard(s) {
  const hora = s.hora_inicio ? ` · ${esc(s.hora_inicio)}${s.hora_fim ? '–' + esc(s.hora_fim) : ''}` : '';
  return `<div class="card">
    <a href="#/sessao/${s.id}" style="display:block;color:inherit">
      <h3>${esc(sessaoNome(s))}</h3>
      <div class="meta">${sessaoStatus(s)}<span>${esc(fmtLongDate(s.data_inicio))}${hora}</span></div>
    </a>${sessaoLinks(s)}</div>`;
}

async function viewSessoes(m, token) {
  setHeader('Sessões');
  render(loadingHTML(), token);
  let page = 1;
  const j = await api('sessao/sessaoplenaria/', { o: '-data_inicio', page_size: 15, page });
  if (!render(`${installHTML()}<div class="section-title">Últimas sessões</div>
      <div id="list">${j.results.map(sessaoCard).join('')}</div>
      <div id="more"></div>${footHTML}`, token)) return;

  const more = document.getElementById('more');
  const setMore = (next) => {
    more.innerHTML = next ? '<button class="btn" id="moreBtn">Carregar mais sessões</button>' : '';
    if (!next) return;
    document.getElementById('moreBtn').onclick = async (ev) => {
      ev.target.disabled = true; ev.target.textContent = 'Carregando…';
      page = next;
      try {
        const k = await api('sessao/sessaoplenaria/', { o: '-data_inicio', page_size: 15, page });
        document.getElementById('list').insertAdjacentHTML('beforeend', k.results.map(sessaoCard).join(''));
        setMore(k.pagination && k.pagination.next_page);
      } catch (e) { ev.target.disabled = false; ev.target.textContent = 'Erro. Tocar para tentar de novo'; }
    };
  };
  setMore(j.pagination && j.pagination.next_page);
}

function resultadoBadge(r) {
  if (!r) return '';
  const cls = /aprovad/i.test(r) ? 'ok' : /rejeit|retirad|adiad/i.test(r) ? 'warn' : 'muted';
  return `<span class="badge ${cls}">${esc(cut(nice(r), 40))}</span>`;
}
function itemPautaCard(it, mat) {
  const nome = mat ? prettyMateria(mat.__str__) : prettyMateria(String(it.__str__ || '').replace(/^.*?:\s*\d+\s*-\s*/, '').replace(/\s+em\s+\d+ª.*$/, ''));
  return `<a class="card" href="#/materia/${it.materia}">
    <h3>${esc(it.numero_ordem ? it.numero_ordem + '. ' : '')}${esc(nome)}</h3>
    ${mat && mat.ementa ? `<p>${esc(cut(sentence(mat.ementa), 220))}</p>` : ''}
    <div class="meta">${resultadoBadge(it.resultado)}${it.observacao ? `<span>${esc(cut(it.observacao, 80))}</span>` : ''}</div></a>`;
}

async function viewSessao(m, token) {
  const id = m[1];
  setHeader('Sessão', KICKER, true);
  render(loadingHTML(), token);
  const [s, exp, ord] = await Promise.all([
    api(`sessao/sessaoplenaria/${id}/`),
    api('sessao/expedientemateria/', { sessao_plenaria: id, page_size: 100 }).catch(() => ({ results: [] })),
    api('sessao/ordemdia/', { sessao_plenaria: id, page_size: 100 }).catch(() => ({ results: [] })),
  ]);
  if (token !== navToken) return;
  setHeader(sessaoNome(s), fmtLongDate(s.data_inicio), true);

  const items = [...(exp.results || []), ...(ord.results || [])];
  const ids = [...new Set(items.map((i) => i.materia))];
  const mats = {};
  await Promise.allSettled(ids.map(async (mid) => { mats[mid] = await api(`materia/materialegislativa/${mid}/`); }));

  const byOrder = (a, b) => (a.numero_ordem || 0) - (b.numero_ordem || 0);
  const hora = s.hora_inicio ? `${s.hora_inicio}${s.hora_fim ? ' às ' + s.hora_fim : ''}` : '';
  let html = `<div class="card"><h3>${esc(nice(s.__str__))}</h3>
    <div class="meta">${sessaoStatus(s)}<span>${esc(fmtDate(s.data_inicio))}${hora ? ' · ' + esc(hora) : ''}</span></div>
    ${sessaoLinks(s)}</div>`;

  if ((exp.results || []).length) {
    html += `<div class="section-title">Expediente · ${exp.results.length}</div>` +
      [...exp.results].sort(byOrder).map((it) => itemPautaCard(it, mats[it.materia])).join('');
  }
  if ((ord.results || []).length) {
    html += `<div class="section-title">Ordem do Dia · ${ord.results.length}</div>` +
      [...ord.results].sort(byOrder).map((it) => itemPautaCard(it, mats[it.materia])).join('');
  }
  if (!items.length) {
    html += `<div class="empty">As matérias desta sessão ainda não foram lançadas no sistema.${s.upload_pauta ? '<br>Confira a pauta em PDF acima.' : ''}</div>`;
  }
  render(html + footHTML, token);
}

/* ---------- Matérias ---------- */

const TIPOS_PRINCIPAIS = [1, 7, 5, 2, 8, 9, 3, 26, 24, 13];

async function viewMaterias(m, token) {
  setHeader('Matérias');
  const q = new URLSearchParams(m[1] || '');
  const state = { q: q.get('q') || '', tipo: q.get('tipo') || '', ano: q.get('ano') || '', autor: q.get('autor') || '' };
  render(loadingHTML(), token);

  const [tipos, autores] = await Promise.all([lookups.tipos(), lookups.autores()]);
  if (token !== navToken) return;

  const anoAtual = new Date().getFullYear();
  const anos = [];
  for (let a = anoAtual; a >= 2005; a--) anos.push(a);

  const tipoOpts = (ids) => ids.filter((id) => tipos[id]).map((id) =>
    `<option value="${id}" ${String(id) === state.tipo ? 'selected' : ''}>${esc(nice(tipos[id].nome))}</option>`).join('');
  const outros = Object.keys(tipos).map(Number).filter((id) => !TIPOS_PRINCIPAIS.includes(id))
    .sort((a, b) => tipos[a].nome.localeCompare(tipos[b].nome, 'pt-BR'));

  const vereadoresAut = autores.filter((a) => a.tipo === 2).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const outrosAut = autores.filter((a) => a.tipo !== 2).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  const autOpt = (a) => `<option value="${a.id}" ${String(a.id) === state.autor ? 'selected' : ''}>${esc(cut(nice(a.nome), 48))}</option>`;

  if (!render(`
    <form class="search" id="f" onsubmit="return false">
      <input id="q" type="search" placeholder="Buscar no assunto, ou nº (ex.: 113/2026)" value="${esc(state.q)}" enterkeyhint="search" autocomplete="off">
    </form>
    <div class="filters">
      <select id="tipo" class="full" aria-label="Tipo">
        <option value="">Todos os tipos</option>
        <optgroup label="Principais">${tipoOpts(TIPOS_PRINCIPAIS)}</optgroup>
        <optgroup label="Outros">${tipoOpts(outros)}</optgroup>
      </select>
      <select id="ano" aria-label="Ano"><option value="">Todos os anos</option>
        ${anos.map((a) => `<option ${String(a) === state.ano ? 'selected' : ''}>${a}</option>`).join('')}</select>
      <select id="autor" aria-label="Autor"><option value="">Todos os autores</option>
        <optgroup label="Vereadores">${vereadoresAut.map(autOpt).join('')}</optgroup>
        <optgroup label="Órgãos e comissões">${outrosAut.map(autOpt).join('')}</optgroup></select>
    </div>
    <div class="count" id="count"></div>
    <div id="list"></div>
    <div id="more"></div>${footHTML}`, token)) return;

  const $q = document.getElementById('q');
  const $list = document.getElementById('list');
  const $count = document.getElementById('count');
  const $more = document.getElementById('more');
  let page = 1;
  let reqId = 0;

  function params() {
    const p = { o: '-data_apresentacao', page_size: 20, page, tipo: state.tipo, ano: state.ano, autores: state.autor };
    const txt = state.q.trim();
    const num = txt.match(/^(\d+)(?:\s*[/-]\s*(\d{4}))?$/);
    if (num) { p.numero = num[1]; if (num[2]) p.ano = num[2]; }
    else if (txt) p.ementa__icontains = txt;
    return p;
  }
  function syncHash() {
    const p = new URLSearchParams();
    for (const k of ['q', 'tipo', 'ano', 'autor']) if (state[k]) p.set(k, state[k]);
    const h = '#/materias' + (p.toString() ? '?' + p.toString() : '');
    history.replaceState(null, '', h);
  }
  async function load(reset) {
    const my = ++reqId;
    if (reset) { page = 1; $list.innerHTML = loadingHTML('Buscando…'); $count.textContent = ''; $more.innerHTML = ''; }
    try {
      const j = await api('materia/materialegislativa/', params());
      if (my !== reqId) return;
      const total = j.pagination ? j.pagination.total_entries : j.results.length;
      $count.textContent = total === 1 ? '1 matéria encontrada' : `${total.toLocaleString('pt-BR')} matérias encontradas`;
      const html = j.results.map(materiaCard).join('');
      if (reset) $list.innerHTML = html || '<div class="empty">Nada encontrado com esses filtros.</div>';
      else $list.insertAdjacentHTML('beforeend', html);
      const next = j.pagination && j.pagination.next_page;
      $more.innerHTML = next ? '<button class="btn" id="moreBtn">Carregar mais</button>' : '';
      if (next) document.getElementById('moreBtn').onclick = (ev) => { ev.target.disabled = true; ev.target.textContent = 'Carregando…'; page = next; load(false); };
    } catch (e) {
      if (my !== reqId) return;
      $list.innerHTML = errorHTML(e);
    }
  }

  let t;
  $q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.q = $q.value; syncHash(); load(true); }, 450); });
  $q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(t); state.q = $q.value; syncHash(); load(true); $q.blur(); } });
  for (const k of ['tipo', 'ano', 'autor']) {
    document.getElementById(k).addEventListener('change', (e) => { state[k] = e.target.value; syncHash(); load(true); });
  }
  load(true);
}

function materiaCard(mt) {
  return `<a class="card" href="#/materia/${mt.id}">
    <h3>${esc(prettyMateria(mt.__str__))}</h3>
    ${mt.ementa ? `<p>${esc(cut(sentence(mt.ementa), 220))}</p>` : ''}
    <div class="meta"><span>Apresentada em ${esc(fmtDate(mt.data_apresentacao))}</span>${Favs.has(mt.id) ? '<span>⭐</span>' : ''}</div></a>`;
}

async function viewMateria(m, token) {
  const id = m[1];
  setHeader('Matéria', KICKER, true);
  render(loadingHTML(), token);
  const [mt, aut, tram, status, unidades, autores] = await Promise.all([
    api(`materia/materialegislativa/${id}/`),
    api('materia/autoria/', { materia: id, page_size: 50 }).catch(() => ({ results: [] })),
    api('materia/tramitacao/', { materia: id, page_size: 100 }).catch(() => ({ results: [] })),
    lookups.status().catch(() => ({})),
    lookups.unidades().catch(() => ({})),
    lookups.autores().catch(() => []),
  ]);
  if (token !== navToken) return;
  const docs = await api('materia/documentoacessorio/', { materia: id, page_size: 50 }).catch(() => ({ results: [] }));
  if (token !== navToken) return;

  const titulo = prettyMateria(mt.__str__);
  setHeader(titulo, KICKER, true);

  const autoresHTML = (aut.results || []).map((a) => {
    const au = autores.find((x) => x.id === a.autor);
    if (!au) return '';
    const nome = esc(nice(au.nome));
    return au.tipo === 2 ? `<a href="#/vereador/${au.obj}">${nome}</a>` : nome;
  }).filter(Boolean).join(', ') || '—';

  const trams = sortTram(tram.results || []);
  const ult = trams[0];

  const fav = Favs.has(mt.id);
  if (fav && ult) Favs.update(mt.id, { seen: ult.id, last: ult.id, lastStatus: status[ult.status] || '', lastDate: ult.data_tramitacao });

  const links = [];
  if (mt.texto_original) links.push(`<a class="chip" href="${esc(https(mt.texto_original))}" target="_blank" rel="noopener">📄 Texto original (PDF)</a>`);
  for (const d of (docs.results || [])) {
    if (d.arquivo) links.push(`<a class="chip" href="${esc(https(d.arquivo))}" target="_blank" rel="noopener">📎 ${esc(cut(nice(d.nome || 'Documento'), 40))}</a>`);
  }
  links.push(`<a class="chip" href="${SAPL}/materia/${mt.id}" target="_blank" rel="noopener">🔗 Ver no SAPL</a>`);

  const timeline = trams.length ? `<ul class="timeline">${trams.map((t) => `
      <li><div class="when">${esc(fmtDate(t.data_tramitacao))}${t.urgente ? ' · <span style="color:var(--warn)">urgente</span>' : ''}</div>
        <div class="what">${esc(nice(status[t.status] || 'Tramitação'))}</div>
        ${unidades[t.unidade_tramitacao_destino] ? `<div class="where">→ ${esc(shortUnidade(unidades[t.unidade_tramitacao_destino]))}</div>` : ''}
        ${t.texto ? `<div class="txt">${esc(cut(t.texto, 300))}</div>` : ''}</li>`).join('')}</ul>`
    : '<div class="empty" style="padding:16px">Nenhuma tramitação registrada.</div>';

  render(`<div class="detail">
      <h2>${esc(titulo)}</h2>
      ${mt.ementa ? `<p class="ementa">${esc(sentence(mt.ementa))}</p>` : ''}
      <dl class="kv">
        <dt>Autoria</dt><dd>${autoresHTML}</dd>
        <dt>Apresentada</dt><dd>${esc(fmtDate(mt.data_apresentacao)) || '—'}</dd>
        ${ult ? `<dt>Situação</dt><dd><span class="badge">${esc(nice(status[ult.status] || '—'))}</span></dd>` : ''}
        ${ult && unidades[ult.unidade_tramitacao_destino] ? `<dt>Onde está</dt><dd>${esc(shortUnidade(unidades[ult.unidade_tramitacao_destino]))}</dd>` : ''}
        ${mt.observacao ? `<dt>Observação</dt><dd>${esc(mt.observacao)}</dd>` : ''}
      </dl>
      <div class="links">${links.join('')}</div>
      <button class="fav ${fav ? 'on' : ''}" id="fav">${fav ? '⭐ Acompanhando' : '☆ Acompanhar esta matéria'}</button>
      <div class="section-title">Tramitação</div>
      ${timeline}
    </div>${footHTML}`, token);

  document.getElementById('fav').onclick = (ev) => {
    const on = Favs.toggle(mt.id, {
      titulo, ementa: cut(sentence(mt.ementa), 200),
      seen: ult ? ult.id : null, last: ult ? ult.id : null,
      lastStatus: ult ? status[ult.status] || '' : '', lastDate: ult ? ult.data_tramitacao : '',
    });
    ev.currentTarget.classList.toggle('on', on);
    ev.currentTarget.textContent = on ? '⭐ Acompanhando' : '☆ Acompanhar esta matéria';
  };
}

/* ---------- Vereadores ---------- */

function avatar(v, big) {
  return v.foto
    ? `<img class="avatar${big ? ' big' : ''}" src="${esc(v.foto)}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'avatar${big ? ' big' : ''}'}))">`
    : `<div class="avatar${big ? ' big' : ''}"></div>`;
}

async function viewVereadores(m, token) {
  setHeader('Vereadores');
  render(loadingHTML(), token);
  const v = await lookups.vereadores();
  render(`<div class="section-title">${esc(v.legislatura)}ª Legislatura · ${esc(v.inicio.slice(0, 4))}–${esc(v.fim.slice(0, 4))}</div>
    <div class="grid">${v.lista.map((p) => `
      <a class="person" href="#/vereador/${p.pid}">${avatar(p)}
        <div class="name">${esc(p.nome)}</div>
        <div class="sub">${p.titular ? 'Vereador(a)' : 'Suplente'}</div></a>`).join('')}</div>${footHTML}`, token);
}

async function viewVereador(m, token) {
  const pid = Number(m[1]);
  setHeader('Vereador', KICKER, true);
  render(loadingHTML(), token);
  const [v, autores] = await Promise.all([lookups.vereadores().catch(() => ({ lista: [] })), lookups.autores()]);
  let p = v.lista.find((x) => x.pid === pid);
  if (!p) {
    const d = await api(`parlamentares/parlamentar/${pid}/`);
    const a = autores.find((x) => x.tipo === 2 && x.obj === pid);
    p = { pid, nome: d.nome_parlamentar || d.nome_completo, completo: d.nome_completo, foto: https(d.fotografia), autorId: a ? a.id : null, titular: true };
  }
  if (token !== navToken) return;
  setHeader(p.nome, KICKER, true);

  if (!p.autorId) {
    render(`<div class="center">${avatar(p, true)}<h2 style="margin:6px 0 2px">${esc(p.nome)}</h2></div>
      <div class="empty">Esse parlamentar ainda não está cadastrado como autor de matérias no SAPL.</div>${footHTML}`, token);
    return;
  }

  const ano = new Date().getFullYear();
  const count = (extra) => api('materia/materialegislativa/', { autores: p.autorId, page_size: 1, ...extra })
    .then((j) => (j.pagination ? j.pagination.total_entries : 0)).catch(() => '—');
  const [total, doAno, ind, req, recentes] = await Promise.all([
    count({}), count({ ano }), count({ tipo: 5 }), count({ tipo: 2 }),
    api('materia/materialegislativa/', { autores: p.autorId, o: '-data_apresentacao', page_size: 10 }),
  ]);
  const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('pt-BR') : n);

  render(`<div class="center">${avatar(p, true)}
      <h2 style="margin:6px 0 2px">${esc(p.nome)}</h2>
      ${p.completo && p.completo !== p.nome ? `<div style="color:var(--muted);font-size:14px">${esc(p.completo)}</div>` : ''}</div>
    <div class="stats">
      <div class="stat"><b>${fmt(total)}</b><span>matérias no total</span></div>
      <div class="stat"><b>${fmt(doAno)}</b><span>apresentadas em ${ano}</span></div>
      <div class="stat"><b>${fmt(ind)}</b><span>indicações</span></div>
      <div class="stat"><b>${fmt(req)}</b><span>requerimentos</span></div>
    </div>
    <div class="section-title">Matérias mais recentes</div>
    ${(recentes.results || []).map(materiaCard).join('') || '<div class="empty">Nenhuma matéria encontrada.</div>'}
    ${total > 10 ? `<a class="btn" href="#/materias?autor=${p.autorId}">Ver todas as matérias</a>` : ''}
    ${footHTML}`, token);
}

/* ---------- Salvos ---------- */

function salvosHTML() {
  const f = Favs.all();
  const ids = Object.keys(f).sort((a, b) => (f[b].lastDate || '').localeCompare(f[a].lastDate || ''));
  if (!ids.length) {
    return `<div class="empty">⭐<br><br>Nenhuma matéria salva ainda.<br>Abra uma matéria e toque em
      <b style="color:var(--accent)">Acompanhar</b>. Quando ela andar, ela aparece aqui com o selo <b>Novidade</b>.</div>`;
  }
  return ids.map((id) => {
    const x = f[id];
    const novo = x.last && x.seen !== x.last;
    return `<a class="card" href="#/materia/${id}">
      <h3>${esc(x.titulo)}</h3>
      ${x.ementa ? `<p>${esc(x.ementa)}</p>` : ''}
      <div class="meta">${novo ? '<span class="badge new">Novidade</span>' : ''}
        ${x.lastStatus ? `<span class="badge muted">${esc(cut(nice(x.lastStatus), 44))}</span>` : ''}
        ${x.lastDate ? `<span>${esc(fmtDate(x.lastDate))}</span>` : ''}</div></a>`;
  }).join('');
}

async function viewSalvos(m, token) {
  setHeader('Salvos');
  render(`<div class="section-title">Matérias que você acompanha</div><div id="favs">${salvosHTML()}</div>${footHTML}`, token);
  await refreshFavs().catch(() => {});
  if (token !== navToken) return;
  const el = document.getElementById('favs');
  if (el) el.innerHTML = salvosHTML();
}

/* ---------- roteador ---------- */

const routes = [
  [/^#\/sessoes$/, viewSessoes, 'sessoes'],
  [/^#\/sessao\/(\d+)$/, viewSessao, 'sessoes'],
  [/^#\/materias(?:\?(.*))?$/, viewMaterias, 'materias'],
  [/^#\/materia\/(\d+)$/, viewMateria, 'materias'],
  [/^#\/vereadores$/, viewVereadores, 'vereadores'],
  [/^#\/vereador\/(\d+)$/, viewVereador, 'vereadores'],
  [/^#\/salvos$/, viewSalvos, 'salvos'],
];

async function router() {
  const h = location.hash || '#/sessoes';
  const token = ++navToken;
  for (const [re, fn, tab] of routes) {
    const m = h.match(re);
    if (!m) continue;
    setTab(tab);
    window.scrollTo(0, 0);
    try { await fn(m, token); } catch (e) { render(errorHTML(e), token); }
    return;
  }
  location.replace('#/sessoes');
}

window.addEventListener('hashchange', () => { inAppNav++; router(); });

/* ---------- internet / offline ---------- */

function netStatus() { document.getElementById('offline').hidden = navigator.onLine; }
window.addEventListener('online', () => { netStatus(); });
window.addEventListener('offline', netStatus);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

/* ---------- início ---------- */

netStatus();
updateDot();
inAppNav = 1;
router();
refreshFavs().then(updateDot).catch(() => {});
