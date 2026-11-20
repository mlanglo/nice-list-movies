// "My List" tab: the ranking, then NR (not yet ranked) movies at the bottom. Drag the ⠿ handle to reorder.
import * as S from './store.js';
import * as T from './tmdb.js';
import { $, $$, esc, poster, providerStrip, toast } from './ui.js';
import { openDetail, openAdd, openImport } from './detail.js';

let filter = 'all', q = '', dragging = false;
export const busy = () => dragging;

export function render(root) {
  root.innerHTML = `
    <section class="view">
      ${T.hasKey() ? '' : `<div class="note" data-goto="more">🔑 Add your free TMDB key in <b>More</b> to get covers and streaming info.</div>`}
      <div class="toolbar">
        <div class="seg">${[['all', 'All'], ['todo', 'To watch'], ['done', 'Watched']].map(([f, l]) =>
          `<button data-f="${f}" class="${filter === f ? 'on' : ''}">${l}</button>`).join('')}</div>
        <button class="btn gold" id="add">＋ Add</button>
      </div>
      <input class="search" id="q" type="search" placeholder="Search my list…" value="${esc(q)}">
      <div id="rows"></div>
    </section>`;
  drawRows(root);

  $('#add', root).onclick = () => openAdd('list');
  $('#q', root).oninput = (e) => { q = e.target.value; drawRows(root); };
  $$('.seg button', root).forEach(b => b.onclick = () => {
    filter = b.dataset.f;
    $$('.seg button', root).forEach(x => x.classList.toggle('on', x === b));
    drawRows(root);
  });
}

function rowHTML(id, { rank, drag }) {
  const m = S.getState().movies[id];
  const year = S.currentYear();
  const w = S.isWatched(id, year);
  const note = m.notes && m.notes.trim();
  return `<li class="row ${w ? 'watched' : ''}" data-id="${id}">
    ${drag ? `<button class="handle" aria-label="Drag to reorder" title="Drag to reorder">⠿</button>` : '<span class="handle-gap"></span>'}
    <div class="rank ${rank ? '' : 'nr'}">${rank || 'NR'}</div>
    <div class="open">${poster(m, 'w185', 'thumb')}</div>
    <div class="info open">
      <div class="title">${esc(m.title)} ${m.year ? `<span class="yr">${m.year}</span>` : ''}</div>
      <div class="meta">${providerStrip(m, 3)}${note ? '<span class="tag note-tag" title="Has notes">📝</span>' : ''}${w && !rank ? '<span class="tag ok">Watched · rank it!</span>' : ''}</div>
    </div>
    <label class="check" aria-label="Watched in ${year}"><input type="checkbox" data-watch ${w ? 'checked' : ''}><span class="box"></span></label>
  </li>`;
}

function drawRows(root) {
  const st = S.getState();
  const year = S.currentYear();
  const box = $('#rows', root);
  const total = st.ranked.length + st.nr.length;

  if (!total) {
    box.innerHTML = `<div class="empty">
      <div class="big-emoji">🎄</div>
      <h2>Your list is empty</h2>
      <p class="muted">Paste your whole ranked list at once, or add movies one by one.</p>
      <button class="btn big gold" id="e-import">Import my list</button>
      <button class="btn big ghost" id="e-add">Add a movie</button></div>`;
    $('#e-import', box).onclick = openImport;
    $('#e-add', box).onclick = () => openAdd('list');
    return;
  }

  const ok = (id) => {
    const m = st.movies[id];
    if (q && !m.title.toLowerCase().includes(q.trim().toLowerCase())) return false;
    const w = S.isWatched(id, year);
    return filter === 'all' || (filter === 'todo' && !w) || (filter === 'done' && w);
  };
  const nr = st.nr.filter(ok);
  const ranked = st.ranked.filter(ok);
  const canDrag = filter === 'all' && !q.trim();
  const pos = new Map(st.ranked.map((id, i) => [id, i + 1]));

  let html = '', nrHtml = '';
  if (nr.length) nrHtml = `<h2 class="sect">NR · not ranked yet <small>${nr.length}</small></h2>
    <ul class="rows">${nr.map(id => rowHTML(id, { rank: null, drag: false })).join('')}</ul>`;
  if (ranked.length) html += `<h2 class="sect">My ranking <small>${ranked.length}${ranked.length !== st.ranked.length ? ' of ' + st.ranked.length : ''}</small></h2>
    <ul class="rows" id="ranked">${ranked.map(id => rowHTML(id, { rank: pos.get(id), drag: canDrag })).join('')}</ul>`;
  html += nrHtml; // NR movies sit below the ranking
  if (!nr.length && !ranked.length) html = `<p class="muted center">${q ? 'No movies match that search.' : filter === 'todo' ? '🎉 You\'ve watched everything this year!' : 'Nothing checked off yet.'}</p>`;
  box.innerHTML = html;
}

// ---------- interactions (delegated, bound once) ----------
let bound = false;
export function bind() {
  if (bound) return; bound = true;
  const view = $('#view');

  view.addEventListener('click', (e) => {
    const g = e.target.closest('[data-goto]');
    if (g) { window.dispatchEvent(new CustomEvent('yr:goto', { detail: g.dataset.goto })); return; }
    const row = e.target.closest('.row[data-id]');
    if (row && e.target.closest('.open')) openDetail(row.dataset.id);
  });

  view.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-watch]');
    if (!cb) return;
    const row = cb.closest('.row'), id = row.dataset.id, year = S.currentYear();
    const wasNR = !S.rankOf(id);
    S.setWatched(id, year, cb.checked);
    if (cb.checked) {
      const t = S.getState().movies[id].title;
      wasNR
        ? toast(`✓ ${t} watched! Ready to rank it?`, { action: 'Rank it', onAction: () => openDetail(id), ms: 6000 })
        : toast(`✓ ${t} checked off for ${year}`);
    }
  });

  // drag to reorder
  view.addEventListener('pointerdown', (e) => {
    const h = e.target.closest('.handle');
    if (!h || e.button > 0) return;
    e.preventDefault();
    startDrag(e, h);
  });
}

function startDrag(e, handle) {
  const rowEl = handle.closest('.row');
  const list = rowEl.parentElement;
  const rows = [...list.children];
  const from = rows.indexOf(rowEl);
  const id = rowEl.dataset.id;
  const rects = rows.map(r => { const b = r.getBoundingClientRect(); return { top: b.top + scrollY, h: b.height }; });
  const gap = rows.length > 1 ? rects[1].top - (rects[0].top + rects[0].h) : 0;
  const hgt = rects[from].h + gap;
  const startY = e.clientY, startScroll = scrollY;
  let pointerY = startY, to = from, raf;

  dragging = true;
  rowEl.classList.add('dragging');
  list.classList.add('is-dragging');
  document.body.classList.add('no-select');
  try { handle.setPointerCapture(e.pointerId); } catch (_) {}

  const update = () => {
    const dy = (pointerY - startY) + (scrollY - startScroll);
    rowEl.style.transform = `translateY(${dy}px)`;
    const center = rects[from].top + rects[from].h / 2 + dy;
    to = 0;
    rects.forEach((r, i) => { if (i !== from && r.top + r.h / 2 < center) to++; });
    rows.forEach((r, i) => {
      if (i === from) return;
      let shift = 0;
      if (from < to && i > from && i <= to) shift = -hgt;
      else if (from > to && i >= to && i < from) shift = hgt;
      r.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  const loop = () => {
    const edge = 110, vh = innerHeight;
    if (pointerY < edge + 70) scrollBy(0, -Math.ceil((edge + 70 - pointerY) / 7));
    else if (pointerY > vh - edge - 40) scrollBy(0, Math.ceil((pointerY - (vh - edge - 40)) / 7));
    update();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const move = (ev) => { pointerY = ev.clientY; };
  const end = () => {
    cancelAnimationFrame(raf);
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    document.body.classList.remove('no-select');
    dragging = false;
    rows.forEach(r => { r.style.transform = ''; r.classList.remove('dragging'); });
    list.classList.remove('is-dragging');
    if (to !== from) {
      S.moveTo(id, to + 1);
      const m = S.getState().movies[id];
      toast(`${m.title} → #${to + 1}`);
    } else window.dispatchEvent(new Event('yr:idle'));
  };
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}
