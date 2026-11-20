// Sheets: movie detail (rank, notes, streaming), add-a-movie search, and bulk list import.
import * as S from './store.js';
import * as T from './tmdb.js';
import { $, $$, esc, poster, openSheet, toast, sleep, streamers } from './ui.js';

// ============ movie detail ============
export function openDetail(id) {
  const sh = openSheet('', { cls: 'detail' });
  let notesTimer;

  const draw = () => {
    const st = S.getState();
    const m = st.movies[id];
    if (!m) { sh.close(); return; }
    const year = S.currentYear();
    const watched = S.isWatched(id, year);
    const pos = S.rankOf(id);
    const n = st.ranked.length;
    const hist = S.watchYears(id);
    sh.set(`
      <div class="d-head">
        ${poster(m, 'w342', 'd-poster')}
        <div>
          <h2>${esc(m.title)}</h2>
          <div class="muted">${m.year || 'Year unknown'}${pos ? ` · Rank #${pos}` : ' · <b class="nrtag">NR</b>'}</div>
          ${m.overview ? `<p class="overview">${esc(m.overview)}</p>` : ''}
        </div>
      </div>
      <button class="btn big ${watched ? 'on' : ''}" data-act="watch">${watched ? `✓ Watched in ${year}` : `Mark watched in ${year}`}</button>
      ${hist.length ? `<div class="chips">${hist.map(y => `<span class="chip">🎄 ${y}</span>`).join('')}</div>` : ''}

      <h3>Where to watch</h3>
      ${providersBlock(m)}

      <h3>Ranking</h3>
      ${pos ? `
        <div class="rank-ctl">
          <button class="btn sm" data-act="up" ${pos === 1 ? 'disabled' : ''}>▲ Up</button>
          <button class="btn sm" data-act="down" ${pos === n ? 'disabled' : ''}>▼ Down</button>
          <span class="muted">of ${n}</span>
        </div>` : `<p class="muted">Not ranked yet. It's already in the randomizer. Slot it in once you've seen it.</p>`}
      <div class="rank-ctl">
        <label>${pos ? 'Move to' : 'Rank at'} #
          <input id="rk" type="number" inputmode="numeric" min="1" max="${n + (pos ? 0 : 1)}" value="${pos || n + 1}"></label>
        <button class="btn sm gold" data-act="goto">${pos ? 'Move' : 'Rank it'}</button>
        ${pos ? `<button class="btn sm ghost" data-act="unrank">Back to NR</button>` : ''}
      </div>
      <div id="between" class="muted small"></div>

      <h3>My notes</h3>
      <textarea id="notes" rows="3" placeholder="Favorite scene, who you watched with, snacks…">${esc(m.notes || '')}</textarea>

      <details class="fix">
        <summary>Wrong cover or details?</summary>
        <div class="row-inline"><input id="rm-q" value="${esc(m.title)}"><button class="btn sm" data-act="rm-search">Search</button></div>
        <div id="rm-res"></div>
        <div class="row-inline"><input id="cover-url" placeholder="…or paste an image link"><button class="btn sm" data-act="cover">Use</button></div>
      </details>
      <button class="btn danger" data-act="remove">Remove from my list</button>
    `);
    between();
    // Fetch streaming info if we don't have it yet (or region changed).
    const p = m.providers;
    if (T.hasKey() && m.tmdbId && (!p || p.region !== st.settings.region)) {
      T.refreshProviders([id]);
      setTimeout(() => $('#between', sh.el) && draw(), 1800); // redraw once it has had time to arrive
    }
  };

  function between() {
    const box = $('#between', sh.el), inp = $('#rk', sh.el);
    if (!box || !inp) return;
    const others = S.getState().ranked.filter(x => x !== id);
    const p = Math.min(Math.max(1, +inp.value || 1), others.length + 1);
    const a = S.getState().movies[others[p - 2]], b = S.getState().movies[others[p - 1]];
    box.textContent = !others.length ? 'This will be #1.'
      : `Lands ${a ? `below “${a.title}”` : 'at the very top'}${b ? ` and above “${b.title}”` : ' at the very bottom'}.`;
  }

  sh.el.addEventListener('input', (e) => {
    if (e.target.id === 'rk') between();
    if (e.target.id === 'notes') {
      clearTimeout(notesTimer);
      const v = e.target.value;
      notesTimer = setTimeout(() => S.updateItem(id, { notes: v }), 400);
    }
  });
  sh.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act, year = S.currentYear(), pos = S.rankOf(id);
    if (act === 'watch') { S.setWatched(id, year, !S.isWatched(id, year)); draw(); }
    else if (act === 'up') { S.moveTo(id, pos - 1); draw(); }
    else if (act === 'down') { S.moveTo(id, pos + 1); draw(); }
    else if (act === 'goto') {
      const v = +$('#rk', sh.el).value;
      const others = S.getState().ranked.filter(x => x !== id).length;
      S.moveTo(id, Math.min(Math.max(1, v || 1), others + 1));
      toast(`Ranked #${S.rankOf(id)}`);
      draw();
    }
    else if (act === 'unrank') { S.unrank(id); draw(); }
    else if (act === 'remove') {
      const m = S.getState().movies[id];
      if (confirm(`Remove “${m.title}” and its watch history?`)) { S.removeMovie(id); sh.close(); toast('Removed'); }
    }
    else if (act === 'cover') {
      const u = $('#cover-url', sh.el).value.trim();
      if (/^https?:\/\//i.test(u)) { S.updateItem(id, { customPoster: u }); draw(); } else toast('Paste a full image link starting with http');
    }
    else if (act === 'rm-search') {
      const res = $('#rm-res', sh.el);
      res.innerHTML = '<p class="muted">Searching…</p>';
      try {
        const list = await T.searchMovies($('#rm-q', sh.el).value.trim());
        res.innerHTML = list.length ? list.slice(0, 8).map(r => resultRow(r, `<button class="btn sm gold" data-act="rm-pick" data-i="${r.tmdbId}">Use</button>`)).join('') : '<p class="muted">No matches.</p>';
        res._list = list;
      } catch (err) { res.innerHTML = `<p class="muted">${esc(T.friendlyError(err))}</p>`; }
    }
    else if (act === 'rm-pick') {
      const r = $('#rm-res', sh.el)._list.find(x => x.tmdbId === +b.dataset.i);
      if (r) {
        S.updateItem(id, { tmdbId: r.tmdbId, title: r.title, year: r.year, poster: r.poster, overview: r.overview, customPoster: null, providers: null });
        T.refreshProviders([id], { force: true });
        toast('Updated'); draw();
      }
    }
  });

  draw();
  return sh;
}

function providersBlock(m) {
  if (!T.hasKey()) return `<p class="muted">Add your TMDB key in the More tab to see streaming info.</p>`;
  if (!m.tmdbId) return `<p class="muted">Match this movie below to see where it's streaming.</p>`;
  const p = m.providers;
  if (!p) return `<p class="muted">Checking streaming…</p>`;
  const chip = (x) => `<span class="pchip"><img src="${S.IMG}/w45${x.logo}" alt=""><span>${esc(x.name)}</span></span>`;
  const group = (label, arr) => arr.length ? `<div class="pgroup"><b>${label}</b><div>${arr.map(chip).join('')}</div></div>` : '';
  const st = streamers(p);
  const body = group('Stream', st) + group('Rent', p.rent || []) + group('Buy', p.buy || []);
  return (body || `<p class="muted">Not available in ${esc(p.region)} right now.</p>`) +
    (p.link ? `<a class="small" href="${esc(p.link)}" target="_blank" rel="noopener">See all options ↗</a>` : '') +
    `<div class="tiny muted">Streaming data from JustWatch via TMDB · ${esc(p.region)}</div>`;
}

function resultRow(r, action, note = '') {
  return `<div class="res">
    ${poster({ title: r.title, poster: r.poster }, 'w92', 'thumb sm')}
    <div class="info"><div class="title">${esc(r.title)} <span class="yr">${r.year || ''}</span></div>
      <div class="muted small clamp2">${esc(note || r.overview)}</div></div>${action}</div>`;
}

// ============ add a movie (search TMDB) ============
export function openAdd(mode = 'list') {
  const toQueue = mode === 'queue';
  const sh = openSheet(`
    <h2>${toQueue ? 'Add to my watch list' : 'Add a movie'}</h2>
    <p class="muted small">${toQueue
      ? "Movies you want to see. Tick them later to move them into your ranked list."
      : 'New movies land as <b class="nrtag">NR</b> and go straight into the randomizer.'}</p>
    ${T.hasKey() ? '' : `<p class="note">No TMDB key yet, so no covers or search. You can still add a title by name; add the key in <b>More</b> later and use “Find missing covers”.</p>`}
    <div class="row-inline"><input id="aq" type="search" placeholder="Movie title…" autocomplete="off" enterkeyhint="search"><button class="btn gold" id="ago">Search</button></div>
    <div id="ares"></div>
    <button class="btn ghost" id="manual" hidden></button>
    <hr><button class="linkbtn" id="bulk">Paste a whole list instead</button>
  `, { cls: 'add' });
  const input = $('#aq', sh.el), res = $('#ares', sh.el), manual = $('#manual', sh.el);
  let list = [], tm;

  const addedMsg = toQueue ? 'Added to your watch list' : 'Added as NR · in the randomizer';
  function mark(btn) { btn.outerHTML = '<span class="tag ok">Added ✓</span>'; }

  async function search() {
    const q = input.value.trim();
    manual.hidden = !q;
    manual.textContent = `Add “${q}” without a cover`;
    if (!q || !T.hasKey()) { res.innerHTML = ''; return; }
    res.innerHTML = '<p class="muted">Searching…</p>';
    try {
      const yr = (q.match(/\b(19|20)\d\d\b/) || [])[0];
      list = await T.searchMovies(q.replace(/\b(19|20)\d\d\b/, '').trim() || q, yr);
      res.innerHTML = list.length ? list.slice(0, 10).map(r => {
        const have = S.seen(r.tmdbId);
        return resultRow(r, have ? '<span class="tag">In list</span>' : `<button class="btn sm gold" data-i="${r.tmdbId}">Add</button>`);
      }).join('') : '<p class="muted">No matches. Try fewer words, or add it by name below.</p>';
    } catch (e) { res.innerHTML = `<p class="note">${esc(T.friendlyError(e))}</p>`; }
  }
  input.addEventListener('input', () => { clearTimeout(tm); manual.hidden = !input.value.trim(); manual.textContent = `Add “${input.value.trim()}” without a cover`; tm = setTimeout(search, 450); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { clearTimeout(tm); search(); } });
  $('#ago', sh.el).onclick = () => { clearTimeout(tm); search(); };
  $('#bulk', sh.el).onclick = () => { sh.close(); openImport(); };

  res.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const r = list.find(x => x.tmdbId === +b.dataset.i);
    if (!r) return;
    const data = { tmdbId: r.tmdbId, title: r.title, year: r.year, poster: r.poster, overview: r.overview };
    const id = toQueue ? S.addQueue(data) : S.addMovie(data);
    T.refreshProviders([id]);
    mark(b); toast(addedMsg);
  });
  manual.onclick = () => {
    const t = input.value.trim();
    if (!t) return;
    const data = { title: t.replace(/\s*\(?\b((?:19|20)\d\d)\)?\s*$/, ''), year: +((t.match(/\b((?:19|20)\d\d)\)?\s*$/) || [])[1]) || null };
    toQueue ? S.addQueue(data) : S.addMovie(data);
    toast(addedMsg); input.value = ''; manual.hidden = true; res.innerHTML = ''; input.focus();
  };
  setTimeout(() => input.focus(), 250);
  return sh;
}

// ============ bulk import: paste a ranked list ============
export function parseList(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(raw => {
    let t = raw;
    const watched = /^[\s•\-*]*[✓✔☑✅]/.test(t) || /[✓✔☑✅]\s*$/.test(t);
    t = t.replace(/[✓✔☑✅☐⬜]/g, '').replace(/^[\s•\-*]+/, '');
    t = t.replace(/^\d{1,3}\s*[.)\]:\-–]\s*/, '');           // "12. " "12) " "12 - "
    const ym = t.match(/[(\[]\s*((?:19|20)\d\d)\s*[)\]]\s*$/) || t.match(/\s[-–,]\s*((?:19|20)\d\d)\s*$/);
    const year = ym ? +ym[1] : null;
    if (ym) t = t.slice(0, ym.index);
    return { raw, title: t.trim(), year, watched };
  }).filter(x => x.title);
}

export function openImport() {
  const sh = openSheet('', { cls: 'import' });
  const year = S.currentYear();
  const step1 = () => sh.set(`
    <h2>Import your list</h2>
    <p class="muted small">One movie per line, best first. Numbers (“1.”), years (“Elf (2003)”) and ✓ marks are understood and cleaned up. Covers are matched automatically and you get to review before anything is saved.</p>
    <textarea id="imp" rows="10" placeholder="1. Elf (2003)&#10;2. Home Alone (1990)&#10;3. The Polar Express"></textarea>
    <label class="opt"><input type="checkbox" id="ordered" checked> The list is in ranked order (top = #1). Untick to add everything as NR.</label>
    <label class="opt"><input type="checkbox" id="markw" checked> Mark lines with a ✓ as watched in ${year}</label>
    <button class="btn big gold" id="go">Look up covers &amp; review</button>
    ${T.hasKey() ? '' : '<p class="note">No TMDB key yet, so titles will be added without covers. Add the key in More, then use “Find missing covers”.</p>'}
  `);
  step1();

  sh.el.addEventListener('click', async (e) => {
    if (e.target.id !== 'go') return;
    const items = parseList($('#imp', sh.el).value);
    if (!items.length) { toast('Paste at least one title'); return; }
    const opts = { ordered: $('#ordered', sh.el).checked, markw: $('#markw', sh.el).checked };
    if (!T.hasKey()) return finish(items.map(i => ({ ...i, pick: null, cands: [] })), opts);

    sh.set(`<h2>Matching…</h2><div class="bar"><i id="pb"></i></div><p class="muted" id="pt">0 / ${items.length}</p>`);
    const out = new Array(items.length);
    let done = 0, next = 0, failed = null;
    const worker = async () => {
      while (next < items.length && !failed) {
        const i = next++;
        try {
          const { best, candidates } = await T.matchTitle(items[i].title, items[i].year);
          out[i] = { ...items[i], pick: best, cands: candidates };
        } catch (err) { failed = err; return; }
        done++;
        $('#pb', sh.el) && ($('#pb', sh.el).style.width = (done / items.length * 100) + '%');
        $('#pt', sh.el) && ($('#pt', sh.el).textContent = `${done} / ${items.length}`);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (failed) { sh.set(`<h2>Couldn't finish</h2><p class="note">${esc(T.friendlyError(failed))}</p><button class="btn" id="back">Back</button>`); $('#back', sh.el).onclick = step1; return; }
    review(out, opts);
  });

  function review(rows, opts) {
    const miss = rows.filter(r => !r.pick).length;
    const draw = () => sh.set(`
      <h2>Check the matches</h2>
      <p class="muted small">${rows.length} movies${miss ? ` · ${miss} with no match (they'll be added without a cover)` : ''}. If a cover looks wrong, change it from the menu on that row.</p>
      <div class="rev">${rows.map((r, i) => `
        <div class="res">
          ${poster({ title: r.title, poster: r.pick && r.pick.poster }, 'w92', 'thumb sm')}
          <div class="info"><div class="small muted">${opts.ordered ? '#' + (i + 1) + ' · ' : ''}${esc(r.title)}${r.year ? ` (${r.year})` : ''}${r.watched ? ' ✓' : ''}</div>
            <select data-i="${i}">
              ${r.cands.map((c, k) => `<option value="${k}" ${r.pick === c ? 'selected' : ''}>${esc(c.title)} (${c.year || '?'})</option>`).join('')}
              <option value="-1" ${!r.pick ? 'selected' : ''}>No cover / don't match</option>
            </select></div>
        </div>`).join('')}</div>
      <button class="btn big gold" id="save">Add ${rows.length} movies</button>
    `);
    draw();
    sh.el.onchange = (e) => {
      const s = e.target.closest('select[data-i]');
      if (!s) return;
      const r = rows[+s.dataset.i], k = +s.value;
      r.pick = k < 0 ? null : r.cands[k];
      const th = s.closest('.res').querySelector('.thumb');
      th.replaceWith(Object.assign(document.createElement('div'), { innerHTML: poster({ title: r.title, poster: r.pick && r.pick.poster }, 'w92', 'thumb sm') }).firstChild);
    };
    sh.el.onclick = (e) => { if (e.target.id === 'save') finish(rows, opts); };
  }

  function finish(rows, opts) {
    let added = 0, skipped = 0;
    const newIds = [];
    S.batch(() => {
      const ordered = rows.slice();
      // NR additions unshift, so add in reverse to keep the pasted order on screen.
      (opts.ordered ? ordered : ordered.reverse()).forEach(r => {
        const dupe = (r.pick && S.findByTmdb(r.pick.tmdbId)) ||
          Object.values(S.getState().movies).find(m => m.title.toLowerCase() === (r.pick ? r.pick.title : r.title).toLowerCase() && m.year === (r.pick ? r.pick.year : r.year));
        if (dupe) { skipped++; return; }
        const p = r.pick;
        const id = S.addMovie(
          p ? { tmdbId: p.tmdbId, title: p.title, year: p.year, poster: p.poster, overview: p.overview } : { title: r.title, year: r.year },
          { ranked: opts.ordered });
        if (r.watched && opts.markw) S.setWatched(id, year, true);
        newIds.push(id); added++;
      });
    });
    T.refreshProviders(newIds);
    sh.set(`<h2>🎄 Done!</h2><p>Added <b>${added}</b> movie${added === 1 ? '' : 's'}${skipped ? ` (${skipped} already in your list, skipped)` : ''}.</p>
      ${opts.ordered ? '<p class="muted">They are ranked in the order you pasted. Fine-tune from the list.</p>' : ''}
      <button class="btn big gold" id="ok">See my list</button>`);
    sh.el.onclick = (e) => { if (e.target.id === 'ok') { sh.close(); window.dispatchEvent(new CustomEvent('yr:goto', { detail: 'list' })); } };
  }
  return sh;
}
