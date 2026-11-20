// "Discover" tab: my own watch-list (movies I haven't seen yet) + Christmas movie suggestions from TMDB.
// Tick the box on anything to drop it into the ranked list as NR (and into the randomizer).
import * as S from './store.js';
import * as T from './tmdb.js';
import { $, $$, esc, poster, toast } from './ui.js';
import { openAdd } from './detail.js';

const MODES = [['popular', 'Popular'], ['recent', 'Recent'], ['new', 'This year & upcoming']];
const sug = { mode: 'popular', page: 0, total: 1, items: [], loading: false, error: null, started: false };
export const busy = () => false;

const visible = () => {
  const st = S.getState();
  return sug.items.filter(r => !S.seen(r.tmdbId) && !st.dismissed.includes(r.tmdbId));
};

export function render(root) {
  const st = S.getState();
  const q = st.queue;
  const vis = visible();
  root.innerHTML = `
    <section class="view">
      <h2 class="sect">🎁 My watch list <small>${q.length}</small></h2>
      <p class="muted small">Movies I haven't seen yet. Tick one to move it into my ranked list as NR.</p>
      ${q.length ? `<ul class="rows">${q.map(m => cardHTML(m, 'q')).join('')}</ul>` : '<p class="muted center">Nothing here yet.</p>'}
      <button class="btn ghost wide" id="addq">＋ Add to my watch list</button>

      <h2 class="sect">✨ Suggestions</h2>
      ${T.hasKey() ? `
        <div class="chips pick">${MODES.map(([k, l]) => `<button data-mode="${k}" class="chip ${sug.mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        ${sug.error ? `<div class="note">${esc(sug.error)} <button class="linkbtn" id="retry">Try again</button></div>` : ''}
        ${vis.length ? `<ul class="rows">${vis.map(m => cardHTML(m, 's')).join('')}</ul>` : ''}
        ${sug.loading ? '<p class="muted center">Looking for Christmas movies…</p>' : ''}
        ${!sug.loading && !vis.length && !sug.error && sug.started ? '<p class="muted center">Nothing new here. Try another tab above.</p>' : ''}
        ${!sug.loading && sug.page < sug.total && sug.started && vis.length ? '<button class="btn wide" id="more">Show more</button>' : ''}
        <p class="tiny muted center">Movie data from TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      ` : `<div class="note" data-goto="more">🔑 Add your free TMDB key in <b>More</b> to see Christmas movie suggestions.</div>`}
    </section>`;

  $('#addq', root).onclick = () => openAdd('queue');
  $$('[data-mode]', root).forEach(b => b.onclick = () => {
    if (sug.mode === b.dataset.mode) return;
    Object.assign(sug, { mode: b.dataset.mode, page: 0, total: 1, items: [], error: null });
    load(root);
  });
  const more = $('#more', root); if (more) more.onclick = () => load(root);
  const retry = $('#retry', root); if (retry) retry.onclick = () => { sug.error = null; load(root); };

  if (T.hasKey() && !sug.started && !sug.loading) { sug.started = true; load(root); }
}

function cardHTML(m, kind) {
  const id = kind === 'q' ? m.id : m.tmdbId;
  return `<li class="row card" data-kind="${kind}" data-id="${id}">
    ${poster(m, 'w185', 'thumb')}
    <div class="info">
      <div class="title">${esc(m.title)} ${m.year ? `<span class="yr">${m.year}</span>` : ''}</div>
      ${m.overview ? `<div class="muted small clamp2">${esc(m.overview)}</div>` : ''}
      <button class="linkbtn x-btn" data-del title="${kind === 'q' ? 'Remove' : 'Not interested'}">${kind === 'q' ? 'Remove' : 'Not interested'}</button>
    </div>
    <label class="addchk"><input type="checkbox" data-add><span class="box"></span><small>Add to list</small></label>
  </li>`;
}

async function load(root) {
  if (sug.loading) return;
  sug.loading = true; sug.error = null;
  if ($('#view')) render(root);
  try {
    let guard = 0;
    do {
      sug.page++;
      const d = await T.discoverChristmas({ mode: sug.mode, page: sug.page });
      sug.total = d.total;
      const have = new Set(sug.items.map(x => x.tmdbId));
      sug.items.push(...d.results.filter(r => !have.has(r.tmdbId)));
      guard++;
    } while (visible().length < 8 && sug.page < sug.total && guard < 4);
  } catch (e) { sug.error = T.friendlyError(e); sug.page = Math.max(0, sug.page - 1); }
  sug.loading = false;
  if ($('#view .view') && $('#addq')) render(root);
}

let bound = false;
export function bind() {
  if (bound) return; bound = true;
  const view = $('#view');
  view.addEventListener('change', (e) => {
    const cb = e.target.closest('input[data-add]');
    if (!cb) return;
    const row = cb.closest('.row');
    const kind = row.dataset.kind;
    row.classList.add('leaving');
    setTimeout(() => {
      let id, title;
      if (kind === 'q') {
        const m = S.getState().queue.find(x => x.id === row.dataset.id);
        title = m && m.title;
        id = S.promoteQueue(row.dataset.id);
      } else {
        const r = sug.items.find(x => x.tmdbId === +row.dataset.id);
        if (!r || S.seen(r.tmdbId)) return;
        title = r.title;
        id = S.addMovie({ tmdbId: r.tmdbId, title: r.title, year: r.year, poster: r.poster, overview: r.overview });
      }
      if (id) { T.refreshProviders([id]); toast(`${title} added as NR · it's in the randomizer`); }
    }, 320);
  });
  view.addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (!del) return;
    const row = del.closest('.row');
    if (row.dataset.kind === 'q') S.removeQueue(row.dataset.id);
    else S.dismiss(+row.dataset.id);
  });
}
